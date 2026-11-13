/**
 * Pure rules for the live game (D108): a mid-game formation change keeps the same players and
 * puts each in the nearest position of the new shape; the clock "never run" test behind the
 * amber chip and the one-time "Start the clock?" prompt.
 */
import { type Formation } from '@/sports/types';
import { type ClockState, isRunning } from './clock';

/**
 * Place the players of `slots` (by index in `from`) into `to`: a player in a GK spot keeps a GK
 * spot, everyone else takes the nearest unclaimed position by field distance, closest pairs
 * first. Empty spots stay empty; a player with no spot left (smaller formation) is dropped.
 */
export function remapByDistance(
  from: Formation,
  to: Formation,
  slots: readonly string[],
  isKeeper: (role: string) => boolean = (r) => r === 'GK',
): string[] {
  const out = Array<string>(to.positions.length).fill('');
  const taken = new Set<number>();
  const claim = (slot: number, id: string) => {
    out[slot] = id;
    taken.add(slot);
  };
  // keepers first, into keeper spots
  from.positions.forEach((pos, i) => {
    const id = slots[i];
    if (!id || !isKeeper(pos.role)) return;
    const j = to.positions.findIndex((p, k) => isKeeper(p.role) && !taken.has(k));
    if (j >= 0) claim(j, id);
  });
  // everyone else: all (player, spot) pairs by distance, closest first
  const pairs: { i: number; j: number; d: number }[] = [];
  from.positions.forEach((pos, i) => {
    const id = slots[i];
    if (!id || isKeeper(pos.role)) return;
    to.positions.forEach((p, j) => {
      if (isKeeper(p.role)) return;
      pairs.push({ i, j, d: (p.x - pos.x) ** 2 + (p.y - pos.y) ** 2 });
    });
  });
  pairs.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);
  const placed = new Set<number>();
  for (const { i, j } of pairs) {
    if (placed.has(i) || taken.has(j)) continue;
    claim(j, slots[i] ?? '');
    placed.add(i);
  }
  // a keeper with no keeper spot in the new shape takes any spot that is left
  from.positions.forEach((pos, i) => {
    const id = slots[i];
    if (!id || !isKeeper(pos.role) || out.includes(id)) return;
    const j = to.positions.findIndex((_, k) => !taken.has(k));
    if (j >= 0) claim(j, id);
  });
  return out;
}

/** The clock of a live game has never run: first period, nothing banked, nothing ended, paused. */
export const neverRun = (clock: ClockState): boolean =>
  clock.periodIndex === 0 &&
  clock.clockSeconds === 0 &&
  clock.periodLengths.length === 0 &&
  !isRunning(clock);

const NUDGE = 'clock-nudge:';

/** The "Start the clock?" prompt is asked once per game on this device (D108). */
export function nudgeAsked(gameId: string): boolean {
  try {
    return localStorage.getItem(NUDGE + gameId) === '1';
  } catch {
    return false;
  }
}
export function markNudged(gameId: string): void {
  try {
    localStorage.setItem(NUDGE + gameId, '1');
  } catch {
    /* private mode: ask again next time */
  }
}
