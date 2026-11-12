import { defaultFormation, formationByName } from './definitions';
import { type EnginePlayer, type Formation, type Period, type SportDefinition } from './types';

/* =====================================================================
   LINEUP RULES — remap, consistency pass, counts, balance, auto-fill.
   Ported from legacy/index.html; every function is pure (no shared state) and returns new
   objects rather than mutating inputs, so React/Query can diff them.
   ===================================================================== */

export const isIn = (p: EnginePlayer | undefined): p is EnginePlayer =>
  !!p && p.name.trim() !== '' && p.active;

/** Players who can be placed: named and not marked out. */
export const activePlayers = (players: readonly EnginePlayer[]): EnginePlayer[] => players.filter(isIn);

export function emptyPeriod(f: Formation): Period {
  return { formation: f.name, slots: Array<string>(f.positions.length).fill(''), auto: [] };
}

/** Drop auto flags that point at indexes that are out of range or empty. */
const cleanAuto = (auto: readonly number[], slots: readonly string[]): number[] =>
  [...new Set(auto)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < slots.length && !!slots[i])
    .sort((a, b) => a - b);

/**
 * Re-map a period's slots onto a (possibly different) formation: same role first, then any
 * open spot. Players not in `players` are dropped. Clears auto flags (legacy `remap`).
 */
export function remap(
  period: Period,
  from: Formation,
  to: Formation,
  players: readonly EnginePlayer[],
): Period {
  const known = new Set(players.map((p) => p.id));
  const oldRoles = from.positions.map((p) => p.role);
  const newRoles = to.positions.map((p) => p.role);
  const taken = new Set<string>();
  const next = Array<string>(newRoles.length).fill('');
  // pass 1: same role
  oldRoles.forEach((role, i) => {
    const id = period.slots[i];
    if (!id || taken.has(id) || !known.has(id)) return;
    const ix = newRoles.findIndex((r, j) => r === role && !next[j]);
    if (ix >= 0) {
      next[ix] = id;
      taken.add(id);
    }
  });
  // pass 2: any open spot
  oldRoles.forEach((_, i) => {
    const id = period.slots[i];
    if (!id || taken.has(id) || !known.has(id)) return;
    const ix = next.findIndex((v) => !v);
    if (ix >= 0) {
      next[ix] = id;
      taken.add(id);
    }
  });
  return { formation: to.name, slots: next, auto: [] };
}

/**
 * Keep a plan consistent with the team's settings (legacy `fixPeriods`):
 * - unknown formation name → sport default, players kept by index where possible
 * - slot count mismatch → remap by role, then by open spot
 * - players who are gone or marked out are cleared from slots
 * - auto flags pruned
 * Never call this on a completed game.
 */
export function fixPeriods(
  periods: readonly Period[],
  forms: readonly Formation[],
  sport: SportDefinition,
  players: readonly EnginePlayer[],
): Period[] {
  const okIds = new Set(players.filter((p) => p.active).map((p) => p.id));
  return periods.map((q) => {
    const named = forms.find((x) => x.name === q.formation);
    const f = named ?? defaultFormation(forms, sport);
    let out: Period = { formation: q.formation, slots: [...q.slots], auto: [...q.auto] };
    if (q.formation !== f.name || q.slots.length !== f.positions.length) {
      if (!named) {
        const next = Array<string>(f.positions.length).fill('');
        q.slots.forEach((id, i) => {
          if (id && i < next.length && !next.includes(id)) next[i] = id;
        });
        out = { formation: f.name, slots: next, auto: [] };
      } else {
        // same name, different slot count: role-aware remap using the stale slot list as "from"
        const stale: Formation = {
          name: named.name,
          w: named.w,
          positions: q.slots.map((_, i) => named.positions[i] ?? { role: '', code: '', x: 0, y: 0 }),
        };
        out = remap(q, stale, f, players);
      }
    }
    const slots = out.slots.map((id) => (okIds.has(id) ? id : ''));
    const fixed: Period = { formation: out.formation, slots, auto: cleanAuto(out.auto, slots) };
    return q.bench ? { ...fixed, bench: [...q.bench] } : fixed;
  });
}

/** Resize a plan to `n` periods: new periods use the sport default formation (legacy `setPeriods`). */
export function resizePeriods(
  periods: readonly Period[],
  n: number,
  forms: readonly Formation[],
  sport: SportDefinition,
): Period[] {
  const f = defaultFormation(forms, sport);
  const out = periods.slice(0, n).map((q) => ({ ...q, slots: [...q.slots], auto: [...q.auto] }));
  while (out.length < n) out.push(emptyPeriod(f));
  return out;
}

/** Periods each player appears in (a player counts once per period even if listed twice). */
export function counts(periods: readonly Period[], players: readonly EnginePlayer[]): Record<string, number> {
  const c: Record<string, number> = {};
  players.forEach((p) => (c[p.id] = 0));
  periods.forEach((q) => {
    new Set(q.slots.filter(Boolean)).forEach((id) => {
      if (id in c) c[id] = (c[id] ?? 0) + 1;
    });
  });
  return c;
}

export type TotalLevel = 'low' | 'good' | 'warn';

/** Color level for a player's total: every period = warn, under half (floored) = low, else good. */
export function totalLevel(n: number, periodCount: number): TotalLevel {
  if (n >= periodCount) return 'warn';
  if (n < Math.floor(periodCount / 2)) return 'low';
  return 'good';
}

export interface Balance {
  min: number;
  max: number;
  /** Mean to one decimal, as a string ("2.8"). */
  average: string;
  /** Meter fill 0–100 (min ÷ max). */
  percent: number;
  /** True when the spread is more than one period — the meter turns orange. */
  spread: boolean;
}

/** Playing-time summary for the balance meter. Informational only; nothing is enforced. */
export function balance(periods: readonly Period[], players: readonly EnginePlayer[]): Balance | null {
  const c = counts(periods, players);
  const vals = activePlayers(players).map((p) => c[p.id] ?? 0);
  if (!vals.length) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const average = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  return { min, max, average, percent: max ? Math.round((100 * min) / max) : 0, spread: max - min > 1 };
}

/** Hint text under the meter. Uses "playing time", never "fairness". */
export function balanceHint(b: Balance | null, periodNoun: string): string {
  if (!b) return 'Add players to begin.';
  return b.spread
    ? `Consider giving more time to players with fewer ${periodNoun}s.`
    : 'Playing time is reasonably balanced.';
}

/* ---------- auto-fill ----------
   Fills every open jersey in a period with the bench players who have the fewest periods so far
   in this plan, preferring kids who haven't yet had a turn in that position group. Hand-picked
   jerseys are never touched; auto-picked slots are remembered in `auto` so "Redo" can reshuffle
   just those. Counts are within the current plan only (one game), never the season. */

export interface AutoFillOptions {
  /** Clear and re-pick the slots previously filled by Auto-fill in this period. */
  redo?: boolean;
  /** Random source for tie-breaks (injectable for tests). */
  random?: () => number;
}

export interface AutoFillResult {
  periods: Period[];
  filled: number;
}

export function autoFill(
  periods: readonly Period[],
  periodIndex: number,
  forms: readonly Formation[],
  sport: SportDefinition,
  players: readonly EnginePlayer[],
  { redo = false, random = Math.random }: AutoFillOptions = {},
): AutoFillResult {
  const src = periods[periodIndex];
  if (!src) return { periods: [...periods], filled: 0 };
  const f = formationByName(forms, src.formation);
  const q: Period = { formation: src.formation, slots: [...src.slots], auto: cleanAuto(src.auto, src.slots) };
  if (redo) {
    q.auto.forEach((i) => (q.slots[i] = ''));
    q.auto = [];
  }
  const open = f.positions.map((_, i) => i).filter((i) => !q.slots[i]);
  if (!open.length) return { periods: [...periods], filled: 0 };

  const working = periods.map((p, i) => (i === periodIndex ? q : p));
  const c = counts(working, players);
  const grpN: Record<string, Record<string, number>> = {};
  const rnd = new Map<string, number>();
  players.forEach((p) => {
    grpN[p.id] = {};
    rnd.set(p.id, random());
  });
  working.forEach((qq, j) => {
    if (j === periodIndex) return;
    const ff = formationByName(forms, qq.formation);
    qq.slots.forEach((id, i) => {
      const pos = ff.positions[i];
      const g = grpN[id];
      if (!id || !g || !pos) return;
      const group = sport.group(pos.role);
      g[group] = (g[group] ?? 0) + 1;
    });
  });
  // goalie first so that rotation stays fair too
  open.sort((a, b) => Number(f.positions[b]?.role === 'GK') - Number(f.positions[a]?.role === 'GK'));

  let filled = 0;
  const bench0 = activePlayers(players);
  open.forEach((i) => {
    const pos = f.positions[i];
    if (!pos) return;
    const g = sport.group(pos.role);
    const bench = bench0.filter((p) => !q.slots.includes(p.id));
    if (!bench.length) return;
    bench.sort(
      (a, b) =>
        (c[a.id] ?? 0) - (c[b.id] ?? 0) ||
        (grpN[a.id]?.[g] ?? 0) - (grpN[b.id]?.[g] ?? 0) ||
        (rnd.get(a.id) ?? 0) - (rnd.get(b.id) ?? 0),
    );
    const p = bench[0];
    if (!p) return;
    q.slots[i] = p.id;
    c[p.id] = (c[p.id] ?? 0) + 1;
    q.auto.push(i);
    filled++;
  });
  q.auto.sort((a, b) => a - b);
  return { periods: working, filled };
}

/** Auto-fill every period in order. */
export function autoFillAll(
  periods: readonly Period[],
  forms: readonly Formation[],
  sport: SportDefinition,
  players: readonly EnginePlayer[],
  options: Omit<AutoFillOptions, 'redo'> = {},
): AutoFillResult {
  let cur: Period[] = [...periods];
  let filled = 0;
  for (let i = 0; i < cur.length; i++) {
    const r = autoFill(cur, i, forms, sport, players, options);
    cur = r.periods;
    filled += r.filled;
  }
  return { periods: cur, filled };
}

/** Number of open slots across a plan. */
export const openCount = (periods: readonly Period[]): number =>
  periods.reduce((n, q) => n + q.slots.filter((v) => !v).length, 0);

/* ---------- single-slot edits (Field jersey tap / rotation chip) ---------- */

export interface AssignResult {
  period: Period;
  /** Slot index the player was moved from, if they were already in this period. */
  movedFrom: number | null;
  /** Player id that was bumped out of the target slot, if any. */
  bumped: string | null;
}

/**
 * Put `playerId` into `slotIndex` of a period (legacy jersey `<select>` onchange). If the player
 * already holds another slot in the same period, that slot opens up (a move). Passing '' clears
 * the slot. Hand edits always clear the auto flag on touched slots.
 */
export function assignSlot(period: Period, slotIndex: number, playerId: string): AssignResult {
  const slots = [...period.slots];
  let auto = [...period.auto];
  const unAuto = (i: number) => (auto = auto.filter((k) => k !== i));
  let movedFrom: number | null = null;
  if (playerId) {
    const prev = slots.findIndex((v, k) => k !== slotIndex && v === playerId);
    if (prev >= 0) {
      slots[prev] = '';
      unAuto(prev);
      movedFrom = prev;
    }
  }
  const bumped = slots[slotIndex] && slots[slotIndex] !== playerId ? (slots[slotIndex] ?? null) : null;
  slots[slotIndex] = playerId;
  unAuto(slotIndex);
  return { period: { ...period, slots, auto }, movedFrom, bumped };
}

/**
 * Rotation-grid semantics (legacy chip `<select>`): place `playerId` at `slotIndex`, swapping
 * out whoever held it (they become unassigned), or sit the player (`slotIndex === null`).
 */
export function placePlayer(period: Period, playerId: string, slotIndex: number | null): AssignResult {
  const slots = [...period.slots];
  let auto = [...period.auto];
  const unAuto = (i: number) => (auto = auto.filter((k) => k !== i));
  const prev = slots.indexOf(playerId);
  if (prev >= 0) {
    slots[prev] = '';
    unAuto(prev);
  }
  let bumped: string | null = null;
  if (slotIndex !== null) {
    const occupant = slots[slotIndex];
    if (occupant && occupant !== playerId) bumped = occupant;
    slots[slotIndex] = playerId;
    unAuto(slotIndex);
  }
  return { period: { ...period, slots, auto }, movedFrom: prev >= 0 ? prev : null, bumped };
}

/** Remove a player from every period (marking them out, or removing them from the roster). */
export function clearPlayer(periods: readonly Period[], playerId: string): Period[] {
  return periods.map((q) => {
    const slots = q.slots.map((s) => (s === playerId ? '' : s));
    return { ...q, slots, auto: cleanAuto(q.auto, slots) };
  });
}

/** Empty every slot, keeping formations (Field → Clear). */
export function clearAll(periods: readonly Period[]): Period[] {
  return periods.map((q) => ({ ...q, slots: q.slots.map(() => ''), auto: [] }));
}

/**
 * Build the legacy "Load example team" plan: default formation in every period, players
 * rotated through the slots so everyone gets turns.
 */
export function samplePlan(periodCount: number, f: Formation, playerIds: readonly string[]): Period[] {
  const n = playerIds.length;
  const k = f.positions.length;
  return Array.from({ length: periodCount }, (_, pi) => {
    const start = n ? (((pi * (n - k)) % n) + n) % n : 0;
    const slots = Array.from({ length: k }, (_, i) => (i < n ? (playerIds[(start + i) % n] ?? '') : ''));
    return { formation: f.name, slots, auto: [] };
  });
}
