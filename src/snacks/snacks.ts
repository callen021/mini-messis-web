/* =====================================================================
   SNACK SIGNUP (D115). A team setting decides which events take a snack family; one family per
   event, stored on the event as the player whose family brings the snacks. Pure helpers; the
   server enforces the cap and who may claim.
   ===================================================================== */

import { type Enums } from '@/lib/database.types';

export type SnackMode = Enums<'snack_mode'>;

export const SNACK_MODE_LABEL: Record<SnackMode, string> = {
  off: 'Off',
  games: 'Games',
  both: 'Games and practices',
};

export const snackWanted = (mode: SnackMode | null | undefined, kind: 'game' | 'practice'): boolean =>
  mode === 'both' || (mode === 'games' && kind === 'game');

/** "Nolan’s family": the slot is the family's, so either parent sees and changes it. */
export const familyLabel = (firstName: string): string => `${firstName}’s family`;

/** The snack columns every eligible event carries. */
export interface SnackSlot {
  snack_player_id: string | null;
  snack_flagged: boolean;
}

/** How many slots each family holds among the given events (the client's advisory count; the server decides). */
export function claimsByPlayer(events: readonly SnackSlot[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of events) {
    if (e.snack_player_id) out.set(e.snack_player_id, (out.get(e.snack_player_id) ?? 0) + 1);
  }
  return out;
}

/** The per-family cap as the server computes it: eligible events this season / active players, rounded up. */
export function snackCapOf(eligibleEvents: number, activePlayers: number): number {
  return Math.ceil(eligibleEvents / Math.max(activePlayers, 1));
}

/** What the schedule icon says. */
export function snackMarkLabel(
  slot: SnackSlot,
  nameOf: (playerId: string) => string | undefined,
): { state: 'open' | 'taken' | 'flagged'; label: string } {
  if (!slot.snack_player_id) return { state: 'open', label: 'Snacks: open' };
  const who = nameOf(slot.snack_player_id);
  const family = who ? familyLabel(who) : 'a family';
  if (slot.snack_flagged) return { state: 'flagged', label: `Snacks: ${family}, who can’t make it` };
  return { state: 'taken', label: `Snacks: ${family}` };
}
