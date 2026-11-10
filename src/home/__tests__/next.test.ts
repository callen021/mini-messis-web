import { describe, expect, it } from 'vitest';
import { type Practice } from '@/games/practices';
import { mergeSchedule } from '@/games/recurrence';
import { nextEvent } from '../next';

const practice = (over: Partial<Practice>): Practice => ({
  id: 'p',
  team_id: 't',
  season_id: 's',
  practice_date: '2030-05-12',
  start_time: '18:30:00',
  end_time: null,
  location: null,
  address: null,
  notes: null,
  status: 'scheduled',
  created_at: '',
  created_by: null,
  updated_at: '',
  updated_by: null,
  ...over,
});

describe('nextEvent', () => {
  it('skips cancelled practices and takes the earliest remaining item', () => {
    const items = mergeSchedule(
      [{ id: 'g', game_date: '2030-05-13', start_time: '09:00:00', status: 'upcoming' as const }],
      [practice({ id: 'c', practice_date: '2030-05-11', status: 'cancelled' }), practice({ id: 'p' })],
      '2030-05-10',
    );
    const next = nextEvent(items);
    expect(next?.kind).toBe('practice');
    expect(next && next.kind === 'practice' ? next.practice.id : '').toBe('p');
  });
  it('is null with nothing coming up', () => {
    expect(nextEvent([])).toBeNull();
    expect(nextEvent(mergeSchedule([], [practice({ status: 'cancelled' })], '2030-05-10'))).toBeNull();
  });
});
