/* =====================================================================
   GAME CLOCK MATHS (D66). Everything here is pure and derives from server timestamps: the clock
   is `clockSeconds` banked while paused plus the time since `runningSince`. Nothing counts up on
   its own; a 1 s re-render re-derives the same number on every device.
   ===================================================================== */

export interface ClockState {
  /** Current period (0-based). Equal to the period count once the game reaches full time. */
  periodIndex: number;
  /** Seconds banked in the current period while the clock was paused. */
  clockSeconds: number;
  /** Server timestamp the clock has been running since; null when paused. */
  runningSince: string | null;
  /** Final length in seconds of each period ended so far. */
  periodLengths: readonly number[];
  /**
   * Period second the running stretch pauses itself at (D105): 30 minutes past the period length,
   * 90 minutes without one, or 30 minutes after a restart at that cap. Null or absent: no limit.
   */
  limitSeconds?: number | null;
  /** The last pause was the safety stop and nothing has moved since (D105). */
  autoPaused?: boolean;
}

export const PAUSED_CLOCK: ClockState = {
  periodIndex: 0,
  clockSeconds: 0,
  runningSince: null,
  periodLengths: [],
};

/** Seconds into the current period at `nowMs` (server time), never past the stretch's limit (D105). */
export function elapsedAt(state: ClockState, nowMs: number): number {
  if (!state.runningSince) return state.clockSeconds;
  const since = Date.parse(state.runningSince);
  if (Number.isNaN(since)) return state.clockSeconds;
  const run = Math.max(0, Math.floor((nowMs - since) / 1000));
  const room = state.limitSeconds == null ? Infinity : Math.max(0, state.limitSeconds - state.clockSeconds);
  return state.clockSeconds + Math.min(run, room);
}

/** The running stretch has reached its limit (D105): the server pauses it on the next read. */
export function atLimit(state: ClockState, nowMs: number): boolean {
  return !!state.runningSince && state.limitSeconds != null && elapsedAt(state, nowMs) >= state.limitSeconds;
}

export const isRunning = (state: ClockState): boolean => !!state.runningSince;

/** Full time: every period has been ended. */
export const isFullTime = (state: ClockState, periodCount: number): boolean =>
  state.periodIndex >= periodCount;

/** Seconds left in the period, negative once over. Null without a period length. */
export function remainingAt(state: ClockState, periodMinutes: number | null, nowMs: number): number | null {
  if (!periodMinutes) return null;
  return periodMinutes * 60 - elapsedAt(state, nowMs);
}

/** The short note shown on a game whose clock the safety stop paused (D105). */
export function capNote(state: ClockState, periodMinutes: number | null): string {
  return `Clock paused automatically at ${formatClock(state.clockSeconds)} · it ran ${
    periodMinutes ? `30 minutes past the ${periodMinutes}-minute period length` : '90 minutes'
  }. Resume runs it for up to another 30 minutes.`;
}

/** "12:05" — minutes and seconds; hours never happen in youth games. Negative values show "-0:30". */
export function formatClock(seconds: number): string {
  const sign = seconds < 0 ? '-' : '';
  const s = Math.abs(Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${sign}${m}:${String(s % 60).padStart(2, '0')}`;
}

/** "12 min" / "0 min" — whole minutes, rounded down, for played time. */
export function formatMinutes(seconds: number): string {
  return `${Math.floor(Math.max(0, seconds) / 60)} min`;
}

/** "23'" — the running minute of a period, football style (0:00–0:59 is the 1st minute). */
export function minuteLabel(periodSeconds: number): string {
  return `${Math.floor(Math.max(0, periodSeconds) / 60) + 1}'`;
}

/** Seconds of game clock from kickoff to `seconds` into `period`, using the ended periods' lengths. */
export function cumulativeSeconds(state: ClockState, period: number, seconds: number): number {
  let total = 0;
  for (let i = 0; i < period; i++) total += state.periodLengths[i] ?? 0;
  return total + seconds;
}

/* ---------- stints ---------- */

export interface Stint {
  id: string;
  player_id: string;
  period_index: number;
  slot_index: number;
  position_role: string;
  position_code: string;
  clock_start: number;
  clock_end: number | null;
  /** Continues the player's previous stint after a formation change (D108): no new shift. */
  continues?: boolean;
}

/** Seconds a stint has lasted at `nowMs`: closed ones are fixed, open ones run with the clock. */
export function stintSeconds(stint: Stint, state: ClockState, nowMs: number): number {
  if (stint.clock_end !== null) return Math.max(0, stint.clock_end - stint.clock_start);
  if (stint.period_index !== state.periodIndex) return 0;
  return Math.max(0, elapsedAt(state, nowMs) - stint.clock_start);
}

export interface PlayerTime {
  /** Seconds on the field this game. */
  seconds: number;
  /** Stints with any length, plus the open one; a continuation after a formation change does not count. */
  shifts: number;
  onField: boolean;
  /** Spot and code while on the field. */
  slot: number | null;
  code: string;
  /** Seconds of the current shift (0 off the field). */
  shiftSeconds: number;
  /** Seconds of game clock since last leaving the field (since kickoff if never on). */
  restSeconds: number;
}

/** Per-player playing time from the stints, at `nowMs`. Every id in `playerIds` gets an entry. */
export function playerTimes(
  stints: readonly Stint[],
  state: ClockState,
  nowMs: number,
  playerIds: readonly string[],
): Map<string, PlayerTime> {
  const nowTotal = cumulativeSeconds(state, state.periodIndex, elapsedAt(state, nowMs));
  const out = new Map<string, PlayerTime>();
  for (const id of playerIds)
    out.set(id, {
      seconds: 0,
      shifts: 0,
      onField: false,
      slot: null,
      code: '',
      shiftSeconds: 0,
      restSeconds: nowTotal,
    });
  const lastOff = new Map<string, number>();
  // where the current run of stints began: a continuation (formation change) keeps the shift going
  const chainStart = new Map<string, { period: number; start: number }>();
  const ordered = [...stints].sort(
    (a, b) =>
      a.period_index - b.period_index ||
      a.clock_start - b.clock_start ||
      Number(!!a.continues) - Number(!!b.continues),
  );
  for (const st of ordered) {
    const t = out.get(st.player_id);
    if (!t) continue;
    const secs = stintSeconds(st, state, nowMs);
    t.seconds += secs;
    const prev = chainStart.get(st.player_id);
    const continues = !!st.continues && !!prev && prev.period === st.period_index;
    if (!continues) chainStart.set(st.player_id, { period: st.period_index, start: st.clock_start });
    if ((secs > 0 || st.clock_end === null) && !continues) t.shifts += 1;
    if (st.clock_end === null && st.period_index === state.periodIndex) {
      t.onField = true;
      t.slot = st.slot_index;
      t.code = st.position_code;
      const start = chainStart.get(st.player_id)?.start ?? st.clock_start;
      t.shiftSeconds = Math.max(0, elapsedAt(state, nowMs) - start);
      t.restSeconds = 0;
    } else if (st.clock_end !== null) {
      const off = cumulativeSeconds(state, st.period_index, st.clock_end);
      lastOff.set(st.player_id, Math.max(lastOff.get(st.player_id) ?? 0, off));
    }
  }
  for (const [id, off] of lastOff) {
    const t = out.get(id);
    if (t && !t.onField) t.restSeconds = Math.max(0, nowTotal - off);
  }
  return out;
}

export interface MinutesBalance {
  min: number;
  max: number;
  /** Mean in whole minutes, one decimal, as a string. */
  average: string;
  /** Meter fill 0–100 (min ÷ max). */
  percent: number;
  /** More than five minutes between the most- and least-used player. */
  spread: boolean;
}

/** Playing-time summary in minutes, informational only (never enforced). */
export function minutesBalance(seconds: readonly number[]): MinutesBalance | null {
  if (!seconds.length) return null;
  const mins = seconds.map((s) => s / 60);
  const min = Math.floor(Math.min(...mins));
  const max = Math.floor(Math.max(...mins));
  const average = (mins.reduce((a, b) => a + b, 0) / mins.length).toFixed(1);
  return { min, max, average, percent: max ? Math.round((100 * min) / max) : 0, spread: max - min > 5 };
}

/** The players who started the game: first-period stints that begin at zero, by spot. */
export function starters(stints: readonly Stint[]): Map<number, string> {
  const out = new Map<number, string>();
  for (const st of stints) {
    if (st.period_index === 0 && st.clock_start === 0 && !st.continues && !out.has(st.slot_index))
      out.set(st.slot_index, st.player_id);
  }
  return out;
}

/** The open stint per spot in `period`. */
export function onFieldBySlot(stints: readonly Stint[], period: number): Map<number, Stint> {
  const out = new Map<number, Stint>();
  for (const st of stints)
    if (st.clock_end === null && st.period_index === period) out.set(st.slot_index, st);
  return out;
}
