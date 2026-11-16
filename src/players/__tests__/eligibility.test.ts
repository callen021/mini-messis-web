import { describe, expect, it } from 'vitest';
import { SPORTS } from '@/sports/definitions';
import {
  NO_ELIGIBILITY,
  canPlay,
  eligibleFn,
  neverLabels,
  prefLevel,
  skippedText,
  toEligibility,
  withLevel,
} from '../eligibility';

describe('eligible positions (D117)', () => {
  it('a missing entry is "can play"; never and preferred are stored; can drops the row', () => {
    const e = toEligibility([
      { player_id: 'p1', group_key: 'GK', level: 'never' },
      { player_id: 'p1', group_key: 'ST', level: 'preferred' },
      { player_id: 'p2', group_key: 'DEF', level: 'can' },
    ]);
    expect(prefLevel(e, 'p1', 'GK')).toBe('never');
    expect(prefLevel(e, 'p1', 'ST')).toBe('preferred');
    expect(prefLevel(e, 'p1', 'DEF')).toBe('can');
    expect(e.has('p2')).toBe(false);
    expect(canPlay(e, 'p1', 'GK')).toBe(false);
    expect(canPlay(e, 'p1', 'ST')).toBe(true); // preferred still plays
    expect(canPlay(e, 'p9', 'GK')).toBe(true);
  });

  it('withLevel returns a new map and removes empty players', () => {
    const e = withLevel(NO_ELIGIBILITY, 'p1', 'GK', 'never');
    expect(NO_ELIGIBILITY.size).toBe(0);
    expect(prefLevel(e, 'p1', 'GK')).toBe('never');
    const back = withLevel(e, 'p1', 'GK', 'can');
    expect(back.has('p1')).toBe(false);
    expect(prefLevel(e, 'p1', 'GK')).toBe('never'); // the old map is untouched
  });

  it('eligibleFn is undefined until something is marked, so the engines treat everyone as eligible', () => {
    expect(eligibleFn(undefined)).toBeUndefined();
    expect(eligibleFn(NO_ELIGIBILITY)).toBeUndefined();
    const fn = eligibleFn(withLevel(NO_ELIGIBILITY, 'p1', 'C', 'never'));
    expect(fn?.('p1', 'C')).toBe(false);
    expect(fn?.('p1', 'G')).toBe(true);
  });

  it('neverLabels uses the coach’s words in grid order; skippedText names the open spots', () => {
    const e = toEligibility([
      { player_id: 'p1', group_key: 'ST', level: 'never' },
      { player_id: 'p1', group_key: 'GK', level: 'never' },
    ]);
    expect(neverLabels(SPORTS.soccer, e, 'p1')).toEqual(['Goalie', 'Forward']);
    expect(neverLabels(SPORTS.soccer, e, 'p2')).toEqual([]);
    expect(skippedText([])).toBe('');
    expect(skippedText(['GK', 'LCB'])).toBe('GK, LCB left open · nobody eligible');
  });

  it('every sport with eligibility maps each formation spot to one of its groups', () => {
    for (const S of Object.values(SPORTS)) {
      if (!S.eligibility) continue;
      const keys = S.eligibility.map(([k]) => k);
      for (const size of S.sizes) {
        for (const gk of S.hasGK ? [true, false] : [false]) {
          for (const f of S.formations({ size, gk })) {
            for (const p of f.positions) expect(keys, `${S.key} ${p.role}`).toContain(S.group(p.role));
          }
        }
      }
    }
    expect(SPORTS.soccer.eligibility?.map(([, l]) => l)).toEqual([
      'Goalie',
      'Defense',
      'Midfield',
      'Forward',
    ]);
    expect(SPORTS.basketball.eligibility?.map(([, l]) => l)).toEqual(['Guard', 'Forward', 'Center']);
    expect(SPORTS.lacrosse.eligibility?.map(([, l]) => l)).toEqual([
      'Goalie',
      'Defense',
      'Midfield',
      'Attack',
    ]);
    expect(SPORTS.baseball.eligibility?.map(([, l]) => l)).toEqual([
      'Pitcher',
      'Catcher',
      'Infield',
      'Outfield',
    ]);
  });
});
