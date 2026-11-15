/* =====================================================================
   SELECT-THEN-TARGET (D70, D86), QUEUED (D113): taps on one side of the field build a queue, in
   tap order; each tap on the other side moves the next queued player, lowest number first. A
   single change is still two taps. There is no picker sheet on the Field: players are placed only
   by tapping jerseys, in either order. Pure: the component feeds taps in and acts on the outcome
   (a server call in a live clock game, a plan edit on the template or a period card).
   ===================================================================== */

export type Target =
  | { kind: 'field'; slot: number; playerId: string } // '' = an empty spot
  | { kind: 'bench'; playerId: string };

/** The queue of selected jerseys and spots, in tap order; every entry is on the same side. */
export type Selection = readonly Target[];

export type TapAction =
  /** The queue changed (an entry added, or one tapped again and removed). */
  | { action: 'select' }
  | { action: 'none' }
  /** An on-field player moves to an empty spot. */
  | { action: 'move'; playerId: string; slot: number }
  /** A bench player replaces an on-field player in their spot. */
  | { action: 'sub'; off: string; on: string }
  /** A bench player takes an empty spot. */
  | { action: 'fill'; playerId: string; slot: number };

export interface TapOutcome {
  action: TapAction;
  /** The queue after the tap: the rest of the line once the next queued player moved. */
  queue: Target[];
}

const same = (a: Target, b: Target) =>
  a.kind === b.kind &&
  (a.kind === 'field' ? a.slot === (b as { slot: number }).slot : a.playerId === b.playerId);

export function resolveTap(queue: Selection, target: Target): TapOutcome {
  const head = queue[0];
  if (!head) return { action: { action: 'select' }, queue: [target] };
  if (head.kind === target.kind) {
    const i = queue.findIndex((q) => same(q, target));
    if (i >= 0) {
      // the same jersey again leaves the line; the others keep their order and renumber
      return { action: { action: 'select' }, queue: queue.filter((_, k) => k !== i) };
    }
    if (target.kind === 'field' && !target.playerId) {
      // an empty spot tapped with on-field players in line: the first of them moves into it
      const k = queue.findIndex((q) => q.kind === 'field' && !!q.playerId);
      const mover = queue[k];
      if (mover && mover.kind === 'field')
        return {
          action: { action: 'move', playerId: mover.playerId, slot: target.slot },
          queue: queue.filter((_, j) => j !== k),
        };
    }
    return { action: { action: 'select' }, queue: [...queue, target] };
  }
  // the other side: the next in line moves, the rest wait
  const rest = queue.slice(1);
  if (head.kind === 'field') {
    if (!head.playerId)
      return { action: { action: 'fill', playerId: target.playerId, slot: head.slot }, queue: rest };
    return { action: { action: 'sub', off: head.playerId, on: target.playerId }, queue: rest };
  }
  if (target.kind === 'field' && target.playerId)
    return { action: { action: 'sub', off: target.playerId, on: head.playerId }, queue: rest };
  if (target.kind === 'field')
    return { action: { action: 'fill', playerId: head.playerId, slot: target.slot }, queue: rest };
  return { action: { action: 'none' }, queue: [...queue] };
}

/**
 * Two jerseys in line on the same side can change places with each other: positions on the
 * field, or places in the bench line (D79). Only with exactly two players queued.
 */
export function swapPair(queue: Selection): { kind: 'field' | 'bench'; a: string; b: string } | null {
  const [a, b] = queue;
  if (!a || !b || queue.length !== 2 || a.kind !== b.kind || !a.playerId || !b.playerId) return null;
  return { kind: a.kind, a: a.playerId, b: b.playerId };
}

/** The badge number (1, 2, 3…) of a queued jersey or spot, or undefined when it is not in line. */
export function queueNumber(queue: Selection, target: Target): number | undefined {
  const i = queue.findIndex((q) => same(q, target));
  return i >= 0 ? i + 1 : undefined;
}

const listNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')}, then ${names[names.length - 1]}`;

/**
 * The hint line under the field while something is selected: "Tap a bench player for Nolan",
 * "Tap bench players for Nolan, then Ava", for an empty spot "Tap a bench player for LS" (D86),
 * or with bench players in line "Tap a jersey on the field for Ava".
 */
export function selectionHint(
  queue: Selection,
  nameOf: (id: string) => string,
  codes: readonly string[] = [],
): string {
  const head = queue[0];
  if (!head) return '';
  const names = queue.map((q) =>
    q.kind === 'field' && !q.playerId ? (codes[q.slot] ?? 'the spot') : nameOf(q.playerId),
  );
  const many = names.length > 1;
  if (head.kind === 'bench')
    return `Tap ${many ? 'jerseys' : 'a jersey'} on the field for ${listNames(names)}`;
  return `Tap ${many ? 'bench players' : 'a bench player'} for ${listNames(names)}`;
}
