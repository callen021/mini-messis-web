import { describe, expect, it } from 'vitest';
import {
  ALL_SPORTS,
  ENABLED_SPORTS,
  SPORTS,
  chipLabel,
  defaultFormation,
  formationByName,
  shortPeriod,
} from '../definitions';

describe('SPORTS definitions', () => {
  it('football exists but is disabled', () => {
    expect(ALL_SPORTS).toContain('football');
    expect(ENABLED_SPORTS).not.toContain('football');
    expect(ENABLED_SPORTS).toEqual(['soccer', 'baseball', 'basketball', 'lacrosse']);
  });

  it.each(ALL_SPORTS)('%s: defaults are consistent and every role has a colour and a label', (key) => {
    const S = SPORTS[key];
    expect(S.key).toBe(key);
    expect(S.sizes).toContain(S.defaultSize);
    expect(S.periodOptions).toContain(S.defaultPeriods);
    expect(S.sample.length).toBeGreaterThanOrEqual(S.defaultSize);
    for (const size of S.sizes) {
      for (const gk of S.hasGK ? [true, false] : [false]) {
        const forms = S.formations({ size, gk });
        expect(forms.length).toBeGreaterThan(0);
        for (const f of forms) {
          expect(f.positions).toHaveLength(size);
          for (const p of f.positions) {
            const g = S.group(p.role);
            expect(
              S.groups.map(([k]) => k),
              `${key} ${p.role} → ${g}`,
            ).toContain(g);
            expect(S.defaultColors[g]).toMatch(/^#[0-9a-f]{6}$/i);
            expect(S.label(p.role)).toBeTruthy();
          }
        }
      }
    }
  });

  it('period naming follows the legacy rules', () => {
    expect(SPORTS.soccer.periodName(2)).toBe('Half');
    expect(SPORTS.soccer.periodName(4)).toBe('Quarter');
    expect(SPORTS.soccer.periodName(3)).toBe('Quarter');
    expect(SPORTS.baseball.periodName(6)).toBe('Inning');
    expect(SPORTS.basketball.periodName(2)).toBe('Half');
    expect(SPORTS.lacrosse.periodName(4)).toBe('Quarter');
  });

  it('shortPeriod / chipLabel', () => {
    expect(shortPeriod(SPORTS.soccer, 4, 0)).toBe('Q1');
    expect(shortPeriod(SPORTS.soccer, 2, 1)).toBe('H2');
    expect(shortPeriod(SPORTS.baseball, 6, 2)).toBe('Inning 3');
    expect(chipLabel(SPORTS.baseball, 6, 2)).toBe('3');
    expect(chipLabel(SPORTS.basketball, 4, 3)).toBe('Q4');
  });

  it('defaultFormation prefers the sport default, else the first', () => {
    const soccer = SPORTS.soccer.formations({ size: 7, gk: true });
    expect(defaultFormation(soccer, SPORTS.soccer).name).toBe('3-3');
    const bb = SPORTS.baseball.formations({ size: 9, gk: false });
    expect(defaultFormation(bb, SPORTS.baseball).name).toBe('Standard');
    // default name missing at this size → first
    const small = SPORTS.soccer.formations({ size: 4, gk: true });
    expect(defaultFormation(small, SPORTS.soccer).name).toBe(small[0]?.name);
  });

  it('formationByName falls back to the first formation', () => {
    const forms = SPORTS.soccer.formations({ size: 7, gk: true });
    expect(formationByName(forms, '2-3-1').name).toBe('2-3-1');
    expect(formationByName(forms, 'nope').name).toBe(forms[0]?.name);
  });
});
