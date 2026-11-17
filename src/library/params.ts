import { type ParamDef } from './types';

/** A team's changes to an item's setup numbers: param key → whole number. */
export type Overrides = Readonly<Record<string, number>>;

export const FEET_PER_YARD = 3;

/** Keep only the keys the item lets a team adjust, inside their range. */
export function cleanOverrides(defs: readonly ParamDef[], raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const d of defs) {
    const v = (raw as Record<string, unknown>)[d.key];
    if (!d.adjustable || typeof v !== 'number' || !Number.isInteger(v)) continue;
    if (d.min !== null && v < d.min) continue;
    if (d.max !== null && v > d.max) continue;
    out[d.key] = v;
  }
  return out;
}

/** True when the team's value replaces the built-in one. */
export const isOverridden = (def: ParamDef, overrides: Overrides): boolean =>
  def.adjustable && overrides[def.key] !== undefined;

/**
 * The one number a param stands for (the diagram and the stepper need one): the team's value, or
 * the default, a default range's midpoint, or null when nothing is set.
 */
export function paramNumber(def: ParamDef, overrides: Overrides): number | null {
  const o = overrides[def.key];
  if (def.adjustable && o !== undefined) return o;
  const d = def.default;
  if (typeof d === 'number') return d;
  if (Array.isArray(d)) return Math.round((d[0] + d[1]) / 2);
  return null;
}

const range = (v: number | [number, number], f = 1): string =>
  Array.isArray(v) ? `${v[0] * f}–${v[1] * f}` : String(v * f);

/** What a param currently is: the team's number or the built-in default (which may be a range). */
function current(def: ParamDef, overrides: Overrides): number | [number, number] | string | null {
  const o = overrides[def.key];
  return def.adjustable && o !== undefined ? o : def.default;
}

/** Short value: "4", "3–5 yd", "10 min", "2+", "Not set". */
export function paramShort(def: ParamDef, overrides: Overrides): string {
  const v = current(def, overrides);
  if (v === null) return 'Not set';
  if (typeof v === 'string') return v;
  if (def.type === 'distance') return `${range(v)} yd`;
  if (def.type === 'duration') return `${range(v)} min`;
  return range(v);
}

/** The same distance in feet ("9–15 ft"); empty for anything that is not a distance. */
export function paramFeet(def: ParamDef, overrides: Overrides): string {
  const v = current(def, overrides);
  if (def.type !== 'distance' || v === null || typeof v === 'string') return '';
  return `${range(v, FEET_PER_YARD)} ft`;
}

/** Full value for reading: "3–5 yd (9–15 ft)". */
export function paramText(def: ParamDef, overrides: Overrides): string {
  const feet = paramFeet(def, overrides);
  return feet ? `${paramShort(def, overrides)} (${feet})` : paramShort(def, overrides);
}

/** Replace "$key" tokens in a diagram label with the param's full value. */
export function fillLabel(label: string, defs: readonly ParamDef[], overrides: Overrides): string {
  return label.replace(/\$([a-z_]+)/g, (whole, key: string) => {
    const def = defs.find((d) => d.key === key);
    return def ? paramText(def, overrides) : whole;
  });
}

/**
 * Stepper model for an adjustable param. A param with no default ("Not set") gets one extra step
 * below its minimum that stands for "not set"; stepping onto a value equal to the built-in default
 * of a plain number clears the override instead of storing a copy of it.
 */
export function stepperModel(def: ParamDef, overrides: Overrides) {
  const min = def.min ?? 0;
  const max = def.max ?? min;
  const unsettable = def.default === null;
  const floor = unsettable ? min - def.step : min;
  const value = paramNumber(def, overrides) ?? floor;
  /** The overrides after the stepper moved to `next`. */
  const apply = (next: number): Record<string, number> => {
    const clear = (unsettable && next < min) || (typeof def.default === 'number' && next === def.default);
    const rest = Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== def.key));
    return clear ? rest : { ...rest, [def.key]: next };
  };
  return { value, min: floor, max, step: def.step, apply };
}
