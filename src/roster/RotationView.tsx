import { useMemo, useState } from 'react';
import { Button, Toolbar } from '@/components/Button';
import { Footer, Group, Section } from '@/components/List';
import { Switch } from '@/components/Switch';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { playerName, toEnginePlayers, useCurrentPlan, useFormations, useSavePlan } from '@/lineups/api';
import { toEnginePeriods } from '@/lineups/convert';
import { textColor } from '@/sports/colors';
import { SPORTS, chipLabel, periodPlural, periodsNoun } from '@/sports/definitions';
import { periodsHeader, positionName, usedPositions } from '@/sports/positions';
import {
  autoFillAll,
  balance,
  balanceHint,
  counts,
  fixPeriods,
  openCount,
  placePlayer,
  totalLevel,
} from '@/sports/lineup';
import { type Period } from '@/sports/types';
import { type Player } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useEveryoneBack, useSetAvailable } from './api';
import { PositionPickerSheet } from './PositionPickerSheet';

export function RotationView({
  players,
  canEdit,
  highlight,
}: {
  players: Player[];
  canEdit: boolean;
  highlight: ReadonlySet<string>;
}) {
  const { teamId, team, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const toast = useToast();
  const { forms, formationFor } = useFormations();
  const plan = useCurrentPlan(teamId);
  const save = useSavePlan(teamId, plan.gameId);
  const setAvailable = useSetAvailable(teamId);
  const everyoneBack = useEveryoneBack(teamId);
  const [picking, setPicking] = useState<{ player: Player; periodIndex: number } | null>(null);

  const enginePlayers = useMemo(() => toEnginePlayers(players), [players]);
  const periods: Period[] = useMemo(
    () => fixPeriods(toEnginePeriods(plan.periods), forms, S, enginePlayers),
    [plan.periods, forms, S, enginePlayers],
  );
  const c = counts(periods, enginePlayers);
  const N = periods.length;
  const key = useMemo(() => usedPositions(S, periods, formationFor), [S, periods, formationFor]);
  const noun = S.periodName(N).toLowerCase();
  const colors = (team.colors ?? {}) as Record<string, string>;
  const active = players.filter((p) => p.is_available);
  const outs = players.filter((p) => !p.is_available);
  const bal = balance(periods, enginePlayers);

  const commit = (next: Period[], msg?: string) => {
    save.mutate(next, { onError: (e) => toast(errorMessage(e)) });
    if (msg) toast(msg);
  };

  const toggle = (p: Player, on: boolean) => {
    setAvailable.mutate({ id: p.id, available: on }, { onError: (e) => toast(errorMessage(e)) });
    toast(on ? `${p.first_name} is back in` : `${p.first_name} out · positions cleared`);
  };

  const onPick = (slot: number | null) => {
    if (!picking) return;
    const q = periods[picking.periodIndex];
    if (!q) return;
    const f = formationFor(q.formation);
    const r = placePlayer(q, picking.player.id, slot);
    const next = [...periods];
    next[picking.periodIndex] = r.period;
    const code = slot !== null ? (f.positions[slot]?.code ?? '') : '';
    const msg =
      slot === null
        ? `${picking.player.first_name} sits ${noun} ${picking.periodIndex + 1}`
        : r.bumped
          ? `${picking.player.first_name} in at ${code} · ${playerName(players.find((p) => p.id === r.bumped))} unassigned`
          : `${picking.player.first_name} in at ${code}`;
    commit(next, msg);
  };

  const onAutoAll = () => {
    if (!openCount(periods)) {
      toast('No open spots');
      return;
    }
    const r = autoFillAll(periods, forms, S, enginePlayers);
    commit(
      r.periods,
      r.filled ? `${r.filled} spot${r.filled > 1 ? 's' : ''} filled` : 'Nobody left on the bench',
    );
  };

  const row = (p: Player, isOut: boolean) => (
    <div
      key={p.id}
      className={`prow${N > 4 ? ' stack' : ''}${isOut ? ' out' : ''}${highlight.has(p.id) ? ' mine' : ''}`}
    >
      {canEdit && (
        <Switch
          label={
            isOut
              ? `${p.first_name} is out — tap to make active`
              : `${p.first_name} is playing today — tap to mark out`
          }
          size="sm"
          checked={!isOut}
          onChange={(on) => toggle(p, on)}
        />
      )}
      <div className="pname">
        {p.first_name}
        {p.jersey_number && <small>#{p.jersey_number}</small>}
      </div>
      {!isOut && (
        <>
          <div className="qchips">
            {periods.map((q, qi) => {
              const f = formationFor(q.formation);
              const i = q.slots.indexOf(p.id);
              const pos = i < 0 ? undefined : f.positions[i];
              const code = pos?.code ?? '';
              const col = pos ? (colors[S.group(pos.role)] ?? '#888') : undefined;
              const full = pos ? positionName(S, pos.code, pos.role) : '';
              const cls = `qchip${code ? ' on' : ' empty'}${code && q.auto.includes(i) && canEdit ? ' auto' : ''}`;
              const label = `${p.first_name}, ${S.periodName(N)} ${qi + 1}: ${code ? full : 'sitting out'}`;
              return (
                <div key={qi} className="qcell">
                  <span className="qlab">{chipLabel(S, N, qi)}</span>
                  <button
                    type="button"
                    className={cls}
                    style={col ? { background: col, color: textColor(col) } : undefined}
                    aria-label={label}
                    title={full || undefined}
                    onClick={() =>
                      canEdit
                        ? setPicking({ player: p, periodIndex: qi })
                        : toast(
                            code
                              ? `${code} · ${full}`
                              : `${p.first_name} sits out ${S.periodName(N).toLowerCase()} ${qi + 1}`,
                          )
                    }
                  >
                    {code || '–'}
                  </button>
                </div>
              );
            })}
          </div>
          <div
            className={`total ${totalLevel(c[p.id] ?? 0, N)}`}
            aria-label={`${c[p.id] ?? 0} of ${N} ${periodsNoun(S, N)}`}
          >
            {c[p.id] ?? 0}
          </div>
        </>
      )}
    </div>
  );

  const ordered = highlight.size
    ? [...active.filter((p) => highlight.has(p.id)), ...active.filter((p) => !highlight.has(p.id))]
    : active;

  return (
    <>
      {canEdit && (
        <Toolbar>
          <Button variant="tinted" onClick={onAutoAll}>
            Auto-fill open spots
          </Button>
          {outs.length > 0 && (
            <Button
              variant="gray"
              onClick={() =>
                everyoneBack.mutate(undefined, {
                  onError: (e) => toast(errorMessage(e)),
                  onSuccess: () => toast('Everyone is active'),
                })
              }
            >
              Everyone’s back
            </Button>
          )}
        </Toolbar>
      )}
      <Section>Playing time</Section>
      <Group>
        <div className="prow rothead" aria-hidden="true">
          <span className="pname">Player</span>
          <span className="qchips" />
          <span className="total hd">{periodsHeader(S, N)}</span>
        </div>
        {ordered.map((p) => row(p, false))}
        {!active.length && <div className="prow">Add players on the Roster view.</div>}
      </Group>
      {key.length > 0 && (
        <>
          <Section>Position key</Section>
          <Group>
            <dl className="poskey">
              {key.map((k) => {
                const col = colors[S.group(k.role)] ?? '#888';
                return (
                  <div key={k.code}>
                    <dt>
                      <span className="qchip on" style={{ background: col, color: textColor(col) }}>
                        {k.code}
                      </span>
                    </dt>
                    <dd>{k.name}</dd>
                  </div>
                );
              })}
              {canEdit && (
                <div>
                  <dt>
                    <span className="qchip on auto" style={{ background: 'var(--text3)', color: '#fff' }}>
                      ·
                    </span>
                  </dt>
                  <dd>dot = picked by Auto-fill</dd>
                </div>
              )}
            </dl>
          </Group>
        </>
      )}
      {outs.length > 0 && (
        <>
          <Section>Out this game</Section>
          <Group>{outs.map((p) => row(p, true))}</Group>
        </>
      )}
      <Section>Balance</Section>
      <Group>
        <div className="balance">
          {bal ? (
            <>
              <p>
                Range{' '}
                <b>
                  {bal.min}–{bal.max}
                </b>{' '}
                {periodPlural(S, N)} · average <b>{bal.average}</b>
              </p>
              <div
                className="meter"
                role="img"
                aria-label={`Playing time spread: least ${bal.min}, most ${bal.max} ${periodPlural(S, N)}`}
              >
                <i className={bal.spread ? 'spread' : undefined} style={{ width: `${bal.percent}%` }} />
              </div>
              <p>{balanceHint(bal, noun)}</p>
            </>
          ) : (
            <p>{balanceHint(null, noun)}</p>
          )}
        </div>
      </Group>
      <Footer>
        {canEdit
          ? `Tap a ${noun} box to put a player in a position for that ${noun}, or choose * Sitting out to sit them. Picking a position someone else holds swaps them in and leaves the other player unassigned. Auto-fill gives open spots to the players with the fewest ${periodPlural(S, N)}, rotating position groups; a dotted corner marks an auto pick. Mid-${noun} substitutions aren't counted.`
          : `Each box shows the position for that ${noun}; the number at the end is how many ${periodPlural(S, N)} the player is scheduled for. This is the coach's plan and updates live.`}
      </Footer>
      {picking && (
        <PositionPickerSheet
          open
          onClose={() => setPicking(null)}
          title={`${picking.player.first_name} · ${S.periodName(N)} ${picking.periodIndex + 1}`}
          player={picking.player}
          period={periods[picking.periodIndex] ?? { formation: '', slots: [], auto: [] }}
          formation={formationFor(periods[picking.periodIndex]?.formation ?? '')}
          players={players}
          onPick={onPick}
        />
      )}
    </>
  );
}
