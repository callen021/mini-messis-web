/**
 * The day's home drill (D138): one drill a day, the same for everyone on the same date, going
 * round all ten. Consecutive days change the kind of drill: footwork, dribbling, passing or
 * control.
 *
 * The day is picked by the calendar with nothing stored: days since a fixed Monday, modulo ten.
 * So every child on a team sees the same drill on the same date, each at their own level.
 */
export const ROTATION: readonly string[] = [
  'toe-taps',
  'cone-dribbling',
  'wall-passing-and-first-touch',
  'inside-inside-touches',
  'v-cuts',
  'juggling',
  'sole-rolls',
  'inside-outside-touches',
  'first-touch-and-passing-with-a-parent',
  'l-drags',
];

/** A child's first drill, whatever the date: until they have a Done on an earlier day. */
export const FIRST_DRILL = 'toe-taps';

/** Day 1 of the rotation: Monday 5 January 2026. */
const EPOCH_DAY = Date.UTC(2026, 0, 5) / 86_400_000;

/** Whole days since 1970 for a `yyyy-mm-dd` date. */
export function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/** 0 to 9: which drill of the rotation a date falls on. */
export function rotationDay(iso: string): number {
  const len = ROTATION.length;
  return (((dayNumber(iso) - EPOCH_DAY) % len) + len) % len;
}

/** The slug of that date's drill for the team. */
export function drillFor(iso: string): string {
  return ROTATION[rotationDay(iso)] ?? FIRST_DRILL;
}

/**
 * The slug of a child's drill today. A child with no Done before today starts with Toe Taps, and
 * keeps it for the whole of that first day; from the next day they follow the team's rotation.
 */
export function drillForChild(today: string, firstDoneOn: string | null): string {
  return firstDoneOn === null || firstDoneOn >= today ? FIRST_DRILL : drillFor(today);
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
