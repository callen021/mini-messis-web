import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { LoadingScreen, useIsCoach, useIsStaff } from '@/auth/guards';
import { Button, Toolbar } from '@/components/Button';
import { EditableTitle } from '@/components/EditableTitle';
import { Footer } from '@/components/List';
import { useActionSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import {
  useAddScoreEvent,
  useCreateGame,
  useDeleteScoreEvent,
  useScoreEvents,
  useStartGame,
} from '@/games/api';
import { fmtDate, fmtTime, todayISO } from '@/games/format';
import { makeNameLookup } from '@/games/names';
import { NewGameSheet } from '@/games/NewGameSheet';
import { ScorePanel } from '@/games/ScorePanel';
import { describeEvent, scoreNoun as scoreNounFor, scoreTapAllowed } from '@/games/scoring';
import { errorMessage } from '@/lib/supabase';
import { usePlannedGame } from '@/rsvp/api';
import { heldOutNote, outCaption } from '@/rsvp/rsvp';
import { useUIStore } from '@/lib/ui-store';
import { JerseyDefs } from '@/lineups/Jersey';
import { toEnginePlayers, useCurrentPlan, useFormations, useMyChildren } from '@/lineups/api';
import { toEnginePeriods } from '@/lineups/convert';
import { SPORTS, periodCountText, shortPeriod } from '@/sports/definitions';
import { assignSlot, clearAll, fixPeriods } from '@/sports/lineup';
import { type Period } from '@/sports/types';
import { type Player, usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useRenameTeam } from '@/teams/teamMutations';
import { useClockAction, useGameClock, useSeasonMinutes, useServerTimeSync, useStints } from './api';
import { fillByTime, rankFromStints, suggestStarters } from './autofill';
import { benchAfterEdit, benchQueue, benchSwap } from './bench';
import {
  PAUSED_CLOCK,
  capNote,
  elapsedAt,
  formatClock,
  isFullTime,
  isRunning,
  onFieldBySlot,
  stintSeconds,
} from './clock';
import { ClockCard } from './ClockCard';
import { ClockDisplay } from './ClockDisplay';
import { ClockStamp } from './ClockStamp';
import { remapByDistance } from './formation';
import { useStartCheck } from './useStartCheck';
import { QuickScoreRow } from './QuickScoreRow';
import { PeriodOverAlert } from './PeriodOverAlert';
import { type Selection, type TapOutcome, resolveTap, selectionHint } from './tap';
import { useFlash } from './useFlash';
import { serverNow } from './serverTime';
import { useSaveStarters } from './template';
import { useWakeLock } from './useWakeLock';

/**
 * The Field tab for a team that tracks playing time by the clock (D70). One field for the whole
 * game: before a game it edits the starters on the template; during a live game every tap is an
 * atomic server call on the running clock and all devices see the same state.
 */
export function ClockFieldPage() {
  const { teamId, team, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const N = team.clock_periods;
  const isStaff = useIsStaff();
  const isCoach = useIsCoach();
  const toast = useToast();
  const sheet = useActionSheet();
  const navigate = useNavigate();
  const view = useUIStore((s) => s.fieldView);
  const { forms, formationFor } = useFormations();
  const players = usePlayers(teamId);
  const plan = useCurrentPlan(teamId);
  const rename = useRenameTeam(teamId);
  const children = useMyChildren();
  const planned = usePlannedGame(teamId);
  const live = plan.liveGame;
  const gameId = plan.gameId;
  const saveStarters = useSaveStarters(teamId);
  const act = useClockAction(teamId, gameId ?? '');
  const clockQ = useGameClock(gameId ?? undefined, !!live, !!live);
  const stintsQ = useStints(gameId ?? undefined, !!live, !!live);
  const events = useScoreEvents(gameId ?? undefined);
  const addEvent = useAddScoreEvent(teamId, gameId ?? '');
  const deleteEvent = useDeleteScoreEvent(teamId, gameId ?? '');
  const createGame = useCreateGame(teamId);
  const startGame = useStartGame(teamId);
  const confirmStart = useStartCheck(teamId);
  const seasonMinutes = useSeasonMinutes(teamId, isStaff);
  const [selected, setSelected] = useState<Selection>(null);
  const [flashing, flash] = useFlash();
  const [scoring, setScoring] = useState(false);
  const [starting, setStarting] = useState(false);
  // basketball quick scoring (D108): the points waiting for a scorer, and the last entry's line
  const [pendingPts, setPendingPts] = useState<number | null>(null);
  const [lastScore, setLastScore] = useState<{ text: string } | null>(null);

  const clock = clockQ.data ?? PAUSED_CLOCK;
  const running = !!live && isRunning(clock);
  const atZero = !!live && clock.clockSeconds === 0 && !isRunning(clock);
  const quickScoring = sport === 'basketball' && !!live && isStaff;
  // soccer may change shape mid-game while the clock is paused (D108); every sport may at 0:00
  const canChangeFormationLive = !!live && sport === 'soccer' && !running;
  useServerTimeSync(!!live);
  // the page never ticks (D95): the clock, the shift times and the period alert tick on their own
  // inside leaf components, so an open sheet is never re-rendered or remounted by the clock
  useWakeLock(!!live && isStaff);

  const allPlayers = useMemo(() => players.data ?? [], [players.data]);
  // a parent's "can't make it" for the planned game (D107): out of the bench and Auto-fill, but a
  // player already placed keeps the spot and shows the red OUT tag until the coach replaces them
  const parentOut = planned.parentOut;
  const enginePlayers = useMemo(() => toEnginePlayers(allPlayers, parentOut), [allPlayers, parentOut]);
  const activePlayers = useMemo(
    () => allPlayers.filter((p) => p.is_available && !parentOut.has(p.id)),
    [allPlayers, parentOut],
  );
  const colors = (team.colors ?? {}) as Record<string, string>;
  const highlight = children.data ?? new Set<string>();
  const nameOf = (id: string) => allPlayers.find((p) => p.id === id)?.first_name ?? 'player';
  const names = makeNameLookup(allPlayers);
  const stints = useMemo(() => stintsQ.data ?? [], [stintsQ.data]);

  // the period being shown: the clock's period in a live game (the last one at full time), else the template's first
  const fullTime = !!live && isFullTime(clock, N);
  const periodIndex = live ? Math.min(clock.periodIndex, N - 1) : 0;
  const fixed: Period[] = useMemo(
    () => fixPeriods(toEnginePeriods(plan.periods), forms, S, enginePlayers),
    [plan.periods, forms, S, enginePlayers],
  );
  const shown = fixed[periodIndex] ?? fixed[0];
  const formation = formationFor(shown?.formation ?? '');
  const slots: string[] = useMemo(() => {
    if (!live) return formation.positions.map((_, i) => shown?.slots[i] ?? '');
    const on = onFieldBySlot(stints, periodIndex);
    return formation.positions.map((_, i) => on.get(i)?.player_id ?? '');
  }, [live, formation, shown, stints, periodIndex]);

  // the bench is a queue (D79): the lineup row's order, cleaned up client-side so it draws right before the server answers
  const rosterIds = useMemo(() => activePlayers.map((p) => p.id), [activePlayers]);
  const queue = useMemo(
    () => benchQueue(shown?.bench ?? [], rosterIds, slots),
    [shown?.bench, rosterIds, slots],
  );
  const bench: Player[] = useMemo(() => {
    const byId = new Map(activePlayers.map((p) => [p.id, p]));
    return queue.flatMap((id) => {
      const player = byId.get(id);
      return player ? [player] : [];
    });
  }, [queue, activePlayers]);

  const log = events.data ?? [];
  const score = log.reduce(
    (acc, e) => {
      acc[e.side] += e.points;
      return acc;
    },
    { us: 0, them: 0 },
  );
  const scoreNoun = scoreNounFor(S);
  const onError = (e: unknown) => toast(errorMessage(e));

  /* ---------- scoring on the clock (D108) ---------- */
  const recordScore = (side: 'us' | 'them', points: number, scorerId: string | null) => {
    const kind = S.scoring.events.find((k) => k.points === points);
    if (!kind || !live || !scoreTapAllowed()) return;
    addEvent.mutate(
      {
        side,
        period_index: periodIndex,
        event_type: kind.type,
        points: kind.points,
        scorer_player_id: side === 'us' ? scorerId : null,
        assist_player_id: null,
      },
      { onError },
    );
    setPendingPts(null);
    setLastScore({
      text:
        side === 'them'
          ? `${live.opponent} +${kind.points}`
          : `${scorerId ? nameOf(scorerId) : 'Team'} +${kind.points}`,
    });
  };
  const lastEvent = log[log.length - 1];
  // an early start (D109): while paused in the first period with no score, the clock can go back to 0:00
  const canReset = !!live && !running && periodIndex === 0 && clock.clockSeconds > 0 && log.length === 0;
  const resetClock = async () => {
    const ok = await sheet({
      title: 'Reset the clock to 0:00?',
      message:
        'Minutes played so far are cleared. The lineup stays as it is; Start clock then runs from 0:00.',
      actions: [{ label: 'Reset clock', value: true, destructive: true }],
    });
    if (ok) act.mutate({ kind: 'reset' }, { onError, onSuccess: () => toast('Clock reset to 0:00') });
  };
  const undoLast = () => {
    if (!lastEvent || lastEvent.id.startsWith('temp-')) return;
    deleteEvent.mutate(lastEvent.id, { onError });
    setLastScore(null);
    toast(`Removed · ${describeEvent(S, N, live?.opponent ?? '', lastEvent, names)}`);
  };

  /* ---------- template edits (no live game) ---------- */
  const commitTemplate = (period: Period, message?: string) => {
    const bench = benchAfterEdit(period.bench ?? queue, rosterIds, slots, period.slots);
    saveStarters.mutate({ starters: { ...period, bench }, count: Math.max(1, fixed.length) }, { onError });
    if (message) toast(message);
  };
  const templateTap = (o: TapOutcome) => {
    if (!shown) return;
    const p: Period = { formation: formation.name, slots: [...slots], auto: [...shown.auto] };
    if (o.action === 'swap') {
      const ia = p.slots.indexOf(o.a);
      const ib = p.slots.indexOf(o.b);
      if (ia < 0 || ib < 0) return;
      p.slots[ia] = o.b;
      p.slots[ib] = o.a;
      p.auto = p.auto.filter((k) => k !== ia && k !== ib);
      commitTemplate(p, `${nameOf(o.a)} and ${nameOf(o.b)} swap positions`);
    } else if (o.action === 'move') {
      commitTemplate(assignSlot(p, o.slot, o.playerId).period, `${nameOf(o.playerId)} moved`);
    } else if (o.action === 'sub') {
      const i = p.slots.indexOf(o.off);
      if (i < 0) return;
      commitTemplate(assignSlot(p, i, o.on).period, `${nameOf(o.on)} starts for ${nameOf(o.off)}`);
    } else if (o.action === 'fill') {
      commitTemplate(assignSlot(p, o.slot, o.playerId).period, `${nameOf(o.playerId)} starts`);
    }
  };

  /* ---------- live game: atomic server calls ---------- */
  const liveTap = (o: TapOutcome) => {
    const done = (msg: string) => () => toast(msg);
    if (o.action === 'swap')
      act.mutate(
        { kind: 'swap', a: o.a, b: o.b },
        { onError, onSuccess: done(`${nameOf(o.a)} and ${nameOf(o.b)} swap positions`) },
      );
    else if (o.action === 'move')
      act.mutate(
        { kind: 'fill', playerId: o.playerId, slot: o.slot },
        { onError, onSuccess: done(`${nameOf(o.playerId)} moved`) },
      );
    else if (o.action === 'sub')
      act.mutate(
        { kind: 'sub', off: o.off, on: o.on },
        { onError, onSuccess: done(`${nameOf(o.on)} on for ${nameOf(o.off)}`) },
      );
    else if (o.action === 'fill')
      act.mutate(
        { kind: 'fill', playerId: o.playerId, slot: o.slot },
        { onError, onSuccess: done(`${nameOf(o.playerId)} on`) },
      );
  };

  const tap = (target: Parameters<typeof resolveTap>[1]) => {
    if (fullTime) {
      toast('Full time · finish the game on the Schedule tab');
      return;
    }
    // scoring mode (D108): a court jersey names the scorer; nothing else happens
    if (pendingPts !== null) {
      if (target.kind === 'field' && target.playerId) recordScore('us', pendingPts, target.playerId);
      else toast('Tap a player on the court, or Team');
      return;
    }
    const o = resolveTap(selected, target);
    if (o.action === 'select') {
      setSelected(o.selection);
      return;
    }
    if (o.action === 'none') return;
    setSelected(null);
    if (o.action === 'cancel') return;
    if (o.action === 'benchswap') {
      flash([o.a, o.b]);
      if (live)
        act.mutate(
          { kind: 'bench', a: o.a, b: o.b },
          { onError, onSuccess: () => toast(`${nameOf(o.a)} and ${nameOf(o.b)} swap places in line`) },
        );
      else if (shown)
        commitTemplate(
          {
            formation: formation.name,
            slots: [...slots],
            auto: [...shown.auto],
            bench: benchSwap(queue, o.a, o.b),
          },
          `${nameOf(o.a)} and ${nameOf(o.b)} swap places in line`,
        );
      return;
    }
    flash(o.action === 'swap' ? [o.a, o.b] : o.action === 'sub' ? [o.off, o.on] : [o.playerId]);
    if (live) liveTap(o);
    else templateTap(o);
  };
  /** Take the selected on-field player off with nobody on: an injury in a live game, an open starter spot otherwise. */
  const openSpot = () => {
    if (!selected || selected.kind !== 'field' || !selected.playerId) return;
    const { slot, playerId } = selected;
    setSelected(null);
    if (live)
      act.mutate(
        { kind: 'empty', off: playerId },
        { onError, onSuccess: () => toast(`${nameOf(playerId)} off · spot open`) },
      );
    else if (shown) {
      const p: Period = { formation: formation.name, slots: [...slots], auto: [...shown.auto] };
      commitTemplate(
        assignSlot(p, slot, '').period,
        `${S.label(formation.positions[slot]?.role ?? '')} is open`,
      );
    }
  };

  const onFormationChange = (name: string) => {
    if (!shown) return;
    const to = formationFor(name);
    if (live && !atZero) {
      // mid-game (soccer, paused, D108): the same players, each to the nearest spot, the keeper in goal
      const placed = remapByDistance(formation, to, slots);
      act.mutate(
        {
          kind: 'formation',
          formation: to.name,
          slots: to.positions.map((pos, i) => ({
            position_role: pos.role,
            position_code: pos.code,
            player_id: placed[i] || null,
          })),
        },
        { onError, onSuccess: () => toast(`Formation ${to.name} · same players, tap to adjust`) },
      );
      return;
    }
    const next: Period = { formation: to.name, slots: to.positions.map((_, i) => slots[i] ?? ''), auto: [] };
    if (live) {
      act.mutate(
        {
          kind: 'lineup',
          formation: to.name,
          slots: to.positions.map((pos, i) => ({
            position_role: pos.role,
            position_code: pos.code,
            player_id: next.slots[i] || null,
          })),
        },
        { onError, onSuccess: () => toast(`Formation ${to.name}`) },
      );
    } else commitTemplate(next);
  };

  /* ---------- auto-fill (D71): season minutes before a game, game minutes at a break ---------- */
  const sendLineup = (p: Period, msg: string) =>
    act.mutate(
      {
        kind: 'lineup',
        formation: formation.name,
        slots: formation.positions.map((pos, i) => ({
          position_role: pos.role,
          position_code: pos.code,
          player_id: p.slots[i] || null,
          auto_picked: p.auto.includes(i) && !!p.slots[i],
        })),
      },
      { onError, onSuccess: () => toast(msg) },
    );
  const onAutoFill = () => {
    if (!shown) return;
    const p: Period = { formation: formation.name, slots: [...slots], auto: [...shown.auto] };
    const offField = activePlayers.filter((pl) => !slots.includes(pl.id));
    const rank = seasonMinutes.data ?? new Map();
    const r = fillByTime(p, formation, S, offField, rank);
    if (!r.filled) {
      toast(offField.length ? 'No open spots' : 'Nobody left on the bench');
      return;
    }
    const msg = `${r.filled} jersey${r.filled > 1 ? 's' : ''} filled by season minutes`;
    if (live) sendLineup(r.period, msg);
    else commitTemplate(r.period, msg);
  };
  const onSuggest = () => {
    const rank = rankFromStints(
      stints.map((st) => ({
        player_id: st.player_id,
        position_role: st.position_role,
        seconds: stintSeconds(st, clock, serverNow()),
      })),
      S.group,
    );
    sendLineup(suggestStarters(formation, S, activePlayers, rank), 'Starters picked by minutes this game');
  };

  const onClear = async () => {
    const ok = await sheet({
      title: 'Clear the starters?',
      message: 'Every spot will be emptied. Player names and settings stay.',
      actions: [{ label: 'Clear starters', value: true, destructive: true }],
    });
    if (ok && shown) commitTemplate(clearAll([shown])[0] as Period, 'Starters cleared');
  };

  const endPeriod = async () => {
    const last = clock.periodIndex >= N - 1;
    const title = `End ${shortPeriod(S, N, periodIndex)} at ${formatClock(elapsedAt(clock, serverNow()))}?`;
    const ok = await sheet({
      title,
      message: last
        ? 'That is full time. Finish the game from the Schedule tab when the score is in.'
        : `Everyone on the field keeps their spot for ${shortPeriod(S, N, periodIndex + 1)} until you change it.`,
      actions: [{ label: last ? 'End · full time' : `End ${shortPeriod(S, N, periodIndex)}`, value: true }],
    });
    if (ok)
      act.mutate(
        { kind: 'end_period' },
        {
          onError,
          onSuccess: () =>
            toast(last ? 'Full time' : `${shortPeriod(S, N, periodIndex + 1)} · clock at 0:00`),
        },
      );
  };

  const undo = () =>
    act.mutate(
      { kind: 'undo' },
      {
        onError,
        onSuccess: (kind) =>
          toast(
            kind === 'swap' ? 'Swap undone' : kind === 'sub' ? 'Substitution undone' : 'Last change undone',
          ),
      },
    );

  const onRename = (name: string) => {
    const next = name || team.name;
    if (next === team.name) return;
    rename.mutate(next, { onSuccess: () => toast('Team name saved'), onError });
  };

  /** The score tap with no live game (D108): start the next scheduled game, or a new one. */
  const startFlow = async () => {
    const next = planned.game && planned.game.status === 'upcoming' ? planned.game : null;
    const when = next
      ? `${fmtDate(next.game_date, true)}${next.start_time ? ` · ${fmtTime(next.start_time)}` : ''}`
      : '';
    const choice = await sheet<'next' | 'new'>({
      title: 'Start a game',
      actions: [
        ...(next ? [{ label: `Start vs ${next.opponent} · ${when}`, value: 'next' as const }] : []),
        { label: 'New game', value: 'new' as const },
      ],
    });
    if (choice === 'new') setStarting(true);
    if (choice !== 'next' || !next) return;
    if (next.game_date !== todayISO()) {
      const ok = await sheet({
        title: 'Start it now?',
        message: `This game is scheduled for ${fmtDate(next.game_date, true)}. Start it now?`,
        actions: [{ label: 'Start game', value: true }],
      });
      if (!ok) return;
    }
    if (!(await confirmStart(next.id))) return;
    startGame.mutate(next.id, {
      onError,
      onSuccess: () => {
        toast(`Game on · vs ${next.opponent}`);
        void navigate('/field');
      },
    });
  };

  if (plan.isPending || players.isPending || (live && (clockQ.isPending || stintsQ.isPending)))
    return <LoadingScreen />;

  const scoreButton = () => {
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
        aria-label={
          live
            ? `Score ${score.us} to ${score.them}. Add a ${scoreNoun}`
            : `Start a game and record ${S.scoring.unitPlural.toLowerCase()}`
        }
        onClick={() => (live ? setScoring(true) : void startFlow())}
      >
        {inner}
      </button>
    );
  };

  const heldNote = heldOutNote(
    allPlayers
      .filter((p) => parentOut.has(p.id) && slots.includes(p.id))
      .map((p) => ({ name: p.first_name, byParent: planned.byParent.has(p.id) })),
    planned.game?.opponent ?? null,
  );
  const outText = outCaption(allPlayers, parentOut, planned.byParent);
  const title = live ? (fullTime ? 'Full time' : shortPeriod(S, N, periodIndex)) : 'Starters';
  const sub = live
    ? `Live vs ${live.opponent} · US ${score.us} – ${score.them} THEM${isStaff ? ' · tap a jersey, then another, to swap' : ''}`
    : `${team.side_size} ${S.unit}${S.hasGK ? (team.has_gk ? ' incl. goalie' : ', no goalie') : ''} · ${periodCountText(S, N)} on the clock${isStaff ? ' · tap jerseys to set the starters · tap the score to start a game' : ''}`;
  const periodNoun = S.periodName(N).toLowerCase();

  return (
    <section className="page">
      <JerseyDefs />
      <EditableTitle value={team.name} onSave={onRename} editable={isCoach} />
      <p className="sub">{sub}</p>
      {isStaff && heldNote && (
        <p className="sub capnote outnote" role="status">
          {heldNote} The red OUT tag marks the jersey: tap it, then a bench player, to replace them.
        </p>
      )}
      {live && clock.autoPaused && (
        <p className="sub capnote" role="status">
          {capNote(clock, team.period_minutes)}
        </p>
      )}
      {/* no "Saving…" pill in the flow of the page: it shifted the field up and down on every tap (D77) */}
      <span className="sr-only" aria-live="polite">
        {saveStarters.isPending || act.isPending ? 'Saving' : ''}
      </span>
      {live && (
        <PeriodOverAlert
          gameId={live.id}
          clock={clock}
          periodMinutes={team.period_minutes}
          active={!!live && !fullTime}
          label={shortPeriod(S, N, periodIndex)}
        />
      )}
      <div className="quarters">
        <ClockCard
          sport={sport}
          S={S}
          view={view}
          title={title}
          formation={formation}
          forms={forms}
          slots={slots}
          players={allPlayers}
          bench={bench}
          live={!!live}
          clock={clock}
          stints={stints}
          colors={colors}
          canEdit={isStaff && !fullTime}
          canChangeFormation={!live || atZero || (canChangeFormationLive && !fullTime)}
          highlight={highlight}
          selected={selected}
          flashing={flashing}
          hint={
            pendingPts !== null
              ? `Who scored the +${pendingPts}?`
              : selectionHint(
                  selected,
                  nameOf,
                  formation.positions.map((p) => p.code),
                )
          }
          hideTitle={title === 'Game'}
          pickable={pendingPts !== null}
          compact={quickScoring}
          hintExtra={
            pendingPts !== null ? (
              <>
                <Button size="sm" variant="tinted" onClick={() => recordScore('us', pendingPts, null)}>
                  Team
                </Button>
                <Button size="sm" variant="gray" onClick={() => setPendingPts(null)}>
                  Cancel
                </Button>
              </>
            ) : undefined
          }
          onOpenSpot={selected?.kind === 'field' && selected.playerId ? openSpot : undefined}
          onFormationChange={onFormationChange}
          onTapSlot={(slot) => tap({ kind: 'field', slot, playerId: slots[slot] ?? '' })}
          onTapBench={(playerId) => tap({ kind: 'bench', playerId })}
          headerExtra={
            <>
              {live && <ClockDisplay state={clock} periodMinutes={team.period_minutes} fullTime={fullTime} />}
              {scoreButton()}
            </>
          }
          benchEmptyText={`Everyone is ${S.unit}`}
          parentOut={parentOut}
          outText={outText}
        />
      </div>
      {quickScoring && !fullTime && (
        <QuickScoreRow
          S={S}
          pending={pendingPts}
          disabled={addEvent.isPending}
          last={
            lastScore
              ? {
                  text: lastScore.text,
                  onUndo: lastEvent && !lastEvent.id.startsWith('temp-') ? undoLast : undefined,
                }
              : null
          }
          onUs={(p) => setPendingPts(pendingPts === p ? null : p)}
          onThem={(p) => recordScore('them', p, null)}
        />
      )}
      {isStaff && live && (
        <ScorePanel
          open={scoring}
          onClose={() => setScoring(false)}
          S={S}
          opponent={live.opponent}
          periodCount={N}
          initialPeriod={periodIndex}
          lockPeriod
          players={activePlayers}
          onField={slots.filter(Boolean)}
          bench={queue}
          stamp={<ClockStamp clock={clock} label={N === 1 ? '' : shortPeriod(S, N, periodIndex)} />}
          names={names}
          events={log}
          onAdd={(ev) => {
            addEvent.mutate({ ...ev, period_index: periodIndex }, { onError });
            toast(
              ev.side === 'them'
                ? `${live.opponent} scored · ${N === 1 ? '' : `${shortPeriod(S, N, periodIndex)} `}${formatClock(elapsedAt(clock, serverNow()))}`
                : `${S.scoring.events[0]?.label === 'Goal' ? 'Goal!' : 'Scored!'} ${names.name(ev.scorer_player_id) || 'Unknown'} · ${N === 1 ? '' : `${shortPeriod(S, N, periodIndex)} `}${formatClock(elapsedAt(clock, serverNow()))}`,
            );
          }}
          onUndo={(ev) => {
            deleteEvent.mutate(ev.id, { onError });
            toast(`Removed · ${describeEvent(S, N, live.opponent, ev, names)}`);
          }}
        />
      )}
      {isStaff && !live && (
        <NewGameSheet
          open={starting}
          onClose={() => setStarting(false)}
          liveExists={false}
          startOnly
          busy={createGame.isPending}
          onSubmit={(input) =>
            void confirmStart(null).then((ok) => {
              if (!ok) {
                setStarting(false);
                return;
              }
              createGame.mutate(
                { ...input, start: true },
                {
                  onSuccess: (g) => {
                    setStarting(false);
                    toast(`Game on · vs ${g.opponent}`);
                    void navigate('/field');
                  },
                  onError,
                },
              );
            })
          }
        />
      )}
      {isStaff ? (
        <>
          {!quickScoring && (
            <Footer className="noprint" style={{ marginTop: 14 }}>
              {live
                ? `Tap a bench player and then a jersey to substitute on the running clock; tap two jerseys to swap positions. Each jersey shows the current shift; the bench is a line, next in on the right; tap two bench jerseys to swap their places. Minutes per player are on the Rotation view. ${N === 1 ? 'Pause the clock at the breaks; finish the game from the game page when it is over.' : `End ${periodNoun === 'inning' ? 'the inning' : `the ${periodNoun}`} to stop the clock and carry everyone over.`}`
                : `These are the starters for the next game. Tap jerseys to swap or pick players; the bench row is everyone else who is available, in the order they will come on, next in on the right (tap two to swap places). Auto-fill gives open spots to the players with the fewest minutes this season, rotating position groups; your own picks are never moved.`}
            </Footer>
          )}
          {live ? (
            <Toolbar sticky className="mt-3 clockbar">
              {!fullTime && (
                <Button
                  variant={running ? 'gray' : 'primary'}
                  disabled={act.isPending}
                  onClick={() => act.mutate({ kind: running ? 'pause' : 'start' }, { onError })}
                >
                  {running ? 'Pause' : clock.clockSeconds > 0 ? 'Resume' : 'Start clock'}
                </Button>
              )}
              {!fullTime && canReset && (
                <Button variant="gray" disabled={act.isPending} onClick={() => void resetClock()}>
                  Reset clock
                </Button>
              )}
              {!fullTime && N > 1 && (
                <Button variant="tinted" disabled={act.isPending} onClick={() => void endPeriod()}>
                  End {shortPeriod(S, N, periodIndex)}
                </Button>
              )}
              {!fullTime && N === 1 && (
                <Button variant="tinted" onClick={() => void navigate(`/games/${live.id}`)}>
                  Finish game
                </Button>
              )}
              {!fullTime && atZero && (
                <Button
                  variant="tinted"
                  disabled={act.isPending}
                  onClick={periodIndex === 0 ? onAutoFill : onSuggest}
                >
                  {periodIndex === 0 ? 'Auto-fill' : 'Suggest starters'}
                </Button>
              )}
              {!fullTime && (
                <Button variant="gray" disabled={act.isPending} onClick={undo}>
                  Undo
                </Button>
              )}
              {fullTime && (
                <Button onClick={() => void navigate(`/games/${live.id}`)}>Finish on the game page</Button>
              )}
            </Toolbar>
          ) : (
            <Toolbar sticky className="mt-3">
              <Button variant="tinted" onClick={onAutoFill}>
                Auto-fill
              </Button>
              <Button variant="gray" onClick={() => void onClear()}>
                Clear
              </Button>
            </Toolbar>
          )}
        </>
      ) : (
        <Footer className="noprint" style={{ marginTop: 14 }}>
          {live
            ? 'The clock and substitutions update live as the coach makes them. Each jersey shows the current shift; minutes per player are on the Rotation view.'
            : highlight.size
              ? 'Your child’s jersey has a gold star and name. The starters update live while the coach edits them.'
              : 'The starters update live while the coach edits them.'}
        </Footer>
      )}
    </section>
  );
}
