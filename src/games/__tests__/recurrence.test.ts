import { describe, expect, it } from 'vitest';
import { type Practice } from '../practices';
import {
  MAX_SERIES,
  mergeSchedule,
  pastPractices,
  practiceLine,
  practiceMinutes,
  weekdayOf,
  weeklyDates,
} from '../recurrence';

const practice = (over: Partial<Practice>): Practice => ({
  id: over.id ?? 'p',
  team_id: 't',
  season_id: 's',
  practice_date: '2026-11-11',
  start_time: '18:30:00',
  end_time: null,
  location: null,
  notes: null,
  status: 'scheduled',
  created_at: '',
  created_by: null,
  updated_at: '',
  updated_by: null,
  ...over,
});

describe('weeklyDates', () => {
  it('expands every Wednesday in a range, inclusive of both ends', () => {
    expect(weeklyDates(3, '2026-11-11', '2026-12-02')).toEqual([
      '2026-11-11',
      '2026-11-18',
      '2026-11-25',
      '2026-12-02',
    ]);
  });
  it('starts at the first matching weekday after the first date', () => {
    expect(weeklyDates(3, '2026-11-09', '2026-11-20')).toEqual(['2026-11-11', '2026-11-18']);
    expect(weekdayOf('2026-11-11')).toBe(3);
  });
  it('is empty for reversed or malformed ranges and bad weekdays', () => {
    expect(weeklyDates(3, '2026-12-02', '2026-11-11')).toEqual([]);
    expect(weeklyDates(3, 'nope', '2026-11-11')).toEqual([]);
    expect(weeklyDates(7, '2026-11-11', '2026-12-11')).toEqual([]);
  });
  it('caps a runaway range', () => {
    expect(weeklyDates(1, '2026-01-05', '2036-01-05')).toHaveLength(MAX_SERIES);
  });
});

describe('schedule merge', () => {
  const games = [
    { id: 'g1', game_date: '2026-11-14', start_time: '09:00:00', status: 'upcoming' as const },
    { id: 'g2', game_date: '2026-11-01', start_time: null, status: 'done' as const },
    { id: 'g3', game_date: '2026-11-11', start_time: '17:00:00', status: 'upcoming' as const },
  ];
  const practices = [
    practice({ id: 'p1', practice_date: '2026-11-11', start_time: '18:30:00' }),
    practice({ id: 'p2', practice_date: '2026-11-04', start_time: '18:30:00' }),
    practice({ id: 'p3', practice_date: '2026-11-18', status: 'cancelled' }),
    practice({ id: 'p4', practice_date: '2026-11-11', start_time: null }),
  ];

  it('interleaves upcoming games and future practices by date then time; all-day first', () => {
    const items = mergeSchedule(games, practices, '2026-11-09');
    expect(items.map((i) => (i.kind === 'game' ? i.game.id : i.practice.id))).toEqual([
      'p4',
      'g3',
      'p1',
      'g1',
      'p3',
    ]);
  });
  it('keeps a cancelled practice on the schedule and drops completed games and past practices', () => {
    const items = mergeSchedule(games, practices, '2026-11-09');
    expect(items.some((i) => i.kind === 'practice' && i.practice.status === 'cancelled')).toBe(true);
    expect(items.some((i) => i.kind === 'game' && i.game.id === 'g2')).toBe(false);
    expect(pastPractices(practices, '2026-11-09').map((p) => p.id)).toEqual(['p2']);
  });
  it('today counts as upcoming', () => {
    expect(mergeSchedule([], [practice({ practice_date: '2026-11-11' })], '2026-11-11')).toHaveLength(1);
  });
});

describe('practice text', () => {
  it('writes date, time range and location', () => {
    const line = practiceLine({
      practice_date: '2026-11-11',
      start_time: '18:30:00',
      end_time: '19:30:00',
      location: 'Field 2',
    });
    expect(line).toMatch(/Nov 11, 2026 · 6:30 PM – 7:30 PM · Field 2$/);
    expect(
      practiceLine({ practice_date: '2026-11-11', start_time: null, end_time: null, location: null }, false),
    ).toBe('Nov 11');
  });
  it('computes the length only when both times exist and the end follows the start', () => {
    expect(practiceMinutes({ start_time: '18:30:00', end_time: '20:00:00' })).toBe(90);
    expect(practiceMinutes({ start_time: '18:30:00', end_time: null })).toBeNull();
    expect(practiceMinutes({ start_time: '18:30:00', end_time: '18:00:00' })).toBeNull();
  });
});
