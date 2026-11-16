import { type ScoreEvent } from '@/games/api';
import { lineScore } from '@/games/stats';

/** The team settings the set rules read (D121). */
export interface SetRules {
  vb_set_points: number;
  vb_deciding_points: number;
  vb_win_by_two: boolean;
}

/** The points a set is played to: the deciding (last possible) set has its own target. */
export function setTarget(rules: SetRules, setIndex: number, setCount: number): number {
  return setCount > 1 && setIndex >= setCount - 1 ? rules.vb_deciding_points : rules.vb_set_points;
}

/** 'us' / 'them' when the set is won at this score, else null (mirrors `vb_set_won`). */
export function setWon(us: number, them: number, target: number, winByTwo: boolean): 'us' | 'them' | null {
  if (us >= target && (!winByTwo || us - them >= 2)) return 'us';
  if (them >= target && (!winByTwo || them - us >= 2)) return 'them';
  return null;
}

export interface SetsState {
  /** Sets won: the sets that have ended (before the current one), by the points in them. */
  us: number;
  them: number;
  /** Points in the current set. */
  setUs: number;
  setThem: number;
  /** Points per side per set, for the line. */
  line: { us: number[]; them: number[] };
}

/** Sets won and the current set's points from the log (mirrors `vb_sets_won`). */
export function setsState(events: readonly ScoreEvent[], setCount: number, currentSet: number): SetsState {
  const ls = lineScore(events, setCount);
  let us = 0;
  let them = 0;
  for (let p = 0; p < Math.min(currentSet, ls.n); p++) {
    const a = ls.us[p] ?? 0;
    const b = ls.them[p] ?? 0;
    if (a > b) us++;
    else if (b > a) them++;
  }
  const cur = Math.min(currentSet, setCount - 1);
  return { us, them, setUs: ls.us[cur] ?? 0, setThem: ls.them[cur] ?? 0, line: { us: ls.us, them: ls.them } };
}

/** The match is decided once a side has more than half the sets, or every set has been played. */
export function matchDecided(
  sets: Pick<SetsState, 'us' | 'them'>,
  setCount: number,
  currentSet: number,
): boolean {
  return currentSet >= setCount || sets.us * 2 > setCount || sets.them * 2 > setCount;
}

/** "4 pts" / "1 pt": a stint's length in points, under a jersey and in the playing-time lists. */
export function pointsLabel(points: number): string {
  const n = Math.max(0, Math.round(points));
  return `${n} pt${n === 1 ? '' : 's'}`;
}
