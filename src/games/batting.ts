import { type Player } from '@/teams/api';
import { type PaResult } from './api';

/**
 * Batting order: available players by `batting_order` (unset last), then roster order, then name.
 * Players marked out are skipped, exactly like the legacy `ids` list.
 */
export function battingOrder(players: readonly Player[]): Player[] {
  return players
    .filter((p) => p.is_available)
    .sort(
      (a, b) =>
        (a.batting_order ?? Number.MAX_SAFE_INTEGER) - (b.batting_order ?? Number.MAX_SAFE_INTEGER) ||
        a.sort_order - b.sort_order ||
        a.first_name.localeCompare(b.first_name),
    );
}

/** Index of the last batter and who is up next (wraps; -1 when nobody can bat). */
export function batterPointers(order: readonly { id: string }[], lastBatterId: string | null) {
  const li = lastBatterId ? order.findIndex((p) => p.id === lastBatterId) : -1;
  const nextIdx = order.length ? (li < 0 ? 0 : (li + 1) % order.length) : -1;
  return { lastIdx: li, nextIdx };
}

/** Swap two neighbours in an id list (the up/down arrows). */
export function moveInOrder(ids: readonly string[], from: number, to: number): string[] {
  if (to < 0 || to >= ids.length || from === to) return [...ids];
  const next = [...ids];
  const a = next[from];
  const b = next[to];
  if (a === undefined || b === undefined) return next;
  next[from] = b;
  next[to] = a;
  return next;
}

export const PA_RESULTS: readonly { value: PaResult; label: string; short: string }[] = [
  { value: 'single', label: 'Single', short: '1B' },
  { value: 'double', label: 'Double', short: '2B' },
  { value: 'triple', label: 'Triple', short: '3B' },
  { value: 'home_run', label: 'Home run', short: 'HR' },
  { value: 'walk', label: 'Walk', short: 'BB' },
  { value: 'hit_by_pitch', label: 'Hit by pitch', short: 'HBP' },
  { value: 'strikeout', label: 'Strikeout', short: 'K' },
  { value: 'out', label: 'Out', short: 'OUT' },
  { value: 'sacrifice', label: 'Sacrifice', short: 'SAC' },
  { value: 'fielders_choice', label: "Fielder's choice", short: 'FC' },
  { value: 'reached_on_error', label: 'Reached on error', short: 'E' },
];

export const paResultLabel = (r: PaResult): string =>
  r === 'none' ? 'Batted' : (PA_RESULTS.find((x) => x.value === r)?.label ?? r);
export const paResultShort = (r: PaResult): string =>
  r === 'none' ? '—' : (PA_RESULTS.find((x) => x.value === r)?.short ?? r);
