import { useMemo } from 'react';
import { LoadingScreen, useIsCoach, useIsStaff } from '@/auth/guards';
import { Button, Toolbar } from '@/components/Button';
import { EditableTitle } from '@/components/EditableTitle';
import { Footer } from '@/components/List';
import { useActionSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { useUIStore } from '@/lib/ui-store';
import { SPORTS, shortPeriod } from '@/sports/definitions';
import {
  assignSlot,
  autoFill,
  autoFillAll,
  clearAll,
  counts,
  fixPeriods,
  openCount,
  remap,
} from '@/sports/lineup';
import { type Period } from '@/sports/types';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useRenameTeam } from '@/teams/teamMutations';
import {
  playerName,
  toEnginePlayers,
  useCurrentPlan,
  useFormations,
  useMyChildren,
  useSavePlan,
} from './api';
import { toEnginePeriods } from './convert';
import { JerseyDefs } from './Jersey';
import { PeriodCard } from './PeriodCard';

export function FieldPage() {
  const { teamId, team, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const isStaff = useIsStaff();
  const isCoach = useIsCoach();
  const toast = useToast();
  const sheet = useActionSheet();
  const view = useUIStore((s) => s.fieldView);
  const { forms, formationFor } = useFormations();
  const players = usePlayers(teamId);
  const plan = useCurrentPlan(teamId);
  const save = useSavePlan(teamId, plan.gameId);
  const rename = useRenameTeam(teamId);
  const children = useMyChildren();

  const allPlayers = useMemo(() => players.data ?? [], [players.data]);
  const enginePlayers = useMemo(() => toEnginePlayers(allPlayers), [allPlayers]);
  const activePlayers = useMemo(() => allPlayers.filter((p) => p.is_available), [allPlayers]);
  // Render a consistent plan even if settings changed underneath it; saving happens on the next edit.
  const periods: Period[] = useMemo(
    () => fixPeriods(toEnginePeriods(plan.periods), forms, S, enginePlayers),
    [plan.periods, forms, S, enginePlayers],
  );
  const c = useMemo(() => counts(periods, enginePlayers), [periods, enginePlayers]);
  const N = periods.length;
  const noun = S.periodName(N).toLowerCase();
  const colors = (team.colors ?? {}) as Record<string, string>;
  const highlight = children.data ?? new Set<string>();
  const nameOf = (id: string) => playerName(allPlayers.find((p) => p.id === id));

  const commit = (next: Period[], message?: string) => {
    save.mutate(next, {
      onError: (e) => toast(errorMessage(e)),
    });
    if (message) toast(message);
  };

  const onFormationChange = (i: number, name: string) => {
    const q = periods[i];
    if (!q) return;
    const next = [...periods];
    next[i] = remap(q, formationFor(q.formation), formationFor(name), enginePlayers);
    commit(next);
  };

  const onAssign = (i: number, slot: number, playerId: string) => {
    const q = periods[i];
    if (!q) return;
    const f = formationFor(q.formation);
    const r = assignSlot(q, slot, playerId);
    const next = [...periods];
    next[i] = r.period;
    const pos = f.positions[slot];
    let msg: string | undefined;
    if (r.movedFrom !== null) {
      const from = f.positions[r.movedFrom];
      msg = `${nameOf(playerId)} moved · ${S.label(from?.role ?? '')} is open`;
    } else if (playerId && pos) msg = `${nameOf(playerId)} in at ${pos.code}`;
    else if (!playerId) msg = `${S.label(pos?.role ?? '')} is open`;
    commit(next, msg);
  };

  const onAutoFill = (i: number, redo: boolean) => {
    const r = autoFill(periods, i, forms, S, enginePlayers, { redo });
    if (redo) commit(r.periods, 'Auto-fill redone');
    else
      commit(
        r.periods,
        r.filled ? `${r.filled} jersey${r.filled > 1 ? 's' : ''} filled` : 'Nobody left on the bench',
      );
  };

  const onAutoAll = () => {
    if (!openCount(periods)) {
      toast('No open jerseys — tap Redo on a card to reshuffle');
      return;
    }
    const r = autoFillAll(periods, forms, S, enginePlayers);
    commit(
      r.periods,
      r.filled
        ? `${r.filled} jersey${r.filled > 1 ? 's' : ''} filled across ${N} ${noun}s`
        : 'Nobody left on the bench',
    );
  };

  const onClear = async () => {
    const ok = await sheet({
      title: 'Clear all positions?',
      message: `Every ${noun}${plan.liveGame ? ' of the game in progress' : ''} will be emptied. Player names and settings stay.`,
      actions: [{ label: 'Clear positions', value: true, destructive: true }],
    });
    if (ok) commit(clearAll(periods), 'Positions cleared');
  };

  const onRename = (name: string) => {
    const next = name || team.name;
    if (next === team.name) return;
    rename.mutate(next, {
      onSuccess: () => toast('Team name saved'),
      onError: (e) => toast(errorMessage(e)),
    });
  };

  if (plan.isPending || players.isPending) return <LoadingScreen />;

  const sub = plan.liveGame
    ? `Live vs ${plan.liveGame.opponent} · ${isStaff ? 'tap a jersey to assign' : 'lineup updates live'}`
    : `${team.side_size} ${S.unit}${S.hasGK ? (team.has_gk ? ' incl. goalie' : ', no goalie') : ''} · ${N} ${noun}s${isStaff ? ' · tap a jersey to assign' : ''}`;

  return (
    <section className="page">
      <JerseyDefs />
      <EditableTitle value={team.name} onSave={onRename} editable={isCoach} />
      <p className="sub">
        {sub}
        {save.isPending && (
          <span className="pill" style={{ marginLeft: 8 }}>
            Saving…
          </span>
        )}
      </p>
      <div className="quarters">
        {periods.map((q, i) => (
          <PeriodCard
            key={i}
            sport={sport}
            S={S}
            view={view}
            title={shortPeriod(S, N, i)}
            periodIndex={i}
            period={q}
            formation={formationFor(q.formation)}
            forms={forms}
            players={allPlayers}
            activePlayers={activePlayers}
            colors={colors}
            counts={c}
            periodNoun={noun}
            canEdit={isStaff}
            highlight={highlight}
            onFormationChange={(name) => onFormationChange(i, name)}
            onAssign={(slot, pid) => onAssign(i, slot, pid)}
            onAutoFill={() => onAutoFill(i, false)}
            onRedo={() => onAutoFill(i, true)}
          />
        ))}
      </div>
      {periods.length === 0 && <Footer>No periods yet — check the team setup in Settings.</Footer>}
      {isStaff ? (
        <>
          <Footer className="noprint" style={{ marginTop: 14 }}>
            Pick a few jerseys yourself, then tap Auto-fill: the open ones go to the players who have played
            the least so far, with a turn in each position group when it can. A dot on the jersey marks an
            auto pick; your own picks are never moved. Picking a player who is already {S.unit} moves them to
            the new jersey and opens up their old one.
          </Footer>
          <Toolbar sticky className="mt-3">
            <Button variant="tinted" onClick={onAutoAll}>
              Auto-fill
            </Button>
            <Button variant="gray" onClick={onClear}>
              Clear
            </Button>
            <Button variant="gray" onClick={() => window.print()}>
              Print
            </Button>
          </Toolbar>
        </>
      ) : (
        <>
          <Footer className="noprint" style={{ marginTop: 14 }}>
            {highlight.size
              ? 'Your child’s jersey is outlined. Lineups update live while the coach edits them.'
              : 'Lineups update live while the coach edits them.'}
          </Footer>
          <Toolbar className="noprint mt-3">
            <Button variant="gray" onClick={() => window.print()}>
              Print
            </Button>
          </Toolbar>
        </>
      )}
    </section>
  );
}
