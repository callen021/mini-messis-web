import { describe, expect, it } from 'vitest';
import { queueNumber, resolveTap, selectionHint, swapPair } from '../tap';

const field = (slot: number, playerId: string) => ({ kind: 'field' as const, slot, playerId });
const bench = (playerId: string) => ({ kind: 'bench' as const, playerId });
const select = { action: 'select' as const };

describe('select-then-target (D70), queued (D113)', () => {
  it('first tap selects a jersey, or an empty spot: there is no picker sheet (D86)', () => {
    expect(resolveTap([], field(0, 'a'))).toEqual({ action: select, queue: [field(0, 'a')] });
    expect(resolveTap([], bench('b'))).toEqual({ action: select, queue: [bench('b')] });
    expect(resolveTap([], field(3, ''))).toEqual({ action: select, queue: [field(3, '')] });
  });

  it('a single change is still two taps: field then bench, or bench then field, and the line is empty after', () => {
    expect(resolveTap([field(0, 'a')], bench('b'))).toEqual({
      action: { action: 'sub', off: 'a', on: 'b' },
      queue: [],
    });
    expect(resolveTap([bench('b')], field(0, 'a'))).toEqual({
      action: { action: 'sub', off: 'a', on: 'b' },
      queue: [],
    });
    expect(resolveTap([field(3, '')], bench('b'))).toEqual({
      action: { action: 'fill', playerId: 'b', slot: 3 },
      queue: [],
    });
    expect(resolveTap([bench('b')], field(2, ''))).toEqual({
      action: { action: 'fill', playerId: 'b', slot: 2 },
      queue: [],
    });
  });

  it('taps on one side build a line in tap order; the other side moves the next in line, lowest number first', () => {
    const two = resolveTap([bench('b')], bench('c'));
    expect(two).toEqual({ action: select, queue: [bench('b'), bench('c')] });
    const first = resolveTap(two.queue, field(0, 'a'));
    expect(first).toEqual({ action: { action: 'sub', off: 'a', on: 'b' }, queue: [bench('c')] });
    expect(resolveTap(first.queue, field(1, 'd'))).toEqual({
      action: { action: 'sub', off: 'd', on: 'c' },
      queue: [],
    });
    // and the other way round: field kids in line, then bench taps
    const q = resolveTap([field(0, 'a')], field(1, 'd')).queue;
    expect(resolveTap(q, bench('b'))).toEqual({
      action: { action: 'sub', off: 'a', on: 'b' },
      queue: [field(1, 'd')],
    });
  });

  it('numbers follow the line and renumber when someone leaves it; tapping a queued jersey deselects it', () => {
    const q = [bench('b'), bench('c'), bench('d')];
    expect(queueNumber(q, bench('c'))).toBe(2);
    expect(queueNumber(q, bench('x'))).toBeUndefined();
    const r = resolveTap(q, bench('b'));
    expect(r).toEqual({ action: select, queue: [bench('c'), bench('d')] });
    expect(queueNumber(r.queue, bench('d'))).toBe(2);
    expect(resolveTap([field(0, 'a')], field(0, 'a'))).toEqual({ action: select, queue: [] });
  });

  it('an empty spot: a bench line fills it next; an on-field line moves its first player there; otherwise it joins the line', () => {
    expect(resolveTap([bench('b'), bench('c')], field(4, ''))).toEqual({
      action: { action: 'fill', playerId: 'b', slot: 4 },
      queue: [bench('c')],
    });
    expect(resolveTap([field(0, 'a'), field(1, 'd')], field(4, ''))).toEqual({
      action: { action: 'move', playerId: 'a', slot: 4 },
      queue: [field(1, 'd')],
    });
    expect(resolveTap([field(3, '')], field(4, ''))).toEqual({
      action: select,
      queue: [field(3, ''), field(4, '')],
    });
    expect(resolveTap([field(3, '')], field(0, 'a'))).toEqual({
      action: select,
      queue: [field(3, ''), field(0, 'a')],
    });
  });

  it('exactly two players in line on one side may change places: positions on the field, or places in the bench line (D79)', () => {
    expect(swapPair([field(0, 'a'), field(2, 'c')])).toEqual({ kind: 'field', a: 'a', b: 'c' });
    expect(swapPair([bench('b'), bench('c')])).toEqual({ kind: 'bench', a: 'b', b: 'c' });
    expect(swapPair([field(0, 'a')])).toBeNull();
    expect(swapPair([field(0, 'a'), field(2, 'c'), field(3, 'd')])).toBeNull();
    expect(swapPair([field(0, 'a'), field(2, '')])).toBeNull();
  });

  it('hint line names the line, or the position of a selected empty spot', () => {
    const names = (id: string) => ({ a: 'Nolan', d: 'Ava', e: 'Ben' })[id] ?? 'x';
    expect(selectionHint([field(0, 'a')], names)).toBe('Tap a bench player for Nolan');
    expect(selectionHint([field(0, 'a'), field(1, 'd')], names)).toBe(
      'Tap bench players for Nolan, then Ava',
    );
    expect(selectionHint([field(0, 'a'), field(1, 'd'), field(2, 'e')], names)).toBe(
      'Tap bench players for Nolan, Ava, then Ben',
    );
    expect(selectionHint([bench('a')], names)).toBe('Tap a jersey on the field for Nolan');
    expect(selectionHint([bench('a'), bench('d')], names)).toBe(
      'Tap jerseys on the field for Nolan, then Ava',
    );
    expect(selectionHint([field(2, '')], names, ['GK', 'RS', 'LS'])).toBe('Tap a bench player for LS');
    expect(selectionHint([], names)).toBe('');
  });
});
