import { type Formation, type Period, type SportDefinition } from '@/sports/types';

/* =====================================================================
   AUTO-FILL IN CLOCK MODE (D71). Same shape as the period engine's auto-fill — fewest time first,
   a turn in each position group, random tie-break, goalie first, hand picks never moved — but
   ranked by seconds rather than periods: season minutes before a game, game minutes at a break.
   ===================================================================== */

export interface TimeRank {
  /** Seconds played in the ranking window (season or this game). */
  seconds: number;
  /** Seconds per position group in the same window. */
  byGroup: Readonly<Record<string, number>>;
}

export interface FillOptions {
  random?: () => number;
}

/**
 * Fill the open spots of `period` from `candidates` (available players not on the field), the
 * player with the fewest seconds first, then the fewest seconds in that spot's position group,
 * then at random. Occupied spots are never touched. Returns the new period and how many were filled.
 */
export function fillByTime(
  period: Period,
  formation: Formation,
  sport: SportDefinition,
  candidates: readonly { id: string }[],
  rank: ReadonlyMap<string, TimeRank>,
  { random = Math.random }: FillOptions = {},
): { period: Period; filled: number } {
  const slots = [...period.slots];
  const auto = [...period.auto];
  const open = formation.positions.map((_, i) => i).filter((i) => !slots[i]);
  if (!open.length) return { period, filled: 0 };
  open.sort(
    (a, b) => Number(formation.positions[b]?.role === 'GK') - Number(formation.positions[a]?.role === 'GK'),
  );
  const rnd = new Map(candidates.map((c) => [c.id, random()]));
  const secs = (id: string) => rank.get(id)?.seconds ?? 0;
  const groupSecs = (id: string, g: string) => rank.get(id)?.byGroup[g] ?? 0;
  let filled = 0;
  for (const i of open) {
    const pos = formation.positions[i];
    if (!pos) continue;
    const g = sport.group(pos.role);
    const bench = candidates.filter((c) => !slots.includes(c.id));
    if (!bench.length) break;
    bench.sort(
      (a, b) =>
        secs(a.id) - secs(b.id) ||
        groupSecs(a.id, g) - groupSecs(b.id, g) ||
        (rnd.get(a.id) ?? 0) - (rnd.get(b.id) ?? 0),
    );
    const pick = bench[0];
    if (!pick) break;
    slots[i] = pick.id;
    auto.push(i);
    filled++;
  }
  return {
    period: { formation: period.formation, slots, auto: [...new Set(auto)].sort((a, b) => a - b) },
    filled,
  };
}

/**
 * Suggest a full set of starters for the next period from everyone available, ranked by minutes
 * this game (a halftime "who has played least" pick). Every spot is re-picked.
 */
export function suggestStarters(
  formation: Formation,
  sport: SportDefinition,
  available: readonly { id: string }[],
  rank: ReadonlyMap<string, TimeRank>,
  options: FillOptions = {},
): Period {
  const empty: Period = { formation: formation.name, slots: formation.positions.map(() => ''), auto: [] };
  return fillByTime(empty, formation, sport, available, rank, options).period;
}

/** Minutes this game per player and position group, from the stints (for the halftime suggestion). */
export function rankFromStints(
  stints: readonly { player_id: string; position_role: string; seconds: number }[],
  group: (role: string) => string,
): Map<string, TimeRank> {
  const out = new Map<string, { seconds: number; byGroup: Record<string, number> }>();
  for (const st of stints) {
    const r = out.get(st.player_id) ?? { seconds: 0, byGroup: {} };
    r.seconds += st.seconds;
    const g = group(st.position_role);
    r.byGroup[g] = (r.byGroup[g] ?? 0) + st.seconds;
    out.set(st.player_id, r);
  }
  return out;
}
