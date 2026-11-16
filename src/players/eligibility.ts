import { type SportDefinition } from '@/sports/types';

/* =====================================================================
   ELIGIBLE POSITIONS (D117). Per player and position group: preferred, can play (the default,
   stored as no row) or never. Auto-fill and Suggest starters never place a player in a group
   marked never; a coach placing by hand is never blocked. Pure helpers; the hooks live in api.ts.
   ===================================================================== */

export type PrefLevel = 'preferred' | 'can' | 'never';

/** Levels per group key, per player id; a missing entry is "can play". */
export type Eligibility = ReadonlyMap<string, Readonly<Record<string, PrefLevel>>>;

export const NO_ELIGIBILITY: Eligibility = new Map();

export function prefLevel(elig: Eligibility, playerId: string, group: string): PrefLevel {
  return elig.get(playerId)?.[group] ?? 'can';
}

/** True unless the group is marked never for the player. */
export function canPlay(elig: Eligibility, playerId: string, group: string): boolean {
  return prefLevel(elig, playerId, group) !== 'never';
}

/** The auto-fill predicate for a loaded eligibility map; undefined (everyone eligible) while it is not loaded. */
export function eligibleFn(
  elig: Eligibility | undefined,
): ((playerId: string, group: string) => boolean) | undefined {
  if (!elig || elig.size === 0) return undefined;
  return (playerId, group) => canPlay(elig, playerId, group);
}

/** Rows of a `player_position_prefs` query → the map. */
export function toEligibility(
  rows: readonly { player_id: string; group_key: string; level: PrefLevel }[],
): Eligibility {
  const out = new Map<string, Record<string, PrefLevel>>();
  for (const r of rows) {
    if (r.level === 'can') continue;
    const g = out.get(r.player_id) ?? {};
    g[r.group_key] = r.level;
    out.set(r.player_id, g);
  }
  return out;
}

/** The map with one level changed; "can" drops the entry. */
export function withLevel(elig: Eligibility, playerId: string, group: string, level: PrefLevel): Eligibility {
  const out = new Map(elig);
  const g: Record<string, PrefLevel> = Object.fromEntries(
    Object.entries(out.get(playerId) ?? {}).filter(([k]) => k !== group),
  );
  if (level !== 'can') g[group] = level;
  if (Object.keys(g).length) out.set(playerId, g);
  else out.delete(playerId);
  return out;
}

/** The groups a player never plays, as the coach's words ("Goalie, Defense"). */
export function neverLabels(S: SportDefinition, elig: Eligibility, playerId: string): string[] {
  return (S.eligibility ?? [])
    .filter(([key]) => prefLevel(elig, playerId, key) === 'never')
    .map(([, label]) => label);
}

/** Position codes of spots left open because nobody eligible was on the bench ("GK, LCB"). */
export function skippedText(codes: readonly string[]): string {
  if (!codes.length) return '';
  return `${codes.join(', ')} left open · nobody eligible`;
}
