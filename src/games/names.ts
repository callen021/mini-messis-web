import { type Player } from '@/teams/api';
import { type GamePlayer } from './api';

export interface NameLookup {
  /** Display name: the roster row if present, else the snapshot taken when the game started/finished. */
  name: (id: string | null | undefined) => string;
  number: (id: string | null | undefined) => string;
  /** True when the id is no longer on the roster (removed player). */
  removed: (id: string) => boolean;
}

/** Legacy `gname` / `gnum`: live roster first, then the game snapshot, then ''. */
export function makeNameLookup(
  players: readonly Player[],
  snapshots: readonly GamePlayer[] = [],
): NameLookup {
  const byId = new Map(players.map((p) => [p.id, p]));
  const snap = new Map(snapshots.map((s) => [s.player_id, s]));
  return {
    name: (id) => {
      if (!id) return '';
      const p = byId.get(id);
      if (p) return `${p.first_name}${p.last_name ? ` ${p.last_name}` : ''}`;
      return snap.get(id)?.name_snapshot ?? '';
    },
    number: (id) => {
      if (!id) return '';
      return byId.get(id)?.jersey_number ?? snap.get(id)?.number_snapshot ?? '';
    },
    removed: (id) => !byId.has(id),
  };
}

/** Period label for logs: "Q2", "H1", "Inn 3"; nothing for a one-period game (D97). */
export function periodTag(periodName: string, index: number): string {
  if (periodName === 'Game') return '';
  return periodName === 'Inning' ? `Inn ${index + 1}` : `${periodName[0] ?? ''}${index + 1}`;
}

/** "Q2" / "H1" / "" after a scorer in a toast: the period, unless the game has only one. */
export function periodSuffix(periodName: string, index: number): string {
  const tag = periodTag(periodName, index);
  return tag ? ` · ${tag}` : '';
}

/** The log tag with the clock minute when the event carries one (clock mode, D74): "H2 23'". */
export function eventTag(
  periodName: string,
  ev: { period_index: number; clock_seconds?: number | null },
): string {
  const tag = periodTag(periodName, ev.period_index);
  if (ev.clock_seconds === null || ev.clock_seconds === undefined) return tag;
  const minute = `${Math.floor(Math.max(0, ev.clock_seconds) / 60) + 1}'`;
  return tag ? `${tag} ${minute}` : minute;
}
