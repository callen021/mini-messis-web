/* =====================================================================
   THE BENCH QUEUE (D79). An explicit order, left to right, the leftmost next in line. Pure
   helpers mirroring the database's `bench_normalize` / `bench_apply`, so the page can draw the
   right order before the server answers.
   ===================================================================== */

/**
 * A clean queue: `order` with anyone on the field or not in `roster` dropped (and duplicates
 * removed), then every other roster player appended in roster order. `roster` is the available
 * players in roster order; players marked out are simply not in it.
 */
export function benchQueue(
  order: readonly string[],
  roster: readonly string[],
  onField: readonly string[],
): string[] {
  const allowed = new Set(roster.filter((id) => !onField.includes(id)));
  const out: string[] = [];
  for (const id of order) {
    if (allowed.has(id) && !out.includes(id)) out.push(id);
  }
  for (const id of roster) {
    if (allowed.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * The queue after a lineup edit: players who left the field join the right end in the order they
 * stood; players who came on leave the queue and the gap closes.
 */
export function benchAfterEdit(
  order: readonly string[],
  roster: readonly string[],
  oldSlots: readonly string[],
  newSlots: readonly string[],
): string[] {
  const newlyOff = oldSlots.filter((id) => id && !newSlots.includes(id));
  return benchQueue([...order, ...newlyOff], roster, newSlots);
}

/** Two bench players change places; anything else is left alone. */
export function benchSwap(order: readonly string[], a: string, b: string): string[] {
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  if (ia < 0 || ib < 0 || ia === ib) return [...order];
  const out = [...order];
  out[ia] = b;
  out[ib] = a;
  return out;
}
