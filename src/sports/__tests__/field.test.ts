import { describe, expect, it } from 'vitest';
import { SPORTS } from '../definitions';
import {
  FIELDS,
  PERSP_JERSEY_SCALE,
  STANDING,
  fieldFrac,
  fieldImage,
  perspJerseyWidth,
  place,
  placeFixed,
  proj,
} from '../field';
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

describe('constant-size jerseys in the 3D view (D37)', () => {
  it('placeFixed keeps the perspective position but ignores depth for the width', () => {
    const F = FIELDS.soccer.persp;
    const far = placeFixed(F, 50, 10, 20);
    const near = placeFixed(F, 50, 90, 20);
    expect(far.left).toBe(place(F, 50, 10, 20).left);
    expect(far.top).toBe(place(F, 50, 10, 20).top);
    expect(far.width).toBe('20%');
    expect(near.width).toBe('20%');
    expect(far.zIndex).toBeLessThan(near.zIndex);
    // the legacy placement did shrink with depth
    expect(parseFloat(place(F, 50, 10, 20).width)).toBeLessThan(parseFloat(place(F, 50, 90, 20).width));
  });

  it('perspJerseyWidth applies the per-sport factor to the formation width with the 9% floor', () => {
    expect(perspJerseyWidth('soccer', { w: 23 })).toBeCloseTo(23 * PERSP_JERSEY_SCALE.soccer);
    expect(perspJerseyWidth('baseball', { w: 16 })).toBe(16);
    expect(perspJerseyWidth('basketball', { w: 0 })).toBe(22);
    expect(perspJerseyWidth('lacrosse', { w: 5 })).toBeCloseTo(9 * PERSP_JERSEY_SCALE.lacrosse);
  });

  it('no two jerseys in the same row touch at a 343px stage, for every enabled sport, size and formation', () => {
    const stageW = 343;
    for (const key of ['soccer', 'baseball', 'basketball', 'lacrosse'] as const) {
      const S = SPORTS[key];
      const F = FIELDS[key].persp;
      const scale = stageW / F.w;
      for (const size of S.sizes) {
        for (const f of S.formations({ size, gk: S.hasGK })) {
          const px = (perspJerseyWidth(key, f) / 100) * stageW;
          const pts = f.positions.map((p) => ({ x: proj(F, p.x, p.y)[0] * scale, fy: p.y, code: p.code }));
          for (let i = 0; i < pts.length; i++)
            for (let j = i + 1; j < pts.length; j++) {
              const a = pts[i] as (typeof pts)[number];
              const b = pts[j] as (typeof pts)[number];
              if (Math.abs(a.fy - b.fy) > 4) continue;
              expect(
                Math.abs(a.x - b.x),
                `${key} ${size} ${f.name} ${a.code}-${b.code}`,
              ).toBeGreaterThanOrEqual(px);
            }
        }
      }
    }
  });
});
