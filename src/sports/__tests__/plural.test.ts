import { describe, expect, it } from 'vitest';
import { chipLabel, periodCountText, periodPlural, periodsNoun, SPORTS, shortPeriod } from '../definitions';
import { periodsHeader } from '../positions';

describe('periodPlural (D63)', () => {
  it('says halves, not halfs, and keeps the others regular', () => {
    expect(periodPlural(SPORTS.soccer, 2)).toBe('halves');
    expect(periodPlural(SPORTS.soccer, 4)).toBe('quarters');
    expect(periodPlural(SPORTS.baseball, 6)).toBe('innings');
    expect(periodPlural(SPORTS.basketball, 2, true)).toBe('Halves');
    expect(periodPlural(SPORTS.lacrosse, 4, true)).toBe('Quarters');
  });

  it('one period is a Game: no "1 half" anywhere (D97)', () => {
    for (const S of [SPORTS.soccer, SPORTS.basketball, SPORTS.lacrosse]) {
      expect(S.periodOptions[0]).toBe(1);
      expect(S.periodName(1)).toBe('Game');
      expect(shortPeriod(S, 1, 0)).toBe('Game');
      expect(chipLabel(S, 1, 0)).toBe('Game');
      expect(periodCountText(S, 1)).toBe('one period');
      expect(periodsNoun(S, 1)).toBe('period');
      expect(periodsHeader(S, 1)).toBe('Played');
    }
    expect(periodCountText(SPORTS.soccer, 2)).toBe('2 halves');
    expect(periodCountText(SPORTS.soccer, 4)).toBe('4 quarters');
    expect(SPORTS.baseball.periodOptions[0]).toBeGreaterThan(1); // innings never collapse to one
    expect(SPORTS.baseball.periodName(1)).toBe('Inning');
  });
});
