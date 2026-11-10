import { describe, expect, it } from 'vitest';
import { type ScoreEvent } from '../api';
import {
  completedGames,
  formatStat,
  gameResult,
  isEmptyRow,
  lineScore,
  type PlayerStatRow,
  signed,
  sortRows,
  teamRecord,
} from '../stats';

const row = (over: Partial<PlayerStatRow>): PlayerStatRow => ({
  player_id: 'p',
  name: 'P',
  number: null,
  removed: false,
  games_played: 0,
  periods_played: 0,
  goals: 0,
  assists: 0,
  points: 0,
  field_goals: 0,
  three_pointers: 0,
  free_throws: 0,
  runs: 0,
  plate_appearances: 0,
  at_bats: 0,
  hits: 0,
  doubles: 0,
  triples: 0,
  home_runs: 0,
  rbi: 0,
  walks: 0,
  strikeouts: 0,
  ...over,
});

describe('completedGames', () => {
  it('keeps only finished games, newest first, ties broken by creation time', () => {
    const list = [
      { id: 'a', status: 'done', game_date: '2026-10-01', created_at: '1' },
      { id: 'live', status: 'live', game_date: '2026-11-09', created_at: '5' },
      { id: 'b', status: 'done', game_date: '2026-10-20', created_at: '2' },
      { id: 'up', status: 'upcoming', game_date: '2026-11-20', created_at: '6' },
      { id: 'c', status: 'done', game_date: '2026-10-20', created_at: '3' },
    ];
    expect(completedGames(list).map((g) => g.id)).toEqual(['c', 'b', 'a']);
    expect(completedGames([])).toEqual([]);
  });
});

describe('team record', () => {
  it('counts W/L/D from completed games only but totals from every game (legacy teamStats)', () => {
    const r = teamRecord([
      { status: 'done', us: 3, them: 1 },
      { status: 'done', us: 0, them: 2 },
      { status: 'done', us: 2, them: 2 },
      { status: 'live', us: 1, them: 0 },
    ]);
    expect(r).toEqual({ gp: 3, w: 1, l: 1, d: 1, gf: 6, ga: 5 });
  });
  it('results and signed diff', () => {
    expect(gameResult({ us: 2, them: 1 })).toBe('W');
    expect(gameResult({ us: 1, them: 1 })).toBe('D');
    expect(signed(3)).toBe('+3');
    expect(signed(-1)).toBe('-1');
    expect(signed(0)).toBe('0');
  });
});

describe('player rows', () => {
  it('formats the batting average from hits / at-bats', () => {
    expect(formatStat(row({ hits: 1, at_bats: 3 }), 'avg')).toBe('.333');
    expect(formatStat(row({ hits: 3, at_bats: 3 }), 'avg')).toBe('1.000');
    expect(formatStat(row({ at_bats: 0 }), 'avg')).toBe('–');
    expect(formatStat(row({ goals: 4 }), 'goals')).toBe('4');
  });
  it('sorts by the hot column, then the other columns, then name; hides empty removed players', () => {
    const rows = [
      row({ player_id: 'a', name: 'Zed', goals: 1, assists: 2 }),
      row({ player_id: 'b', name: 'Amy', goals: 1, assists: 2 }),
      row({ player_id: 'c', name: 'Gone', removed: true }),
      row({ player_id: 'd', name: 'Old', removed: true, goals: 3 }),
    ];
    const sorted = sortRows(rows, ['goals', 'assists', 'periods_played'], 'goals');
    expect(sorted.map((r) => r.name)).toEqual(['Old', 'Amy', 'Zed']);
    expect(isEmptyRow(rows[2] as PlayerStatRow)).toBe(true);
  });
});

describe('line score', () => {
  const ev = (side: 'us' | 'them', period: number, points = 1): ScoreEvent => ({
    id: Math.random().toString(),
    game_id: 'g',
    side,
    period_index: period,
    event_type: 'run',
    points,
    scorer_player_id: null,
    assist_player_id: null,
    occurred_at: '',
    created_by: null,
    created_at: '',
    updated_at: '',
    updated_by: null,
  });
  it('sums points per side per period and grows for extra innings', () => {
    const ls = lineScore([ev('us', 0), ev('us', 0), ev('them', 1), ev('us', 6, 2)], 6);
    expect(ls.n).toBe(7);
    expect(ls.us).toEqual([2, 0, 0, 0, 0, 0, 2]);
    expect(ls.them).toEqual([0, 1, 0, 0, 0, 0, 0]);
  });
});
