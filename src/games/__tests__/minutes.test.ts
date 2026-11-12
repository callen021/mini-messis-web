import { describe, expect, it } from 'vitest';
import { SPORTS } from '@/sports/definitions';
import { eventTag } from '../names';
import { type PlayerStatRow, formatStat, isEmptyRow, profileTiles, statColumns, statValue } from '../stats';

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
  seconds_played: 0,
  ...over,
});

describe('minutes in the stats (D73)', () => {
  it('minutes played come from seconds, rounded down', () => {
    expect(formatStat(row({ seconds_played: 725 }), 'minutes_played')).toBe('12');
    expect(formatStat(row({ seconds_played: 59 }), 'minutes_played')).toBe('0');
    expect(statValue(row({ seconds_played: 90 }), 'minutes_played')).toBe(1.5);
  });

  it('clock mode swaps the periods column and tile for minutes; period mode is untouched', () => {
    const S = SPORTS.soccer;
    expect(statColumns(S, false)).toBe(S.scoring.columns);
    expect(profileTiles(S, false)).toBe(S.scoring.profile);
    expect(statColumns(S, true).map((c) => c.label)).toEqual(['G', 'A', 'MIN']);
    expect(profileTiles(S, true).map((c) => c.label)).toEqual(['Goals', 'Assists', 'Minutes', 'Games']);
    expect(statColumns(SPORTS.baseball, true).map((c) => c.label)).toContain('MIN');
    expect(statColumns(SPORTS.baseball, true).map((c) => c.label)).not.toContain('INN');
  });

  it('a removed player with only minutes is not an empty row', () => {
    expect(isEmptyRow(row({ removed: true, seconds_played: 300 }))).toBe(false);
    expect(isEmptyRow(row({ removed: true }))).toBe(true);
  });
});

describe('log tags with the clock minute (D74)', () => {
  it('adds the running minute when the event carries a clock second', () => {
    expect(eventTag('Half', { period_index: 1, clock_seconds: 1345 })).toBe("H2 23'");
    expect(eventTag('Half', { period_index: 0, clock_seconds: 0 })).toBe("H1 1'");
    expect(eventTag('Quarter', { period_index: 2, clock_seconds: null })).toBe('Q3');
    expect(eventTag('Inning', { period_index: 2 })).toBe('Inn 3');
    // a one-period game shows the minute only, no period label (D97)
    expect(eventTag('Game', { period_index: 0, clock_seconds: 1345 })).toBe("23'");
    expect(eventTag('Game', { period_index: 0, clock_seconds: null })).toBe('');
  });
});
