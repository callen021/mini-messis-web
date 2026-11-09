import { describe, expect, it } from 'vitest';
import { type Player } from '@/teams/api';
import { batterPointers, battingOrder, moveInOrder, paResultLabel, paResultShort } from '../batting';

const mk = (id: string, order: number | null, sort: number, available = true): Player => ({
  id,
  team_id: 't',
  first_name: id,
  last_name: null,
  jersey_number: null,
  is_available: available,
  batting_order: order,
  sort_order: sort,
  archived_at: null,
  created_at: '',
  updated_at: '',
  updated_by: null,
});

describe('batting order', () => {
  it('orders by batting_order, unset players last in roster order, and skips players who are out', () => {
    const ids = battingOrder([
      mk('c', null, 3),
      mk('a', 2, 1),
      mk('b', 1, 2),
      mk('d', 0, 0, false),
      mk('e', null, 1),
    ]).map((p) => p.id);
    expect(ids).toEqual(['b', 'a', 'e', 'c']);
  });

  it('points at the last batter and wraps to the top', () => {
    const order = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(batterPointers(order, null)).toEqual({ lastIdx: -1, nextIdx: 0 });
    expect(batterPointers(order, 'b')).toEqual({ lastIdx: 1, nextIdx: 2 });
    expect(batterPointers(order, 'c')).toEqual({ lastIdx: 2, nextIdx: 0 });
    expect(batterPointers(order, 'zzz')).toEqual({ lastIdx: -1, nextIdx: 0 });
    expect(batterPointers([], 'a')).toEqual({ lastIdx: -1, nextIdx: -1 });
  });

  it('moves neighbours and ignores out-of-range moves', () => {
    expect(moveInOrder(['a', 'b', 'c'], 1, 0)).toEqual(['b', 'a', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 2, 3)).toEqual(['a', 'b', 'c']);
  });

  it('labels results', () => {
    expect(paResultLabel('none')).toBe('Batted');
    expect(paResultShort('home_run')).toBe('HR');
    expect(paResultLabel('fielders_choice')).toBe("Fielder's choice");
  });
});
