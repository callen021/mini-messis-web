import { describe, expect, it } from 'vitest';
import { pinFirst } from '../pin';

describe('pinFirst', () => {
  it('moves matching items to the front and keeps both orders', () => {
    const mine = new Set(['c', 'a']);
    expect(pinFirst(['x', 'a', 'y', 'c', 'z'], (id) => mine.has(id))).toEqual(['a', 'c', 'x', 'y', 'z']);
  });
  it('returns the list unchanged when nothing matches, and copies it', () => {
    const list = ['x', 'y'];
    const out = pinFirst(list, () => false);
    expect(out).toEqual(list);
    expect(out).not.toBe(list);
    expect(pinFirst([], () => true)).toEqual([]);
  });
});
