import { describe, expect, it } from 'vitest';
import { SPORTS, formationByName } from '../definitions';
import { periodsHeader, positionName, usedPositions } from '../positions';

describe('position names', () => {
  it('names every code the generators produce for the enabled sports', () => {
    for (const key of ['soccer', 'baseball', 'basketball', 'lacrosse'] as const) {
      const S = SPORTS[key];
      for (const size of S.sizes) {
        for (const gk of S.hasGK ? [true, false] : [false]) {
          for (const f of S.formations({ size, gk })) {
            for (const p of f.positions) {
              const name = positionName(S, p.code, p.role);
              expect(name, `${key} ${f.name} ${p.code}`).not.toBe(p.code);
              expect(name).toMatch(/^[A-Z]/);
            }
          }
        }
      }
    }
  });

  it('reads like English', () => {
    expect(positionName(SPORTS.soccer, 'GK')).toBe('Goalkeeper');
    expect(positionName(SPORTS.soccer, 'LW')).toBe('Left wing');
    expect(positionName(SPORTS.baseball, 'SS')).toBe('Shortstop');
    expect(positionName(SPORTS.basketball, 'PG')).toBe('Point guard');
    expect(positionName(SPORTS.lacrosse, 'X')).toMatch(/^X attack/);
    // a generated code falls back to the role label
    expect(positionName(SPORTS.soccer, 'DEF7', 'DEF')).toBe('Defender');
  });

  it('lists the codes used in the plan once each, in field order', () => {
    const S = SPORTS.soccer;
    const forms = S.formations({ size: 7, gk: true });
    const periods = [
      { formation: '3-3', slots: [], auto: [] },
      { formation: '2-3-1', slots: [], auto: [] },
    ];
    const key = usedPositions(S, periods, (n) => formationByName(forms, n));
    const codes = key.map((k) => k.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.slice(0, 3)).toEqual(['LW', 'ST', 'RW']);
    expect(codes).toContain('GK');
    expect(key.find((k) => k.code === 'GK')?.name).toBe('Goalkeeper');
  });

  it('names the totals column by the sport', () => {
    expect(periodsHeader(SPORTS.soccer, 4)).toBe('Qtrs');
    expect(periodsHeader(SPORTS.soccer, 2)).toBe('Halves');
    expect(periodsHeader(SPORTS.baseball, 6)).toBe('Inn');
  });
});
