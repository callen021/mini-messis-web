import { type Tables } from '@/lib/database.types';
import { type Formation, type Period } from '@/sports/types';

export type LineupRow = Tables<'lineups'>;
export type SlotRow = Tables<'lineup_slots'>;

/** A period as stored: the engine `Period` plus the lineup id and the stored codes per slot. */
export interface StoredPeriod extends Period {
  lineupId: string;
  codes: string[];
  roles: string[];
  /** The persisted bench queue of this lineup row (D79). */
  bench: string[];
}

/** Rows → ordered periods (slot arrays sized to the stored slots). */
export function rowsToPeriods(lineups: readonly LineupRow[], slots: readonly SlotRow[]): StoredPeriod[] {
  const byLineup = new Map<string, SlotRow[]>();
  for (const s of slots) {
    const list = byLineup.get(s.lineup_id) ?? [];
    list.push(s);
    byLineup.set(s.lineup_id, list);
  }
  return [...lineups]
    .sort((a, b) => a.period_index - b.period_index)
    .map((l) => {
      const list = (byLineup.get(l.id) ?? []).sort((a, b) => a.slot_index - b.slot_index);
      const n = list.length ? (list[list.length - 1]?.slot_index ?? -1) + 1 : 0;
      const slotsArr = Array<string>(n).fill('');
      const codes = Array<string>(n).fill('');
      const roles = Array<string>(n).fill('');
      const auto: number[] = [];
      for (const s of list) {
        slotsArr[s.slot_index] = s.player_id ?? '';
        codes[s.slot_index] = s.position_code;
        roles[s.slot_index] = s.position_role;
        if (s.auto_picked && s.player_id) auto.push(s.slot_index);
      }
      return {
        lineupId: l.id,
        formation: l.formation_name,
        slots: slotsArr,
        auto,
        codes,
        roles,
        bench: [...(l.bench_order ?? [])],
      };
    });
}

export interface SavePeriodPayload {
  period_index: number;
  formation_name: string;
  slots: { position_role: string; position_code: string; player_id: string | null; auto_picked: boolean }[];
  /** Sent only when the period carries a queue; the server normalizes it (D79). */
  bench_order?: string[];
}

/** Engine periods → `save_lineups` payload, taking roles/codes from the formation definitions. */
export function periodsToPayload(
  periods: readonly Period[],
  formationFor: (name: string) => Formation,
): SavePeriodPayload[] {
  return periods.map((q, i) => {
    const f = formationFor(q.formation);
    const payload: SavePeriodPayload = {
      period_index: i,
      formation_name: f.name,
      slots: f.positions.map((pos, k) => ({
        position_role: pos.role,
        position_code: pos.code,
        player_id: q.slots[k] || null,
        auto_picked: q.auto.includes(k) && !!q.slots[k],
      })),
    };
    if (q.bench) payload.bench_order = [...q.bench];
    return payload;
  });
}

/** Strip storage fields so engine functions get plain periods. */
export const toEnginePeriods = (periods: readonly StoredPeriod[]): Period[] =>
  periods.map((q) => ({
    formation: q.formation,
    slots: [...q.slots],
    auto: [...q.auto],
    bench: [...q.bench],
  }));
