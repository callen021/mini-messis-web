/** A saved run, as much of it as the stopwatch needs. */
export interface TimedRun {
  id: string;
  level: number;
  seconds: number;
  run_on: string;
  created_at: string;
}

/** Elapsed milliseconds as seconds to a tenth: what is shown is what is saved. */
export const toTenths = (ms: number): number => Math.max(0, Math.floor(ms / 100)) / 10;

/** "8.4", "59.9", "1:02.3". */
export function formatSeconds(seconds: number): string {
  const tenths = Math.round(seconds * 10);
  const m = Math.floor(tenths / 600);
  const rest = (tenths - m * 600) / 10;
  return m > 0 ? `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}` : rest.toFixed(1);
}

/** The fastest of the runs, or null when there are none. */
export function bestOf(runs: readonly TimedRun[]): number | null {
  return runs.reduce<number | null>((b, r) => (b === null || r.seconds < b ? r.seconds : b), null);
}

export interface RunVerdict {
  /** The best before this run; null when it was the first at this level. */
  previous: number | null;
  /** True for a first run and for a time under the previous best (a tie is not a new best). */
  beat: boolean;
  /** Seconds off the previous best: negative is faster. Null on a first run. */
  diff: number | null;
}

/** How a new time stands against the earlier runs at the same level. */
export function judge(seconds: number, earlier: readonly TimedRun[]): RunVerdict {
  const previous = bestOf(earlier);
  if (previous === null) return { previous, beat: true, diff: null };
  return { previous, beat: seconds < previous, diff: Math.round((seconds - previous) * 10) / 10 };
}
