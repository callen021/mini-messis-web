import { type SportKey } from './types';

/* =====================================================================
   FIELD GEOMETRY — the rendered field images (perspective, lit, baked at build time) and the
   homography that maps field-percent coordinates onto each image. Ported from legacy `FIELDS`;
   the base64 images now live in public/fields/<sport>-<view>.webp.
   ===================================================================== */

export type FieldView = 'persp' | 'flat';

/** 3×3 homography, row-major. */
export type Homography = readonly [number, number, number, number, number, number, number, number, number];

export interface FieldImage {
  /** Public path, relative to the app base. */
  src: string;
  w: number;
  h: number;
  H: Homography;
}

const PERSP_PITCH: Homography = [8.64, -2.51612903, 168.0, 0, 5.90870968, 130.0, 0, -0.00419355, 1];
const FLAT_PITCH: Homography = [9.4, 0, 30, 0, 11.2, 30, 0, 0, 1];

export const FIELDS: Readonly<
  Record<Exclude<SportKey, 'football'>, Readonly<Record<FieldView, FieldImage>>>
> = {
  soccer: {
    persp: { src: 'fields/soccer-persp.webp', w: 1200, h: 1300, H: PERSP_PITCH },
    flat: { src: 'fields/soccer-flat.webp', w: 1000, h: 1180, H: FLAT_PITCH },
  },
  baseball: {
    persp: {
      src: 'fields/baseball-persp.webp',
      w: 1200,
      h: 1200,
      H: [12.0, -1.83333333, 0, 0, 7.95833333, 0, 0, -0.00305556, 1],
    },
    flat: { src: 'fields/baseball-flat.webp', w: 1200, h: 1200, H: [12, 0, 0, 0, 12, 0, 0, 0, 1] },
  },
  basketball: {
    persp: {
      src: 'fields/basketball-persp.webp',
      w: 1200,
      h: 1180,
      H: [8.88, -2.41935484, 156.0, 0, 5.5678871, 129.8, 0, -0.00403226, 1],
    },
    flat: { src: 'fields/basketball-flat.webp', w: 1000, h: 1170, H: [9.4, 0, 30, 0, 11.1, 30, 0, 0, 1] },
  },
  lacrosse: {
    persp: { src: 'fields/lacrosse-persp.webp', w: 1200, h: 1300, H: PERSP_PITCH },
    flat: { src: 'fields/lacrosse-flat.webp', w: 1000, h: 1180, H: FLAT_PITCH },
  },
};

/** Football has no artwork yet; it reuses the soccer pitch (the sport is disabled anyway). */
export function fieldImage(sport: SportKey, view: FieldView): FieldImage {
  const key = sport === 'football' ? 'soccer' : sport;
  return FIELDS[key][view];
}

/** Field-percent (x, y) → image pixel (px, py). */
export function proj(F: FieldImage, x: number, y: number): [number, number] {
  const H = F.H;
  const d = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d];
}

/** Field width ÷ image width at depth `y` — how much a full-field-width object shrinks there. */
export function fieldFrac(F: FieldImage, y: number): number {
  const [x0] = proj(F, 0, y);
  const [x1] = proj(F, 100, y);
  return (x1 - x0) / F.w;
}

export interface Placement {
  /** CSS percentages of the stage. */
  left: string;
  top: string;
  width: string;
  zIndex: number;
}

/** Where to put an element anchored at its bottom-centre, `wPctOfField` wide, at field (x, y). */
export function place(F: FieldImage, x: number, y: number, wPctOfField: number): Placement {
  const [px, py] = proj(F, x, y);
  return {
    left: `${(px / F.w) * 100}%`,
    top: `${(py / F.h) * 100}%`,
    width: `${wPctOfField * fieldFrac(F, y)}%`,
    zIndex: 10 + Math.round(y),
  };
}

/** Goals, hoops and posts drawn as standing SVG overlays: [kind, x, y, width % of field]. */
export type StandingKind = 'goal-far' | 'goal-near' | 'post' | 'hoop-far' | 'hoop-near';
export type Standing = readonly [StandingKind, number, number, number];

export const STANDING: Readonly<Record<SportKey, readonly Standing[]>> = {
  soccer: [
    ['goal-far', 50, 2.7, 26],
    ['goal-near', 50, 99.4, 26],
  ],
  lacrosse: [
    ['goal-far', 50, 16.2, 9],
    ['goal-near', 50, 85.2, 9],
  ],
  football: [['post', 50, 6.25, 13]],
  basketball: [
    ['hoop-far', 50, 7, 15],
    ['hoop-near', 50, 93, 20],
  ],
  baseball: [],
};
