import { describe, expect, it } from 'vitest';
import {
  type RsvpRow,
  countText,
  heldOutNote,
  outByReply,
  outCaption,
  outSplit,
  parentLocked,
  plannedGame,
  repliesFor,
  rsvpCount,
  statusOf,
} from '../rsvp';

const row = (over: Partial<RsvpRow>): RsvpRow => ({
  id: 'r',
  team_id: 't',
  game_id: null,
  practice_id: null,
  player_id: 'p',
  status: 'going',
  set_by_role: 'parent',
  set_by: null,
  updated_at: '2026-11-13T00:00:00Z',
  ...over,
});

describe('RSVP rules (D107)', () => {
  it('repliesFor keeps only the rows of the given event', () => {
    const rows = [
      row({ game_id: 'g1', player_id: 'a', status: 'out' }),
      row({ game_id: 'g2', player_id: 'a', status: 'going' }),
      row({ practice_id: 'g1', player_id: 'b', status: 'going' }),
    ];
    const g1 = repliesFor(rows, { kind: 'game', id: 'g1' });
    expect([...g1.keys()]).toEqual(['a']);
    expect(statusOf(g1, 'a')).toBe('out');
    expect(statusOf(g1, 'b')).toBe('none');
    expect([...repliesFor(rows, { kind: 'practice', id: 'g1' }).keys()]).toEqual(['b']);
    expect(repliesFor(rows, null).size).toBe(0);
    expect([...outByReply(g1)]).toEqual(['a']);
  });

  it('the row count treats no reply as in and the coach flag as out', () => {
    const players = [
      { id: 'a', is_available: true, archived_at: null },
      { id: 'b', is_available: true, archived_at: null },
      { id: 'c', is_available: false, archived_at: null },
      { id: 'd', is_available: true, archived_at: '2026-01-01' },
    ];
    const replies = repliesFor([row({ game_id: 'g', player_id: 'b', status: 'out' })], {
      kind: 'game',
      id: 'g',
    });
    expect(rsvpCount(players, replies)).toEqual({ in: 1, out: 2 });
    expect(countText({ in: 9, out: 2 })).toBe('9 in · 2 out');
    expect(rsvpCount(players, new Map())).toEqual({ in: 2, out: 1 });
  });

  it('the planned game is the live one, else the first upcoming from today; stale ones are skipped', () => {
    const g = (
      id: string,
      game_date: string,
      status: 'upcoming' | 'live' | 'done',
      start_time: string | null = null,
    ) => ({
      id,
      game_date,
      start_time,
      status,
    });
    const today = '2026-11-13';
    expect(
      plannedGame([g('old', '2026-11-01', 'upcoming'), g('next', '2026-11-20', 'upcoming')], today)?.id,
    ).toBe('next');
    expect(
      plannedGame(
        [g('later', '2026-11-13', 'upcoming', '15:00'), g('first', '2026-11-13', 'upcoming', '09:00')],
        today,
      )?.id,
    ).toBe('first');
    expect(
      plannedGame([g('next', '2026-11-20', 'upcoming'), g('live', '2026-11-10', 'live')], today)?.id,
    ).toBe('live');
    expect(
      plannedGame([g('old', '2026-11-01', 'upcoming'), g('done', '2026-11-12', 'done')], today),
    ).toBeNull();
  });

  it('the Field splits out-by-reply players by who said so, and words the note and the caption', () => {
    const replies = repliesFor(
      [
        row({ game_id: 'g', player_id: 'a', status: 'out', set_by_role: 'parent' }),
        row({ game_id: 'g', player_id: 'b', status: 'out', set_by_role: 'coach' }),
        row({ game_id: 'g', player_id: 'c', status: 'going', set_by_role: 'parent' }),
      ],
      { kind: 'game', id: 'g' },
    );
    const split = outSplit(replies);
    expect([...split.out].sort()).toEqual(['a', 'b']);
    expect([...split.byParent]).toEqual(['a']);
    expect(heldOutNote([], 'Lions')).toBe('');
    expect(heldOutNote([{ name: 'Nolan', byParent: true }], 'Lions')).toBe(
      'A parent says Nolan can’t make it vs Lions.',
    );
    expect(
      heldOutNote(
        [
          { name: 'Nolan', byParent: true },
          { name: 'Teddy', byParent: true },
        ],
        null,
      ),
    ).toBe('A parent says Nolan and Teddy can’t make it.');
    expect(heldOutNote([{ name: 'Teddy', byParent: false }], 'Lions')).toBe(
      'Teddy is marked out vs Lions on the attendance list.',
    );
    expect(
      heldOutNote(
        [
          { name: 'Nolan', byParent: true },
          { name: 'Teddy', byParent: false },
        ],
        'Lions',
      ),
    ).toBe('Marked out vs Lions: Nolan (by a parent), Teddy.');
    const players = [
      { id: 'a', first_name: 'Nolan', is_available: true },
      { id: 'b', first_name: 'Teddy', is_available: true },
      { id: 'c', first_name: 'Jack', is_available: false },
      { id: 'd', first_name: 'Sam', is_available: true },
    ];
    expect(outCaption(players, split.out, split.byParent)).toBe('Out: Nolan (parent), Teddy, Jack');
    expect(outCaption(players.slice(3), split.out, split.byParent)).toBeUndefined();
  });

  it('parents are locked once the game starts or the practice time has passed', () => {
    const now = new Date(2026, 10, 13, 18, 30);
    expect(parentLocked({ kind: 'game', status: 'upcoming' }, now)).toBe(false);
    expect(parentLocked({ kind: 'game', status: 'live' }, now)).toBe(true);
    expect(parentLocked({ kind: 'game', status: 'done' }, now)).toBe(true);
    expect(
      parentLocked({ kind: 'practice', status: 'scheduled', date: '2026-11-13', time: '18:00' }, now),
    ).toBe(true);
    expect(
      parentLocked({ kind: 'practice', status: 'scheduled', date: '2026-11-13', time: '19:00' }, now),
    ).toBe(false);
    expect(parentLocked({ kind: 'practice', status: 'scheduled', date: '2026-11-13', time: null }, now)).toBe(
      false,
    );
    expect(parentLocked({ kind: 'practice', status: 'scheduled', date: '2026-11-12', time: null }, now)).toBe(
      true,
    );
    expect(parentLocked({ kind: 'practice', status: 'cancelled', date: '2026-12-01', time: null }, now)).toBe(
      true,
    );
  });
});
