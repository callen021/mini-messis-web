/**
 * The day's home drill (D141): each child works through the ten drills in their own time, easiest
 * first, one a day, and then round again. (Until D141 the drill was picked by the calendar, the
 * same for the whole team.)
 *
 * Nothing is stored. Today's drill is the one the child has gone longest without: a drill never
 * done comes before any that was, in the order below; after that, the one done longest ago. So a
 * brand-new child starts with Toe Taps, a missed day skips nothing, and a drill done early from
 * "Do another" simply goes to the back of the line. Only Dones before today count, so the day's
 * drill stays put once it is done.
 */
export const ROTATION: readonly string[] = [
  'toe-taps',
  'inside-inside-touches',
  'sole-rolls',
  'wall-passing-and-first-touch',
  'first-touch-and-passing-with-a-parent',
  'inside-outside-touches',
  'cone-dribbling',
  'v-cuts',
  'l-drags',
  'juggling',
];

/** Whole days since 1970 for a `yyyy-mm-dd` date. */
export function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/**
 * The slug of a child's drill today, out of the drills on offer. `lastDoneOn` is the last day
 * before today each drill was Done, by slug; a drill not in it was never done (or so long ago it
 * no longer matters). A drill this build does not list comes after the ten, in the order given.
 */
export function drillForChild(
  slugs: readonly string[],
  lastDoneOn: ReadonlyMap<string, string>,
): string | null {
  const place = (slug: string): number => {
    const i = ROTATION.indexOf(slug);
    return i < 0 ? ROTATION.length + slugs.indexOf(slug) : i;
  };
  let pick: string | null = null;
  for (const slug of slugs) {
    if (pick === null) {
      pick = slug;
      continue;
    }
    const a = lastDoneOn.get(slug) ?? '';
    const b = lastDoneOn.get(pick) ?? '';
    if (a < b || (a === b && place(slug) < place(pick))) pick = slug;
  }
  return pick;
}

/** Today as `yyyy-mm-dd` where the team plays; the server stamps completions the same way. */
export function teamToday(timezone: string | null | undefined, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(
      now,
    );
  }
}

/** A `yyyy-mm-dd` date moved by whole days. */
export function addDays(iso: string, days: number): string {
  return new Date((dayNumber(iso) + days) * 86_400_000).toISOString().slice(0, 10);
}
