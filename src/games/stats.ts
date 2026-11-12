import { type StatKey } from '@/sports/types';
import { type ScoreEvent } from './api';

export interface Scored {
  status: 'upcoming' | 'live' | 'done';
  us: number;
  them: number;
}

export type GameResult = 'W' | 'L' | 'D';

export const gameResult = (g: { us: number; them: number }): GameResult =>
  g.us > g.them ? 'W' : g.us < g.them ? 'L' : 'D';

export interface TeamRecord {
  /** Completed games. */
  gp: number;
  w: number;
  l: number;
  d: number;
  /** Scored / allowed across every game in the list (live games included, as in the legacy app). */
  gf: number;
  ga: number;
}

/** Legacy `teamStats`: W/L/D from completed games only; totals from every game given. */
export function teamRecord(list: readonly Scored[]): TeamRecord {
  const r: TeamRecord = { gp: 0, w: 0, l: 0, d: 0, gf: 0, ga: 0 };
  for (const g of list) {
    r.gf += g.us;
    r.ga += g.them;
    if (g.status !== 'done') continue;
    r.gp++;
    const res = gameResult(g);
    if (res === 'W') r.w++;
    else if (res === 'L') r.l++;
    else r.d++;
  }
  return r;
}

/** Completed games, newest first (the Results list on Stats → Season). */
export function completedGames<G extends { status: string; game_date: string; created_at: string }>(
  list: readonly G[],
): G[] {
  return list
    .filter((g) => g.status === 'done')
    .sort((a, b) => b.game_date.localeCompare(a.game_date) || b.created_at.localeCompare(a.created_at));
}

/** "+3" / "0" / "-2". */
export const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

/** Row shape returned by `player_season_stats`. */
export interface PlayerStatRow {
  player_id: string;
  name: string;
  number: string | null;
  removed: boolean;
  games_played: number;
  periods_played: number;
  goals: number;
  assists: number;
  points: number;
  field_goals: number;
  three_pointers: number;
  free_throws: number;
  runs: number;
  plate_appearances: number;
  at_bats: number;
  hits: number;
  doubles: number;
  triples: number;
  home_runs: number;
  rbi: number;
  walks: number;
  strikeouts: number;
  /** Clock mode (D69): seconds on the field, derived from stints. */
  seconds_played: number;
}

/** Numeric value of a column (AVG is derived). */
export function statValue(row: PlayerStatRow, key: StatKey): number {
  if (key === 'avg') return row.at_bats ? row.hits / row.at_bats : 0;
  return row[key] ?? 0;
}

/** Display text: ".333" for averages, plain integers otherwise. */
export function formatStat(row: PlayerStatRow, key: StatKey): string {
  if (key === 'avg') {
    if (!row.at_bats) return '–';
    return (row.hits / row.at_bats).toFixed(3).replace(/^0/, '');
  }
  return String(row[key] ?? 0);
}

/** True when the row has nothing to show (hidden for removed players, as in the legacy app). */
export const isEmptyRow = (row: PlayerStatRow): boolean =>
  row.periods_played === 0 &&
  row.goals === 0 &&
  row.assists === 0 &&
  row.points === 0 &&
  row.runs === 0 &&
  row.plate_appearances === 0;

/**
 * Sort like the legacy table: the sport's hot column, then the other columns in order, then name.
 */
export function sortRows(
  rows: readonly PlayerStatRow[],
  columns: readonly StatKey[],
  hot: StatKey,
): PlayerStatRow[] {
  const order: StatKey[] = [hot, ...columns.filter((k) => k !== hot && k !== 'avg')];
  return [...rows]
    .filter((r) => !r.removed || !isEmptyRow(r))
    .sort((a, b) => {
      for (const k of order) {
        const diff = statValue(b, k) - statValue(a, k);
        if (diff) return diff;
      }
      return a.name.localeCompare(b.name);
    });
}

/** Points per side per period from the log (the client-side twin of the `game_line_score` view). */
export function lineScore(events: readonly ScoreEvent[], periodCount: number) {
  const n = Math.max(periodCount, ...events.map((e) => e.period_index + 1), 1);
  const us = Array<number>(n).fill(0);
  const them = Array<number>(n).fill(0);
  for (const e of events) {
    const row = e.side === 'us' ? us : them;
    row[e.period_index] = (row[e.period_index] ?? 0) + e.points;
  }
  return { us, them, n };
}
