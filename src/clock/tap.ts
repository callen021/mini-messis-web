/* =====================================================================
   SELECT-THEN-TARGET (D70, D86): the first tap selects a jersey or an empty spot, the second
   completes the change. There is no picker sheet on the Field: players are placed only by tapping
   jerseys, in either order. Pure: the component feeds taps in and acts on the outcome (a server
   call in a live clock game, a plan edit on the template or a period card).
   ===================================================================== */

export type Selection =
  /** An on-field jersey (playerId set) or an empty spot (playerId ''). */
  { kind: 'field'; slot: number; playerId: string } | { kind: 'bench'; playerId: string } | null;

export type Target =
  | { kind: 'field'; slot: number; playerId: string } // '' = an empty spot
  | { kind: 'bench'; playerId: string };

export type TapOutcome =
  | { action: 'select'; selection: Selection }
  | { action: 'cancel' }
  | { action: 'none' }
  /** Two on-field players change positions. */
  | { action: 'swap'; a: string; b: string }
  /** An on-field player moves to an empty spot. */
  | { action: 'move'; playerId: string; slot: number }
  /** A bench player replaces an on-field player in their spot. */
  | { action: 'sub'; off: string; on: string }
  /** A bench player takes an empty spot. */
  | { action: 'fill'; playerId: string; slot: number }
  /** Two bench players change places in the queue (D79). */
  | { action: 'benchswap'; a: string; b: string };

export function resolveTap(selected: Selection, target: Target): TapOutcome {
  if (!selected) return { action: 'select', selection: target as Selection };
  if (selected.kind === 'field') {
    if (target.kind === 'field') {
      if (target.slot === selected.slot) return { action: 'cancel' };
      if (!selected.playerId) {
        // an empty spot is selected: an on-field player moves into it; another empty spot takes over
        if (target.playerId) return { action: 'move', playerId: target.playerId, slot: selected.slot };
        return { action: 'select', selection: target as Selection };
      }
      if (target.playerId) return { action: 'swap', a: selected.playerId, b: target.playerId };
      return { action: 'move', playerId: selected.playerId, slot: target.slot };
    }
    if (!selected.playerId) return { action: 'fill', playerId: target.playerId, slot: selected.slot };
    return { action: 'sub', off: selected.playerId, on: target.playerId };
  }
  // a bench player is selected
  if (target.kind === 'bench') {
    return target.playerId === selected.playerId
      ? { action: 'cancel' }
      : { action: 'benchswap', a: selected.playerId, b: target.playerId };
  }
  if (target.playerId) return { action: 'sub', off: target.playerId, on: selected.playerId };
  return { action: 'fill', playerId: selected.playerId, slot: target.slot };
}

/**
 * The hint line under the field while something is selected: "Tap a player to swap with Nolan",
 * or for an empty spot "Tap a bench player for LS" (D86).
 */
export function selectionHint(
  selected: Selection,
  nameOf: (id: string) => string,
  codes: readonly string[] = [],
): string {
  if (!selected) return '';
  if (selected.kind === 'field' && !selected.playerId)
    return `Tap a bench player for ${codes[selected.slot] ?? 'the spot'}`;
  return `Tap a player to swap with ${nameOf(selected.playerId)}`;
}
