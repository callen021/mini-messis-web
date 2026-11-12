import { describe, expect, it } from 'vitest';
import { resolveTap, selectionHint } from '../tap';

const field = (slot: number, playerId: string) => ({ kind: 'field' as const, slot, playerId });
const bench = (playerId: string) => ({ kind: 'bench' as const, playerId });

describe('select-then-target (D70)', () => {
  it('first tap selects a jersey; an empty spot with nothing selected opens the picker', () => {
    expect(resolveTap(null, field(0, 'a'))).toEqual({ action: 'select', selection: field(0, 'a') });
    expect(resolveTap(null, bench('b'))).toEqual({ action: 'select', selection: bench('b') });
    expect(resolveTap(null, field(3, ''))).toEqual({ action: 'picker', slot: 3 });
  });

  it('field then bench, or bench then field, swaps those two players', () => {
    expect(resolveTap(field(0, 'a'), bench('b'))).toEqual({ action: 'sub', off: 'a', on: 'b' });
    expect(resolveTap(bench('b'), field(0, 'a'))).toEqual({ action: 'sub', off: 'a', on: 'b' });
  });

  it('two on-field jerseys swap positions; an empty spot moves the selected player there', () => {
    expect(resolveTap(field(0, 'a'), field(2, 'c'))).toEqual({ action: 'swap', a: 'a', b: 'c' });
    expect(resolveTap(field(0, 'a'), field(2, ''))).toEqual({ action: 'move', playerId: 'a', slot: 2 });
    expect(resolveTap(bench('b'), field(2, ''))).toEqual({ action: 'fill', playerId: 'b', slot: 2 });
  });

  it('tapping the selected jersey again cancels; two bench jerseys swap places in the queue (D79)', () => {
    expect(resolveTap(field(0, 'a'), field(0, 'a'))).toEqual({ action: 'cancel' });
    expect(resolveTap(bench('b'), bench('b'))).toEqual({ action: 'cancel' });
    expect(resolveTap(bench('b'), bench('c'))).toEqual({ action: 'benchswap', a: 'b', b: 'c' });
  });

  it('hint line names the selected player', () => {
    expect(selectionHint(field(0, 'a'), () => 'Nolan')).toBe('Tap a player to swap with Nolan');
    expect(selectionHint(null, () => 'x')).toBe('');
  });
});
