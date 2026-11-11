import { describe, expect, it } from 'vitest';
import { periodPlural, SPORTS } from '../definitions';

describe('periodPlural (D63)', () => {
  it('says halves, not halfs, and keeps the others regular', () => {
    expect(periodPlural(SPORTS.soccer, 2)).toBe('halves');
    expect(periodPlural(SPORTS.soccer, 4)).toBe('quarters');
    expect(periodPlural(SPORTS.baseball, 6)).toBe('innings');
    expect(periodPlural(SPORTS.basketball, 2, true)).toBe('Halves');
    expect(periodPlural(SPORTS.lacrosse, 4, true)).toBe('Quarters');
  });
});
