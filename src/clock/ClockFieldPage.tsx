import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { LoadingScreen, useIsCoach, useIsStaff } from '@/auth/guards';
import { Button, Toolbar } from '@/components/Button';
import { EditableTitle } from '@/components/EditableTitle';
import { Footer } from '@/components/List';
import { useActionSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import {
  useAddScoreEvent,
  useAddStatEvent,
  useCreateGame,
  useDeleteScoreEvent,
  useDeleteStatEvent,
  useKeepStats,
  useScoreEvents,
  useStartGame,
  useStatEvents,
} from '@/games/api';
import { canKeepStats, canLogGame, keeperText } from '@/games/keeper';
import { KeeperBar } from '@/games/KeeperBar';
import { fmtDate, fmtTime, todayISO } from '@/games/format';
import { makeNameLookup } from '@/games/names';
import { NewGameSheet } from '@/games/NewGameSheet';
import { ScorePanel } from '@/games/ScorePanel';
import { describeEvent, scoreNoun as scoreNounFor, scoreTapAllowed } from '@/games/scoring';
import { errorMessage } from '@/lib/supabase';
import { useEligibility } from '@/players/api';
import { eligibleFn, skippedText } from '@/players/eligibility';
import { usePlannedGame } from '@/rsvp/api';
import { heldOutNote, outCaption } from '@/rsvp/rsvp';
import { useUIStore } from '@/lib/ui-store';
import { JerseyDefs } from '@/lineups/Jersey';
import { toEnginePlayers, useCurrentPlan, useFormations, useMyChildren } from '@/lineups/api';
import { toEnginePeriods } from '@/lineups/convert';
import { SPORTS, periodCountText, shortPeriod } from '@/sports/definitions';
import { assignSlot, clearAll, fixPeriods } from '@/sports/lineup';
import { type Period, type StatType } from '@/sports/types';
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
import { MOVE_HELP } from './BenchRow';
import { QuickScoreRow } from './QuickScoreRow';
import { PeriodOverAlert } from './PeriodOverAlert';
import { type Selection, type TapAction, type Target, resolveTap, selectionHint } from './tap';
import { useFlash } from './useFlash';
import { serverNow } from './serverTime';
import { useSaveStarters } from './template';
import { useWakeLock } from './useWakeLock';
import { VolleyballBar } from './VolleyballBar';
import { matchDecided, pointsLabel, setTarget, setWon, setsState } from './volleyball';

/**
 * The Field tab for a team that tracks playing time by the clock (D70). One field for the whole
 * game: before a game it edits the starters on the template; during a live game every tap is an
 * atomic server call on the running clock and all devices see the same state.
 */
export function ClockFieldPage() {
  const { teamId, team, sport, statKeeper, userId } = useCurrentTeam();
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
  // basketball stat entries (D118): tracked ones get buttons next to the points
  const statEvents = useStatEvents(gameId ?? undefined, !!S.scoring.stats);
  const addStat = useAddStatEvent(teamId, gameId ?? '');
  const deleteStat = useDeleteStatEvent(teamId, gameId ?? '');
  const createGame = useCreateGame(teamId);
  const startGame = useStartGame(teamId);
  const confirmStart = useStartCheck(teamId);
  const seasonMinutes = useSeasonMinutes(teamId, isStaff);
  const eligibility = useEligibility(teamId, isStaff);
  const [selected, setSelected] = useState<Selection>([]);
  const [flashing, flash] = useFlash();
  const [scoring, setScoring] = useState(false);
  const [starting, setStarting] = useState(false);
  // basketball quick scoring (D108): the points waiting for a scorer, and the last entry's line;
  // a tracked stat waits for its player the same way (D118)
  const [pendingPts, setPendingPts] = useState<number | null>(null);
  const [pendingStat, setPendingStat] = useState<StatType | null>(null);
  const [lastScore, setLastScore] = useState<{ text: string; kind: 'score' | 'stat' } | null>(null);
  // a live change shows at once (D113): the page's own view of the spots and the bench while the
  // server calls run, one after another in tap order; dropped once the last one has refetched
  const [ahead, setAhead] = useState<{ slots: string[]; bench: string[] } | null>(null);
  const aheadRef = useRef<{ slots: string[]; bench: string[] } | null>(null);
  const inFlight = useRef(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  // the paused-clock nudge (D113): a sub or a score while the clock is paused shows a banner with Resume
  const [nudge, setNudge] = useState(false);

  const clock = clockQ.data ?? PAUSED_CLOCK;
  const running = !!live && isRunning(clock);
  const atZero = !!live && clock.clockSeconds === 0 && !isRunning(clock);
  // one active keeper (D120): while the game is live, only the one keeping its stats logs them
  const viewer = { userId, isStaff, statKeeper };
  const canLog = canLogGame(live, viewer);
  const keep = useKeepStats(teamId);
  const quickScoring = sport === 'basketball' && !!live && canLog;
  // volleyball (D121): no clock — the points of the set are its seconds and the sets its periods;
  // the point bar under the court replaces the clock controls
  const vb = sport === 'volleyball';
  const vbScoring = vb && !!live && canLog;
  const picking = pendingPts !== null || pendingStat !== null;
  // soccer may change shape mid-game while the clock is paused (D108); every sport may at 0:00
  const canChangeFormationLive = !!live && sport === 'soccer' && !running;
  useServerTimeSync(!!live);
  // the clock starting clears the nudge (state adjusted during render, no effect)
  const [nudgedWhileRunning, setNudgedWhileRunning] = useState(running);
  if (running !== nudgedWhileRunning) {
    setNudgedWhileRunning(running);
    if (running) setNudge(false);
  }
  /** After a sub or a score: if the game is on but the clock is not, say so (never start it). */
  const nudgeIfPaused = () => {
    if (live && !running && !fullTime && !vb) setNudge(true);
  };
  // the page never ticks (D95): the clock, the shift times and the period alert tick on their own
  // inside leaf components, so an open sheet is never re-rendered or remounted by the clock
  useWakeLock(!!live && canLog);

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
  const serverSlots: string[] = useMemo(() => {
    if (!live) return formation.positions.map((_, i) => shown?.slots[i] ?? '');
    const on = onFieldBySlot(stints, periodIndex);
    return formation.positions.map((_, i) => on.get(i)?.player_id ?? '');
  }, [live, formation, shown, stints, periodIndex]);
  const slots = ahead?.slots ?? serverSlots;

  // the bench is a queue (D79): the lineup row's order, cleaned up client-side so it draws right before the server answers
  const rosterIds = useMemo(() => activePlayers.map((p) => p.id), [activePlayers]);
  const serverBench = shown?.bench;
  const queue = useMemo(
    () => benchQueue(ahead?.bench ?? serverBench ?? [], rosterIds, slots),
    [ahead?.bench, serverBench, rosterIds, slots],
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
  // volleyball: sets won so far and the current set's points; the match may be decided before the last set
  const sets = setsState(log, N, clock.periodIndex);
  const matchOver = vb && !!live && matchDecided(sets, N, clock.periodIndex);
  const shownScore = vb ? { us: sets.setUs, them: sets.setThem } : score;

  /**
   * A live lineup change (D113): the page shows `next` at once, the server calls run one after
   * another in tap order, and the toast offers Undo for a few seconds. Nothing waits for the
   * round trip, and the own view is dropped only once the last call has refetched.
   */
  const runLive = (
    call: Parameters<typeof act.mutateAsync>[0],
    next: { slots: string[]; bench: string[] } | null,
    message: string | ((result: string | null) => string) | null,
    undoable = true,
  ) => {
    if (next) {
      aheadRef.current = next;
      setAhead(next);
      nudgeIfPaused();
    }
    inFlight.current += 1;
    chain.current = chain.current
      .then(() => act.mutateAsync(call))
      .then((result) => {
        if (!message) return;
        const text = typeof message === 'string' ? message : message(result);
        toast(text, undoable ? { action: { label: 'Undo', onClick: undo } } : undefined);
      })
      .catch((e: unknown) => {
        aheadRef.current = null;
        setAhead(null);
        onError(e);
      })
      .finally(() => {
        inFlight.current -= 1;
        if (inFlight.current === 0) {
          aheadRef.current = null;
          setAhead(null);
        }
      });
  };
  /** The spots and the bench as the coach sees them now, including changes still on their way. */
  const liveBase = () => aheadRef.current ?? { slots: [...slots], bench: [...queue] };
  const liveAfter = (base: { slots: string[]; bench: string[] }, nextSlots: string[]) => ({
    slots: nextSlots,
    bench: benchAfterEdit(base.bench, rosterIds, base.slots, nextSlots),
  });
  const undo = () =>
    runLive(
      { kind: 'undo' },
      null,
      (kind) =>
        kind === 'swap' ? 'Swap undone' : kind === 'sub' ? 'Substitution undone' : 'Last change undone',
      false,
    );

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
    nudgeIfPaused();
    setLastScore({
      kind: 'score',
      text:
        side === 'them'
          ? `${live.opponent} +${kind.points}`
          : `${scorerId ? nameOf(scorerId) : 'Team'} +${kind.points}`,
    });
  };
  /** A tracked stat for the tapped jersey (D118): the same tap-then-jersey pattern as the points. */
  const recordStat = (type: StatType, playerId: string) => {
    const kind = S.scoring.stats?.find((k) => k.type === type);
    if (!kind || !live || !scoreTapAllowed()) return;
    addStat.mutate({ player_id: playerId, period_index: periodIndex, stat_type: type }, { onError });
    setPendingStat(null);
    nudgeIfPaused();
    setLastScore({ kind: 'stat', text: `${nameOf(playerId)} ${kind.label}` });
  };
  const lastEvent = log[log.length - 1];
  const statLog = statEvents.data ?? [];
  const lastStat = statLog[statLog.length - 1];
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
    if (lastScore?.kind === 'stat') {
      if (!lastStat || lastStat.id.startsWith('temp-')) return;
      deleteStat.mutate(lastStat.id, { onError });
      setLastScore(null);
      toast(`Removed · ${lastScore.text}`);
      return;
    }
    if (!lastEvent || lastEvent.id.startsWith('temp-')) return;
    deleteEvent.mutate(lastEvent.id, { onError });
    setLastScore(null);
    toast(`Removed · ${describeEvent(S, N, live?.opponent ?? '', lastEvent, names)}`);
  };
  const lastSettled =
    lastScore?.kind === 'stat'
      ? !!lastStat && !lastStat.id.startsWith('temp-')
      : !!lastEvent && !lastEvent.id.startsWith('temp-');

  /* ---------- template edits (no live game) ---------- */
  const commitTemplate = (period: Period, message?: string, undoable = false) => {
    // the starters as they stand, for the toast's Undo (D113)
    const before: Period = {
      formation: formation.name,
      slots: [...slots],
      auto: [...(shown?.auto ?? [])],
      bench: [...queue],
    };
    const bench = benchAfterEdit(period.bench ?? queue, rosterIds, slots, period.slots);
    saveStarters.mutate({ starters: { ...period, bench }, count: Math.max(1, fixed.length) }, { onError });
    if (message)
      toast(
        message,
        undoable
          ? { action: { label: 'Undo', onClick: () => commitTemplate(before, 'Change undone') } }
          : undefined,
      );
  };
  const templateTap = (o: TapAction) => {
    if (!shown) return;
    const p: Period = { formation: formation.name, slots: [...slots], auto: [...shown.auto] };
    if (o.action === 'move') {
      commitTemplate(assignSlot(p, o.slot, o.playerId).period, `${nameOf(o.playerId)} moved`, true);
    } else if (o.action === 'sub') {
      const i = p.slots.indexOf(o.off);
      if (i < 0) return;
      commitTemplate(assignSlot(p, i, o.on).period, `${nameOf(o.on)} starts for ${nameOf(o.off)}`, true);
    } else if (o.action === 'fill') {
      commitTemplate(assignSlot(p, o.slot, o.playerId).period, `${nameOf(o.playerId)} starts`, true);
    }
  };

  /* ---------- live game: atomic server calls, shown at once (D113) ---------- */
  const liveTap = (o: TapAction) => {
    const base = liveBase();
    if (o.action === 'move' || o.action === 'fill') {
      const next = base.slots.map((id) => (id === o.playerId ? '' : id));
      next[o.slot] = o.playerId;
      runLive(
        { kind: 'fill', playerId: o.playerId, slot: o.slot },
        liveAfter(base, next),
        o.action === 'move' ? `${nameOf(o.playerId)} moved` : `${nameOf(o.playerId)} on`,
      );
    } else if (o.action === 'sub') {
      runLive(
        { kind: 'sub', off: o.off, on: o.on },
        liveAfter(
          base,
          base.slots.map((id) => (id === o.off ? o.on : id)),
        ),
        `${nameOf(o.on)} on for ${nameOf(o.off)}`,
      );
    }
  };

  // taps on one side queue up (D113); each tap on the other side moves the next in line
  const tap = (target: Target) => {
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
    if (pendingStat !== null) {
      if (target.kind === 'field' && target.playerId) recordStat(pendingStat, target.playerId);
      else toast('Tap a player on the court');
      return;
    }
    if (!isStaff) return;
    const { action: o, queue: rest } = resolveTap(selected, target);
    setSelected(rest);
    if (o.action === 'select' || o.action === 'none') return;
    flash(o.action === 'sub' ? [o.off, o.on] : [o.playerId]);
    if (live) liveTap(o);
    else templateTap(o);
  };
  /** Exactly two in line on one side: positions on the field, or places in the bench line (D79). */
  const swapTwo = (pair: { kind: 'field' | 'bench'; a: string; b: string }) => {
    setSelected([]);
    flash([pair.a, pair.b]);
    if (pair.kind === 'bench') {
      const msg = `${nameOf(pair.a)} and ${nameOf(pair.b)} swap places in line`;
      if (live) {
        const base = liveBase();
        runLive(
          { kind: 'bench', a: pair.a, b: pair.b },
          { ...base, bench: benchSwap(base.bench, pair.a, pair.b) },
          msg,
        );
      } else if (shown)
        commitTemplate(
          {
            formation: formation.name,
            slots: [...slots],
            auto: [...shown.auto],
            bench: benchSwap(queue, pair.a, pair.b),
          },
          msg,
          true,
        );
      return;
    }
    const msg = `${nameOf(pair.a)} and ${nameOf(pair.b)} swap positions`;
    if (live) {
      const base = liveBase();
      const next = base.slots.map((id) => (id === pair.a ? pair.b : id === pair.b ? pair.a : id));
      runLive({ kind: 'swap', a: pair.a, b: pair.b }, { ...base, slots: next }, msg);
      return;
    }
    if (!shown) return;
    const p: Period = { formation: formation.name, slots: [...slots], auto: [...shown.auto] };
    const ia = p.slots.indexOf(pair.a);
    const ib = p.slots.indexOf(pair.b);
    if (ia < 0 || ib < 0) return;
    p.slots[ia] = pair.b;
    p.slots[ib] = pair.a;
    p.auto = p.auto.filter((k) => k !== ia && k !== ib);
    commitTemplate(p, msg, true);
  };
  /** Take the first on-field player in line off with nobody on: an injury in a live game, an open starter spot otherwise. */
  const openSpot = () => {
    const head = selected[0];
    if (!head || head.kind !== 'field' || !head.playerId) return;
    const { slot, playerId } = head;
    setSelected(selected.slice(1));
    if (live) {
      const base = liveBase();
      runLive(
        { kind: 'empty', off: playerId },
        liveAfter(
          base,
          base.slots.map((id) => (id === playerId ? '' : id)),
        ),
        `${nameOf(playerId)} off · spot open`,
      );
    } else if (shown) {
      const p: Period = { formation: formation.name, slots: [...slots], auto: [...shown.auto] };
      commitTemplate(
        assignSlot(p, slot, '').period,
        `${S.label(formation.positions[slot]?.role ?? '')} is open`,
        true,
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
  // eligible positions (D117): a group marked never keeps the player out of the picks
  const eligible = eligibleFn(eligibility.data);
  const withSkipped = (msg: string, skipped: readonly string[]) =>
    skipped.length ? `${msg} · ${skippedText(skipped)}` : msg;
  const onAutoFill = () => {
    if (!shown) return;
    const p: Period = { formation: formation.name, slots: [...slots], auto: [...shown.auto] };
    const offField = activePlayers.filter((pl) => !slots.includes(pl.id));
    const rank = seasonMinutes.data ?? new Map();
    const r = fillByTime(p, formation, S, offField, rank, { eligible });
    if (!r.filled) {
      toast(
        r.skipped.length
          ? skippedText(r.skipped)
          : offField.length
            ? 'No open spots'
            : 'Nobody left on the bench',
      );
      return;
    }
    const msg = withSkipped(
      `${r.filled} jersey${r.filled > 1 ? 's' : ''} filled by season minutes`,
      r.skipped,
    );
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
    const r = suggestStarters(formation, S, activePlayers, rank, { eligible });
    sendLineup(r.period, withSkipped('Starters picked by minutes this game', r.skipped));
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

  /** Volleyball (D121): end the set by hand; the next starts with the same six at zero. */
  const endSet = async () => {
    const last = clock.periodIndex >= N - 1;
    const ok = await sheet({
      title: `End set ${periodIndex + 1} at ${sets.setUs}–${sets.setThem}?`,
      message: last
        ? 'That is the last set. Finish the match from the game page when the score is in.'
        : `The same six start set ${periodIndex + 2}; the first serve goes to the other side.`,
      actions: [{ label: `End set ${periodIndex + 1}`, value: true }],
    });
    if (ok)
      act.mutate(
        { kind: 'vb_end_set' },
        { onError, onSuccess: () => toast(last ? 'Match over' : `Set ${periodIndex + 2}`) },
      );
  };

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
        <b>{shownScore.us}</b>
        <i aria-hidden="true">–</i>
        <b>{shownScore.them}</b>
        <small>THEM</small>
      </>
    );
    if (!canLog) {
      return live ? (
        <span className="score live" aria-label={`Score ${shownScore.us} to ${shownScore.them}`}>
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
            ? `Score ${shownScore.us} to ${shownScore.them}. Add a ${scoreNoun}`
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
  const title = live
    ? fullTime || matchOver
      ? vb
        ? 'Match over'
        : 'Full time'
      : shortPeriod(S, N, periodIndex)
    : 'Starters';
  // who keeps the stats (D120) rides on the title line unless the bar below offers a takeover
  const keeperNote = live && !canKeepStats(live, viewer) ? keeperText(live, userId) : null;
  const sub = live
    ? `Live vs ${live.opponent}${vb && N > 1 ? ` · sets ${sets.us}–${sets.them}` : ''}${keeperNote ? ` · ${keeperNote}` : ''}`
    : `${team.side_size} ${S.unit}${S.hasGK ? (team.has_gk ? ' incl. goalie' : ', no goalie') : ''} · ${vb ? `best of ${N}` : `${periodCountText(S, N)} on the clock`}${isStaff ? ' · tap jerseys to set the starters · tap the score to start a game' : ''}`;

  return (
    <section className="page">
      <JerseyDefs />
      <EditableTitle value={team.name} onSave={onRename} editable={isCoach} />
      <p className="sub">{sub}</p>
      {live && (
        <KeeperBar
          game={live}
          viewer={viewer}
          busy={keep.isPending}
          onKeep={() => keep.mutate(live.id, { onError, onSuccess: () => toast('You keep the stats') })}
        />
      )}
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
      {live && !vb && (
        <PeriodOverAlert
          gameId={live.id}
          clock={clock}
          periodMinutes={team.period_minutes}
          active={!!live && !fullTime}
          label={shortPeriod(S, N, periodIndex)}
        />
      )}
      {live && nudge && !running && !fullTime && !vb && (
        <div className="nudge" role="status">
          <span>Clock is paused</span>
          <Button
            size="sm"
            variant="primary"
            disabled={act.isPending}
            onClick={() => act.mutate({ kind: 'start' }, { onError })}
          >
            {clock.clockSeconds > 0 ? 'Resume' : 'Start clock'}
          </Button>
          <button type="button" className="nudgex" aria-label="Dismiss" onClick={() => setNudge(false)}>
            ×
          </button>
        </div>
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
              : pendingStat !== null
                ? (S.scoring.stats?.find((k) => k.type === pendingStat)?.question ?? 'Who?')
                : selectionHint(
                    selected,
                    nameOf,
                    formation.positions.map((p) => p.code),
                  )
          }
          hideTitle={title === 'Game'}
          pickable={picking}
          help={quickScoring && !fullTime ? `${MOVE_HELP} Tap the points scored.` : MOVE_HELP}
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
            ) : pendingStat !== null ? (
              <Button size="sm" variant="gray" onClick={() => setPendingStat(null)}>
                Cancel
              </Button>
            ) : undefined
          }
          onOpenSpot={selected[0]?.kind === 'field' && selected[0].playerId ? openSpot : undefined}
          onSwapPair={swapTwo}
          onFormationChange={onFormationChange}
          onTapSlot={(slot) => tap({ kind: 'field', slot, playerId: slots[slot] ?? '' })}
          onTapBench={(playerId) => tap({ kind: 'bench', playerId })}
          headerExtra={
            <>
              {live && !vb && (
                <ClockDisplay state={clock} periodMinutes={team.period_minutes} fullTime={fullTime} />
              )}
              {scoreButton()}
            </>
          }
          benchEmptyText={`Everyone is ${S.unit}`}
          parentOut={parentOut}
          outText={outText}
          timeLabel={vb ? pointsLabel : undefined}
          servingSlot={vb && live?.vb_serving === 'us' ? 0 : null}
        />
      </div>
      {vbScoring && live && (
        <VolleyballBar
          opponent={live.opponent}
          us={sets.setUs}
          them={sets.setThem}
          serving={live.vb_serving === 'us' || live.vb_serving === 'them' ? live.vb_serving : null}
          over={matchOver}
          disabled={act.isPending}
          canRun={isStaff}
          onPoint={(side) => {
            if (!scoreTapAllowed()) return;
            const us = sets.setUs + (side === 'us' ? 1 : 0);
            const them = sets.setThem + (side === 'them' ? 1 : 0);
            const won = setWon(us, them, setTarget(team, periodIndex, N), team.vb_win_by_two);
            const sideOut = side === 'us' && live.vb_serving === 'them';
            act.mutate(
              { kind: 'vb_point', side },
              {
                onError,
                onSuccess: () =>
                  toast(
                    won
                      ? `Set ${periodIndex + 1} ${won === 'us' ? 'won' : 'lost'} ${us}–${them}`
                      : sideOut
                        ? `Side-out · ${us}–${them} · rotated`
                        : `${side === 'us' ? 'Point' : live.opponent} · ${us}–${them}`,
                  ),
              },
            );
          }}
          onServe={(side) =>
            act.mutate(
              { kind: 'vb_serve', side },
              { onError, onSuccess: () => toast(side === 'us' ? 'We serve' : `${live.opponent} serve`) },
            )
          }
          onRotate={() => act.mutate({ kind: 'vb_rotate' }, { onError, onSuccess: () => toast('Rotated') })}
          onEndSet={() => void endSet()}
          onUndo={() =>
            act.mutate(
              { kind: 'vb_undo' },
              {
                onError,
                onSuccess: (kind) =>
                  toast(
                    kind === 'point'
                      ? 'Point undone'
                      : kind === 'rotate'
                        ? 'Rotation undone'
                        : 'Last change undone',
                  ),
              },
            )
          }
        />
      )}
      {quickScoring && !fullTime && (
        <QuickScoreRow
          S={S}
          pending={pendingPts}
          pendingStat={pendingStat}
          stats={team.tracked_stats}
          disabled={addEvent.isPending || addStat.isPending}
          last={lastScore ? { text: lastScore.text, onUndo: lastSettled ? undoLast : undefined } : null}
          onUs={(p) => setPendingPts(pendingPts === p ? null : p)}
          onThem={(p) => recordScore('them', p, null)}
          onStat={(t) => setPendingStat(pendingStat === t ? null : t)}
        />
      )}
      {canLog && live && (
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
          trackedStats={team.tracked_stats}
          onAddStat={(ev) => {
            addStat.mutate({ ...ev, period_index: periodIndex }, { onError });
            nudgeIfPaused();
            toast(
              `${names.name(ev.player_id) || 'Player'} · ${S.scoring.stats?.find((k) => k.type === ev.stat_type)?.noun ?? 'stat'}`,
            );
          }}
          onAdd={(ev) => {
            addEvent.mutate({ ...ev, period_index: periodIndex }, { onError });
            nudgeIfPaused();
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
          {live && vb ? (
            <Toolbar sticky className="mt-3 clockbar">
              {!fullTime && !matchOver && atZero && (
                <Button
                  variant="tinted"
                  disabled={act.isPending}
                  onClick={periodIndex === 0 ? onAutoFill : onSuggest}
                >
                  {periodIndex === 0 ? 'Auto-fill' : 'Suggest starters'}
                </Button>
              )}
              <Button
                variant={fullTime || matchOver ? 'primary' : 'tinted'}
                onClick={() => void navigate(`/games/${live.id}`)}
              >
                {fullTime || matchOver ? 'Finish on the game page' : 'Finish match'}
              </Button>
            </Toolbar>
          ) : live ? (
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
            ? vb
              ? 'Points, rotations and substitutions update live as the coach scores. The ball marks the server; each jersey shows the points of the current shift.'
              : 'The clock and substitutions update live as the coach makes them. Each jersey shows the current shift; minutes per player are on the Rotation view.'
            : highlight.size
              ? 'Your child’s jersey has a gold star and name. The starters update live while the coach edits them.'
              : 'The starters update live while the coach edits them.'}
        </Footer>
      )}
    </section>
  );
}
