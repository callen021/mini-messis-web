/* =====================================================================
   SELECT-THEN-TARGET (D70): the first tap selects a jersey, the second completes the change.
   Pure: the component feeds taps in and acts on the outcome (a server call in a live clock game,
   a plan edit on the template).
   ===================================================================== */

export type Selection =
  { kind: 'field'; slot: number; playerId: string } | { kind: 'bench'; playerId: string } | null;

export type Target =
  | { kind: 'field'; slot: number; playerId: string } // '' = an empty spot
  | { kind: 'bench'; playerId: string };

export type TapOutcome =
  | { action: 'select'; selection: Selection }
  | { action: 'cancel' }
  | { action: 'none' }
  /** An empty spot tapped with nothing selected: open the picker sheet for it. */
  | { action: 'picker'; slot: number }
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
  if (!selected) {
    if (target.kind === 'field' && !target.playerId) return { action: 'picker', slot: target.slot };
    return { action: 'select', selection: target as Selection };
  }
  if (selected.kind === 'field') {
    if (target.kind === 'field') {
      if (target.slot === selected.slot) return { action: 'cancel' };
      if (target.playerId) return { action: 'swap', a: selected.playerId, b: target.playerId };
      return { action: 'move', playerId: selected.playerId, slot: target.slot };
    }
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

/** "Tap a player to swap with Nolan" — the hint line under the field while something is selected. */
export function selectionHint(selected: Selection, nameOf: (id: string) => string): string {
  if (!selected) return '';
  return `Tap a player to swap with ${nameOf(selected.playerId)}`;
}
