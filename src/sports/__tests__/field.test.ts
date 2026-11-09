import { describe, expect, it } from 'vitest';
import { FIELDS, STANDING, fieldFrac, fieldImage, place, proj } from '../field';
import { ALL_SPORTS } from '../types';

describe('field geometry', () => {
  it('every sport resolves to an image for both views (football borrows soccer)', () => {
    for (const s of ALL_SPORTS) {
      for (const v of ['persp', 'flat'] as const) {
        const F = fieldImage(s, v);
        expect(F.src).toMatch(/^fields\/[a-z]+-(persp|flat)\.webp$/);
        expect(F.w).toBeGreaterThan(0);
        expect(F.h).toBeGreaterThan(0);
        expect(F.H).toHaveLength(9);
      }
    }
    expect(fieldImage('football', 'persp')).toBe(FIELDS.soccer.persp);
  });

  it('flat homographies are affine: no perspective shrink', () => {
    for (const key of ['soccer', 'baseball', 'basketball', 'lacrosse'] as const) {
      const F = FIELDS[key].flat;
      expect(F.H[6]).toBe(0);
      expect(F.H[7]).toBe(0);
      expect(fieldFrac(F, 0)).toBeCloseTo(fieldFrac(F, 100), 10);
    }
  });

  it('perspective: the far end (y=0) is narrower than the near end (y=100)', () => {
    for (const key of ['soccer', 'baseball', 'basketball', 'lacrosse'] as const) {
      const F = FIELDS[key].persp;
      expect(fieldFrac(F, 0)).toBeLessThan(fieldFrac(F, 100));
      // the field centre lands inside the image, and depth increases down the image
      const [cx, cy] = proj(F, 50, 50);
      expect(cx).toBeGreaterThan(0);
      expect(cx).toBeLessThan(F.w);
      expect(cy).toBeGreaterThan(0);
      expect(cy).toBeLessThan(F.h);
      expect(proj(F, 50, 10)[1]).toBeLessThan(proj(F, 50, 90)[1]);
    }
  });

  it('proj matches the legacy formula for the soccer pitch', () => {
    const F = FIELDS.soccer.persp;
    // centre spot
    const [px, py] = proj(F, 50, 50);
    const d = -0.00419355 * 50 + 1;
    expect(px).toBeCloseTo((8.64 * 50 - 2.51612903 * 50 + 168) / d, 6);
    expect(py).toBeCloseTo((5.90870968 * 50 + 130) / d, 6);
  });

  it('place returns CSS percentages and depth-ordered z-index', () => {
    const F = FIELDS.soccer.flat;
    const p = place(F, 50, 90, 20);
    expect(p.left).toBe(`${((9.4 * 50 + 30) / 1000) * 100}%`);
    expect(p.top).toBe(`${((11.2 * 90 + 30) / 1180) * 100}%`);
    expect(p.width).toBe(`${20 * (940 / 1000)}%`);
    expect(p.zIndex).toBe(100);
    expect(place(F, 50, 10, 20).zIndex).toBeLessThan(p.zIndex);
  });

  it('standing overlays exist per sport', () => {
    expect(STANDING.soccer).toHaveLength(2);
    expect(STANDING.baseball).toHaveLength(0);
    expect(STANDING.basketball.map((s) => s[0])).toEqual(['hoop-far', 'hoop-near']);
    expect(STANDING.football[0]?.[0]).toBe('post');
  });
});
