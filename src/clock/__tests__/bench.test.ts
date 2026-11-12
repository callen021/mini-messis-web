import { describe, expect, it } from 'vitest';
import { benchAfterEdit, benchQueue, benchSwap } from '../bench';

const roster = ['a', 'b', 'c', 'd', 'e', 'f'];

describe('the bench queue (D79)', () => {
  it('starts in roster order of the players not on the field', () => {
    expect(benchQueue([], roster, ['a', 'b', 'c'])).toEqual(['d', 'e', 'f']);
  });

  it('keeps a saved order, drops anyone on the field or marked out, appends the missing at the right', () => {
    expect(benchQueue(['f', 'd', 'x', 'd'], roster, ['a', 'b', 'c'])).toEqual(['f', 'd', 'e']);
    // a player marked back in (now in the roster, not in the order) joins the right end
    expect(benchQueue(['f', 'd'], ['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['a', 'b', 'c'])).toEqual([
      'f',
      'd',
      'e',
      'g',
    ]);
  });

  it('after an edit: off joins the right end in spot order, on leaves and the gap closes', () => {
    const order = ['d', 'e', 'f'];
    // a sub: e on for b
    expect(benchAfterEdit(order, roster, ['a', 'b', 'c'], ['a', 'e', 'c'])).toEqual(['d', 'f', 'b']);
    // two off at once (a cleared lineup): a then c, in spot order, after the existing queue
    expect(benchAfterEdit(order, roster, ['a', 'b', 'c'], ['', 'b', ''])).toEqual(['d', 'e', 'f', 'a', 'c']);
    // a position swap changes nothing
    expect(benchAfterEdit(order, roster, ['a', 'b', 'c'], ['b', 'a', 'c'])).toEqual(['d', 'e', 'f']);
  });

  it('swaps two bench players and ignores anyone not on the bench', () => {
    expect(benchSwap(['d', 'e', 'f'], 'd', 'f')).toEqual(['f', 'e', 'd']);
    expect(benchSwap(['d', 'e', 'f'], 'd', 'a')).toEqual(['d', 'e', 'f']);
  });
});
