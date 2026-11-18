/**
 * The day's three home drills (D128): the five-day rotation of the home-drills sheet, one
 * footwork drill, one dribbling drill and one passing or control drill a day. Five days cover all
 * ten drills, then it repeats.
 *
 * The day is picked by the calendar with nothing stored: days since a fixed Monday, modulo five.
 * So every child sees the same three drills on the same date, and siblings match. Seven is not a
 * multiple of five, so a Monday is not always day 1.
 */
export const ROTATION: readonly (readonly [string, string, string])[] = [
  ['toe-taps', 'cone-dribbling', 'first-touch-and-passing-with-a-parent'],
  ['inside-inside-touches', 'v-cuts', 'wall-passing-and-first-touch'],
  ['sole-rolls', 'l-drags', 'juggling'],
  ['toe-taps', 'inside-outside-touches', 'first-touch-and-passing-with-a-parent'],
  ['inside-inside-touches', 'cone-dribbling', 'wall-passing-and-first-touch'],
];

/** Day 1 of the rotation: Monday 5 January 2026. */
const EPOCH_DAY = Date.UTC(2026, 0, 5) / 86_400_000;

/** Whole days since 1970 for a `yyyy-mm-dd` date. */
export function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/** 0 to 4: which row of the rotation a date falls on. */
export function rotationDay(iso: string): number {
  const len = ROTATION.length;
  return (((dayNumber(iso) - EPOCH_DAY) % len) + len) % len;
}

/** The slugs of that date's three drills, in the sheet's order. */
export function drillsFor(iso: string): readonly [string, string, string] {
  return ROTATION[rotationDay(iso)] ?? ['', '', ''];
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
