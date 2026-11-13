import { describe, expect, it } from 'vitest';
import { SPORTS } from '../definitions';
import {
  BASEBALL_FORMS,
  BASKETBALL_FORMS,
  FOOTBALL_FORMS,
  LAX_SHAPES,
  SOCCER_SHAPES,
  baseballFormations,
  basketballFormations,
  footballFormations,
  lacrosseFormations,
  soccerFormations,
} from '../formations';
import { type Formation } from '../types';

const uniqueCodes = (f: Formation) => new Set(f.positions.map((p) => p.code)).size === f.positions.length;
const inBounds = (f: Formation) => f.positions.every((p) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100);

describe('soccerFormations', () => {
  it.each([3, 4, 5, 6, 7, 8, 9, 10, 11])(
    'size %i with GK: every formation has size slots and unique codes',
    (size) => {
      const forms = soccerFormations(size, true);
      expect(forms.length).toBe(SOCCER_SHAPES[size - 1]?.length);
      for (const f of forms) {
        expect(f.positions).toHaveLength(size);
        expect(f.positions.filter((p) => p.role === 'GK')).toHaveLength(1);
        expect(uniqueCodes(f), `${f.name} codes`).toBe(true);
        expect(inBounds(f)).toBe(true);
        expect(f.w).toBeGreaterThan(0);
      }
    },
  );

  it.each([3, 4, 5, 6, 7, 8, 9, 10, 11])('size %i without GK', (size) => {
    const forms = soccerFormations(size, false);
    expect(forms.length).toBe(SOCCER_SHAPES[size]?.length);
    for (const f of forms) {
      expect(f.positions).toHaveLength(size);
      expect(f.positions.some((p) => p.role === 'GK')).toBe(false);
      expect(uniqueCodes(f), `${f.name} codes`).toBe(true);
    }
  });

  it('reads defense → attack and places forwards at the top', () => {
    const f = soccerFormations(7, true).find((x) => x.name === '3-2-1');
    expect(f).toBeDefined();
    const roles = f?.positions.map((p) => p.role);
    // forwards first (drawn at the top), then mids, then defenders, GK last
    expect(roles).toEqual(['ST', 'MID', 'MID', 'DEF', 'DEF', 'DEF', 'GK']);
    const st = f?.positions[0];
    const def = f?.positions[3];
    expect(st && def && st.y < def.y).toBe(true);
    expect(f?.positions.map((p) => p.code)).toEqual(['ST', 'LM', 'RM', 'LFB', 'SW', 'RFB', 'GK']);
  });

  it('uses DM/AM code sets for four-row shapes', () => {
    const f = soccerFormations(11, true).find((x) => x.name === '4-2-3-1');
    expect(f?.positions.map((p) => p.code)).toEqual([
      'ST',
      'LAM',
      'CAM',
      'RAM',
      'LDM',
      'RDM',
      'LFB',
      'LCB',
      'RCB',
      'RFB',
      'GK',
    ]);
  });

  it('falls back to a generated 3-row shape for unknown sizes', () => {
    const forms = soccerFormations(13, true); // 12 outfield → no entry in SOCCER_SHAPES
    expect(forms).toHaveLength(1);
    expect(forms[0]?.name).toBe('4-4-4');
    expect(forms[0]?.positions).toHaveLength(13);
  });
});

describe('baseballFormations', () => {
  it.each([6, 7, 8, 9, 10, 11, 12])(
    'size %i: slot counts match and codes are unique except rovers',
    (size) => {
      const forms = baseballFormations(size);
      expect(forms.length).toBe(BASEBALL_FORMS[size]?.length);
      for (const f of forms) {
        expect(f.positions, f.name).toHaveLength(size);
        expect(f.w).toBe(16);
        const codes = f.positions.map((p) => p.code);
        const nonRover = codes.filter((c) => c !== 'ROV');
        expect(new Set(nonRover).size).toBe(nonRover.length);
        expect(inBounds(f)).toBe(true);
      }
    },
  );

  it('falls back to the 9-player standard for unknown sizes', () => {
    expect(baseballFormations(13)[0]?.name).toBe('Standard');
  });

  it('every role maps to a group with a colour', () => {
    const S = SPORTS.baseball;
    for (const forms of Object.values(BASEBALL_FORMS)) {
      for (const f of forms) {
        for (const p of f.positions) {
          expect(S.defaultColors[S.group(p.role)], p.role).toMatch(/^#/);
          expect(S.label(p.role)).not.toBe('');
        }
      }
    }
  });
});

describe('basketballFormations', () => {
  it.each([3, 4, 5])('size %i', (size) => {
    const forms = basketballFormations(size);
    expect(forms.length).toBe(BASKETBALL_FORMS[size]?.length);
    for (const f of forms) {
      expect(f.positions).toHaveLength(size);
      expect(f.w).toBe(23);
      expect(inBounds(f)).toBe(true);
    }
  });
  it('is a half court (D106): posts on the blocks, the point guard at the top of the key', () => {
    const f = basketballFormations(5)[0];
    const pg = f?.positions.find((p) => p.role === 'PG');
    const c = f?.positions.find((p) => p.role === 'C');
    expect(f?.name).toBe('1-2-2');
    expect(pg?.x).toBe(50);
    expect(pg?.y).toBe(92);
    expect(c?.y).toBe(16);
    expect(c?.x).toBe(74);
  });
  it('falls back to 5 for unknown sizes', () => {
    expect(basketballFormations(7)).toHaveLength(BASKETBALL_FORMS[5]?.length ?? 0);
  });
});

describe('footballFormations (disabled sport, still correct)', () => {
  it.each([5, 6, 7, 8, 9, 11])('size %i', (size) => {
    const forms = footballFormations(size);
    expect(forms.length).toBe(FOOTBALL_FORMS[size]?.length);
    for (const f of forms) {
      expect(f.positions, f.name).toHaveLength(size);
      expect(f.w).toBe(12.5);
      expect(inBounds(f), f.name).toBe(true);
    }
  });
});

describe('lacrosseFormations', () => {
  it.each([4, 5, 6, 7, 8, 9, 10, 11])('size %i with GK', (size) => {
    const forms = lacrosseFormations(size, true);
    expect(forms.length).toBe(LAX_SHAPES[size - 1]?.length);
    for (const f of forms) {
      expect(f.positions, f.name).toHaveLength(size);
      expect(uniqueCodes(f), `${f.name} codes`).toBe(true);
      expect(f.positions.filter((p) => p.role === 'GK')).toHaveLength(1);
      expect(inBounds(f)).toBe(true);
    }
  });
  it.each([3, 4, 5, 6, 7, 8, 9, 10])('size %i without GK', (size) => {
    for (const f of lacrosseFormations(size, false)) {
      expect(f.positions).toHaveLength(size);
      expect(uniqueCodes(f)).toBe(true);
    }
  });
  it('puts the X attackman behind the goal and reads defense → attack', () => {
    const f = lacrosseFormations(10, true).find((x) => x.name === '3-3-3');
    expect(f?.positions.map((p) => p.code)).toEqual([
      'LA',
      'X',
      'RA',
      'LM',
      'CM',
      'RM',
      'LD',
      'CD',
      'RD',
      'GK',
    ]);
    expect(f?.positions.find((p) => p.code === 'X')?.y).toBe(9);
  });
  it('falls back for unknown sizes', () => {
    const forms = lacrosseFormations(12, true); // 11 → not in LAX_SHAPES
    expect(forms).toHaveLength(1);
    expect(forms[0]?.positions).toHaveLength(12);
  });
});
