import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { LoadingScreen, useIsCoach, useIsStaff } from '@/auth/guards';
import { Button, Toolbar } from '@/components/Button';
import { EditableTitle } from '@/components/EditableTitle';
import { Footer } from '@/components/List';
import { useActionSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { useAddScoreEvent, useCreateGame, useDeleteScoreEvent, useScoreEvents } from '@/games/api';
import { makeNameLookup } from '@/games/names';
import { NewGameSheet } from '@/games/NewGameSheet';
import { ScorePanel } from '@/games/ScorePanel';
import { describeEvent, scoreNoun as scoreNounFor } from '@/games/scoring';
import { hapticTick } from '@/lib/haptics';
import { errorMessage } from '@/lib/supabase';
import { useUIStore } from '@/lib/ui-store';
import { JerseyDefs } from '@/lineups/Jersey';
import { PlayerPickerSheet } from '@/lineups/PlayerPickerSheet';
import { playerName, toEnginePlayers, useCurrentPlan, useFormations, useMyChildren } from '@/lineups/api';
import { toEnginePeriods } from '@/lineups/convert';
import { SPORTS, periodPlural, shortPeriod } from '@/sports/definitions';
import { assignSlot, clearAll, fixPeriods } from '@/sports/lineup';
import { type Period } from '@/sports/types';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useRenameTeam } from '@/teams/teamMutations';
import { useClockAction, useGameClock, useServerTimeSync, useStints } from './api';
import { type BenchEntry } from './BenchRow';
import {
  PAUSED_CLOCK,
  benchOrder,
  elapsedAt,
  formatClock,
  formatMinutes,
  isFullTime,
  isRunning,
  onFieldBySlot,
  playerTimes,
  remainingAt,
} from './clock';
import { ClockCard } from './ClockCard';
import { ClockDisplay } from './ClockDisplay';
import { type Selection, type TapOutcome, resolveTap, selectionHint } from './tap';
import { useServerNow } from './useNow';
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
  const live = plan.liveGame;
  const gameId = plan.gameId;
  const saveStarters = useSaveStarters(teamId);
  const act = useClockAction(teamId, gameId ?? '');
  const clockQ = useGameClock(gameId ?? undefined, !!live);
  const stintsQ = useStints(gameId ?? undefined, !!live);
  const events = useScoreEvents(gameId ?? undefined);
  const addEvent = useAddScoreEvent(teamId, gameId ?? '');
  const deleteEvent = useDeleteScoreEvent(teamId, gameId ?? '');
  const createGame = useCreateGame(teamId);
  const [selected, setSelected] = useState<Selection>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const [scoring, setScoring] = useState(false);
  const [starting, setStarting] = useState(false);

  const clock = clockQ.data ?? PAUSED_CLOCK;
  const running = !!live && isRunning(clock);
  useServerTimeSync(!!live);
  const now = useServerNow(running);
  useWakeLock(!!live && isStaff);

  const allPlayers = useMemo(() => players.data ?? [], [players.data]);
  const enginePlayers = useMemo(() => toEnginePlayers(allPlayers), [allPlayers]);
  const activePlayers = useMemo(() => allPlayers.filter((p) => p.is_available), [allPlayers]);
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

  const times = useMemo(
    () =>
      live
        ? playerTimes(
            stints,
            clock,
            now,
            activePlayers.map((p) => p.id),
          )
        : null,
    [live, stints, clock, now, activePlayers],
  );
  const bench: BenchEntry[] = useMemo(() => {
    const off = activePlayers.filter((p) => !slots.includes(p.id));
    if (!times) return off.map((player) => ({ player }));
    return benchOrder(off, times).map((player) => {
      const t = times.get(player.id);
      return {
        player,
        time: t ? `${formatMinutes(t.seconds)} · rest ${formatClock(t.restSeconds)}` : undefined,
      };
    });
  }, [activePlayers, slots, times]);
  const slotTimes = useMemo(
    () => (times ? slots.map((id) => (id ? formatClock(times.get(id)?.shiftSeconds ?? 0) : '')) : undefined),
    [times, slots],
  );

  // alert once when a timed period reaches zero (never ends it, D66)
  const left = live ? remainingAt(clock, team.period_minutes, now) : null;
  const wasOver = useRef(false);
  useEffect(() => {
    const over = left !== null && left <= 0;
    if (over && !wasOver.current && live) {
      hapticTick();
      window.setTimeout(hapticTick, 150);
      window.setTimeout(hapticTick, 300);
      toast(`Time · ${shortPeriod(S, N, periodIndex)} is over`);
    }
    wasOver.current = over;
  }, [left, live, toast, S, N, periodIndex]);

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

  /* ---------- template edits (no live game) ---------- */
  const commitTemplate = (period: Period, message?: string) => {
    saveStarters.mutate({ starters: period, count: Math.max(1, fixed.length) }, { onError });
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
    const o = resolveTap(selected, target);
    if (o.action === 'select') {
      setSelected(o.selection);
      return;
    }
    if (o.action === 'none') return;
    setSelected(null);
    if (o.action === 'cancel') return;
    if (o.action === 'picker') {
      setPicking(o.slot);
      return;
    }
    if (live) liveTap(o);
    else templateTap(o);
  };

  const onPick = (slot: number, playerId: string) => {
    if (live) {
      if (!playerId) return; // nothing to clear: the picker only opens on an empty spot during a game
      liveTap({ action: 'fill', playerId, slot });
      return;
    }
    if (!shown) return;
    const p: Period = { formation: formation.name, slots: [...slots], auto: [...shown.auto] };
    const r = assignSlot(p, slot, playerId);
    const pos = formation.positions[slot];
    const msg = !playerId
      ? `${S.label(pos?.role ?? '')} is open`
      : r.movedFrom !== null
        ? `${nameOf(playerId)} moved`
        : `${nameOf(playerId)} in at ${pos?.code ?? ''}`;
    commitTemplate(r.period, msg);
  };

  const onFormationChange = (name: string) => {
    if (!shown) return;
    const to = formationFor(name);
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
    const title = `End ${shortPeriod(S, N, periodIndex)} at ${formatClock(elapsedAt(clock, now))}?`;
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
        onClick={() => (live ? setScoring(true) : setStarting(true))}
      >
        {inner}
      </button>
    );
  };

  const title = live ? (fullTime ? 'Full time' : shortPeriod(S, N, periodIndex)) : 'Starters';
  const sub = live
    ? `Live vs ${live.opponent} · US ${score.us} – ${score.them} THEM${isStaff ? ' · tap a jersey, then another, to swap' : ''}`
    : `${team.side_size} ${S.unit}${S.hasGK ? (team.has_gk ? ' incl. goalie' : ', no goalie') : ''} · ${N} ${periodPlural(S, N)} on the clock${isStaff ? ' · tap jerseys to set the starters · tap the score to start a game' : ''}`;
  const pickSlot = picking !== null ? formation.positions[picking] : undefined;
  const periodNoun = S.periodName(N).toLowerCase();
  const atZero = !!live && elapsedAt(clock, now) === 0 && !isRunning(clock);

  return (
    <section className="page">
      <JerseyDefs />
      <EditableTitle value={team.name} onSave={onRename} editable={isCoach} />
      <p className="sub">
        {sub}
        {(saveStarters.isPending || act.isPending) && (
          <span className="pill" style={{ marginLeft: 8 }}>
            Saving…
          </span>
        )}
      </p>
      <div className="quarters">
        <ClockCard
          sport={sport}
          S={S}
          view={view}
          title={title}
          formation={formation}
          forms={forms}
          slots={slots}
          slotTimes={slotTimes}
          players={allPlayers}
          bench={bench}
          colors={colors}
          canEdit={isStaff && !fullTime}
          canChangeFormation={!live || atZero}
          highlight={highlight}
          selected={selected}
          hint={selectionHint(selected, nameOf)}
          onFormationChange={onFormationChange}
          onTapSlot={(slot) => tap({ kind: 'field', slot, playerId: slots[slot] ?? '' })}
          onTapBench={(playerId) => tap({ kind: 'bench', playerId })}
          headerExtra={
            <>
              {live && (
                <ClockDisplay
                  state={clock}
                  periodMinutes={team.period_minutes}
                  nowMs={now}
                  fullTime={fullTime}
                />
              )}
              {scoreButton()}
            </>
          }
          benchEmptyText={`Everyone is ${S.unit}`}
        />
      </div>
      {isStaff && (
        <PlayerPickerSheet
          open={picking !== null}
          onClose={() => setPicking(null)}
          title={pickSlot ? `${title} · ${S.label(pickSlot.role)}` : title}
          bench={bench.map((b) => b.player)}
          onField={activePlayers
            .filter((p) => slots.includes(p.id))
            .map((player) => ({ player, code: formation.positions[slots.indexOf(player.id)]?.code ?? '' }))}
          assigned={null}
          counts={{}}
          periodNoun={periodNoun}
          labelFor={(p) => {
            const t = times?.get(p.id);
            return `${p.jersey_number ? `#${p.jersey_number} ` : ''}${playerName(p)}${t ? ` · ${formatMinutes(t.seconds)}` : ''}`;
          }}
          onPick={(id) => {
            if (picking !== null) onPick(picking, id);
          }}
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
          names={names}
          events={log}
          onAdd={(ev) => {
            addEvent.mutate({ ...ev, period_index: periodIndex }, { onError });
            toast(
              ev.side === 'them'
                ? `${live.opponent} scored · ${shortPeriod(S, N, periodIndex)} ${formatClock(elapsedAt(clock, now))}`
                : `${S.scoring.events[0]?.label === 'Goal' ? 'Goal!' : 'Scored!'} ${names.name(ev.scorer_player_id) || 'Unknown'} · ${shortPeriod(S, N, periodIndex)} ${formatClock(elapsedAt(clock, now))}`,
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
            )
          }
        />
      )}
      {isStaff ? (
        <>
          <Footer className="noprint" style={{ marginTop: 14 }}>
            {live
              ? `Tap a bench player and then a jersey to substitute on the running clock; tap two jerseys to swap positions. Each jersey shows the current shift; the bench shows minutes played and time resting, fewest minutes first. End ${periodNoun === 'inning' ? 'the inning' : `the ${periodNoun}`} to stop the clock and carry everyone over.`
              : `These are the starters for the next game. Tap jerseys to swap or pick players; the bench row is everyone else who is available. The clock starts on the Field once a game is on.`}
          </Footer>
          {live ? (
            <Toolbar sticky className="mt-3 clockbar">
              {!fullTime && (
                <Button
                  variant={running ? 'gray' : 'primary'}
                  disabled={act.isPending}
                  onClick={() => act.mutate({ kind: running ? 'pause' : 'start' }, { onError })}
                >
                  {running ? 'Pause' : elapsedAt(clock, now) > 0 ? 'Resume' : 'Start clock'}
                </Button>
              )}
              {!fullTime && (
                <Button variant="tinted" disabled={act.isPending} onClick={() => void endPeriod()}>
                  End {shortPeriod(S, N, periodIndex)}
                </Button>
              )}
              {!fullTime && (
                <Button variant="gray" disabled={act.isPending} onClick={undo}>
                  Undo last sub
                </Button>
              )}
              {fullTime && (
                <Button onClick={() => void navigate(`/games/${live.id}`)}>Finish on the game page</Button>
              )}
            </Toolbar>
          ) : (
            <Toolbar sticky className="mt-3">
              <Button variant="gray" onClick={() => void onClear()}>
                Clear
              </Button>
              <Button variant="gray" onClick={() => window.print()}>
                Print
              </Button>
            </Toolbar>
          )}
        </>
      ) : (
        <>
          <Footer className="noprint" style={{ marginTop: 14 }}>
            {live
              ? 'The clock and substitutions update live as the coach makes them. Each jersey shows the current shift; the bench shows minutes played.'
              : highlight.size
                ? 'Your child’s jersey has a gold star and name. The starters update live while the coach edits them.'
                : 'The starters update live while the coach edits them.'}
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
