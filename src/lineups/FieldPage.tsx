import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { LoadingScreen, useIsCoach, useIsStaff } from '@/auth/guards';
import { ClockFieldPage } from '@/clock/ClockFieldPage';
import { Button, Toolbar } from '@/components/Button';
import { EditableTitle } from '@/components/EditableTitle';
import { Footer } from '@/components/List';
import { useActionSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { Segmented } from '@/components/Segmented';
import { useAddScoreEvent, useCreateGame, useDeleteScoreEvent, useScoreEvents } from '@/games/api';
import { LineupPage } from '@/games/LineupPage';
import { makeNameLookup } from '@/games/names';
import { NewGameSheet } from '@/games/NewGameSheet';
import { ScorePanel } from '@/games/ScorePanel';
import { describeEvent, scoreNoun as scoreNounFor } from '@/games/scoring';
import { errorMessage } from '@/lib/supabase';
import { useUIStore } from '@/lib/ui-store';
import { SPORTS, shortPeriod, periodPlural } from '@/sports/definitions';
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

/** The Field tab: period cards, or the clock-mode field for teams that track time by the clock (D70). */
export function FieldPage() {
  const { team } = useCurrentTeam();
  if (team.time_mode === 'clock') return <ClockFieldPage />;
  return <PeriodFieldPage />;
}

function PeriodFieldPage() {
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
  const navigate = useNavigate();
  const events = useScoreEvents(plan.gameId ?? undefined);
  const addEvent = useAddScoreEvent(teamId, plan.gameId ?? '');
  const deleteEvent = useDeleteScoreEvent(teamId, plan.gameId ?? '');
  const createGame = useCreateGame(teamId);
  const [scoring, setScoring] = useState<number | null>(null);
  const [starting, setStarting] = useState<number | null>(null);
  // Parents of a baseball team have no Lineup tab (their child's tab takes the slot, D53):
  // the batting order is a segment here instead.
  const foldLineup = !isStaff && !!S.lineup;
  const [fieldTab, setFieldTab] = useState<'field' | 'lineup'>('field');

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
  const log = events.data ?? [];
  const score = log.reduce(
    (acc, e) => {
      acc[e.side] += e.points;
      return acc;
    },
    { us: 0, them: 0 },
  );
  const names = makeNameLookup(allPlayers);
  const firstKind = S.scoring.events[0];
  const scoreNoun = scoreNounFor(S);

  /** Score button in a card header: adds to the live game, or starts one first (legacy `scoreButton`). */
  const scoreButton = (i: number) => {
    const live = !!plan.liveGame;
    const label = live
      ? `Score ${score.us} to ${score.them}. Add a ${scoreNoun} in ${noun} ${i + 1}`
      : `Start a game and record ${S.scoring.unitPlural.toLowerCase()}`;
    const inner = (
      <>
        <small>US</small>
        <b>{score.us}</b>
        <i aria-hidden="true">–</i>
        <b>{score.them}</b>
        <small>THEM</small>
      </>
    );
    if (!isStaff) {
      return live ? (
        <span className="score live" aria-label={`Score ${score.us} to ${score.them}`}>
          {inner}
        </span>
      ) : null;
    }
    return (
      <button
        type="button"
        className={`score${live ? ' live' : ''}`}
        aria-label={label}
        onClick={() => (live ? setScoring(i) : setStarting(i))}
      >
        {inner}
      </button>
    );
  };

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

  const onSwap = (i: number, a: number, b: number) => {
    const q = periods[i];
    if (!q) return;
    const slots = [...q.slots];
    const pa = slots[a] ?? '';
    slots[a] = slots[b] ?? '';
    slots[b] = pa;
    const next = [...periods];
    next[i] = { ...q, slots, auto: q.auto.filter((k) => k !== a && k !== b) };
    commit(next, `${nameOf(slots[a] ?? '')} and ${nameOf(slots[b] ?? '')} swap positions`);
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
        ? `${r.filled} jersey${r.filled > 1 ? 's' : ''} filled across ${N} ${periodPlural(S, N)}`
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
    ? `Live vs ${plan.liveGame.opponent} · US ${score.us} – ${score.them} THEM${isStaff ? ` · tap a score to add ${scoreNoun === 'score' ? 'points' : `a ${scoreNoun}`}` : ''}`
    : `${team.side_size} ${S.unit}${S.hasGK ? (team.has_gk ? ' incl. goalie' : ', no goalie') : ''} · ${N} ${periodPlural(S, N)}${isStaff ? ' · tap a jersey to assign · tap a score to start a game' : ''}`;

  return (
    <section className="page">
      <JerseyDefs />
      <EditableTitle value={team.name} onSave={onRename} editable={isCoach} />
      <p className="sub">{sub}</p>
      {/* no inline "Saving…" pill: it wrapped the line and moved the cards on every edit (D78) */}
      <span className="sr-only" aria-live="polite">
        {save.isPending ? 'Saving' : ''}
      </span>
      {foldLineup && (
        <Segmented<'field' | 'lineup'>
          wide
          label={`${S.field} view`}
          value={fieldTab}
          onChange={setFieldTab}
          options={[
            { value: 'field', label: S.field },
            { value: 'lineup', label: 'Batting order' },
          ]}
          className="mb-3"
        />
      )}
      {foldLineup && fieldTab === 'lineup' ? (
        <LineupPage embedded />
      ) : (
        <>
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
                onSwap={(a, b) => onSwap(i, a, b)}
                onAutoFill={() => onAutoFill(i, false)}
                onRedo={() => onAutoFill(i, true)}
                headerExtra={scoreButton(i)}
              />
            ))}
          </div>
          {isStaff && plan.liveGame && (
            <ScorePanel
              open={scoring !== null}
              onClose={() => setScoring(null)}
              S={S}
              opponent={plan.liveGame.opponent}
              periodCount={N || 1}
              initialPeriod={scoring ?? 0}
              players={activePlayers}
              names={names}
              events={log}
              onAdd={(ev) => {
                addEvent.mutate(ev, { onError: (e) => toast(errorMessage(e)) });
                toast(
                  ev.side === 'them'
                    ? `${plan.liveGame?.opponent ?? 'Opponent'} scored · ${S.periodName(N)} ${ev.period_index + 1}`
                    : `${firstKind?.label === 'Goal' ? 'Goal!' : 'Scored!'} ${names.name(ev.scorer_player_id) || 'Unknown'} · ${S.periodName(N)} ${ev.period_index + 1}`,
                );
              }}
              onUndo={(ev) => {
                deleteEvent.mutate(ev.id, { onError: (e) => toast(errorMessage(e)) });
                toast(`Removed · ${describeEvent(S, N || 1, plan.liveGame?.opponent ?? '', ev, names)}`);
              }}
            />
          )}
          {isStaff && !plan.liveGame && (
            <NewGameSheet
              open={starting !== null}
              onClose={() => setStarting(null)}
              liveExists={false}
              startOnly
              busy={createGame.isPending}
              onSubmit={(input) =>
                createGame.mutate(
                  { ...input, start: true },
                  {
                    onSuccess: (g) => {
                      setStarting(null);
                      toast(`Game on · vs ${g.opponent}`);
                      void navigate('/field');
                    },
                    onError: (e) => toast(errorMessage(e)),
                  },
                )
              }
            />
          )}
          {periods.length === 0 && <Footer>No periods yet — check the team setup in Settings.</Footer>}
          {isStaff ? (
            <>
              <Footer className="noprint" style={{ marginTop: 14 }}>
                Pick a few jerseys yourself, then tap Auto-fill: the open ones go to the players who have
                played the least so far, with a turn in each position group when it can. A dot on the jersey
                marks an auto pick; your own picks are never moved. Picking a player who is already {S.unit}{' '}
                moves them to the new jersey and opens up their old one.
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
                  ? 'Your child’s jersey has a gold star and name. Lineups update live while the coach edits them.'
                  : 'Lineups update live while the coach edits them.'}
              </Footer>
              <Toolbar className="noprint mt-3">
                <Button variant="gray" onClick={() => window.print()}>
                  Print
                </Button>
              </Toolbar>
            </>
          )}
        </>
      )}
    </section>
  );
}
