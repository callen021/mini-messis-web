import { describe, expect, it } from 'vitest';
import { resolveTap, selectionHint } from '../tap';

const field = (slot: number, playerId: string) => ({ kind: 'field' as const, slot, playerId });
const bench = (playerId: string) => ({ kind: 'bench' as const, playerId });

describe('select-then-target (D70)', () => {
  it('first tap selects a jersey, or an empty spot: there is no picker sheet (D86)', () => {
    expect(resolveTap(null, field(0, 'a'))).toEqual({ action: 'select', selection: field(0, 'a') });
    expect(resolveTap(null, bench('b'))).toEqual({ action: 'select', selection: bench('b') });
    expect(resolveTap(null, field(3, ''))).toEqual({ action: 'select', selection: field(3, '') });
  });

  it('with an empty spot selected: a bench tap fills it, an on-field tap moves that player into it, another empty spot takes over', () => {
    expect(resolveTap(field(3, ''), bench('b'))).toEqual({ action: 'fill', playerId: 'b', slot: 3 });
    expect(resolveTap(field(3, ''), field(0, 'a'))).toEqual({ action: 'move', playerId: 'a', slot: 3 });
    expect(resolveTap(field(3, ''), field(4, ''))).toEqual({ action: 'select', selection: field(4, '') });
    expect(resolveTap(field(3, ''), field(3, ''))).toEqual({ action: 'cancel' });
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

  it('hint line names the selected player, or the position of a selected empty spot', () => {
    expect(selectionHint(field(0, 'a'), () => 'Nolan')).toBe('Tap a player to swap with Nolan');
    expect(selectionHint(field(2, ''), () => 'x', ['GK', 'RS', 'LS'])).toBe('Tap a bench player for LS');
    expect(selectionHint(null, () => 'x')).toBe('');
  });
});
