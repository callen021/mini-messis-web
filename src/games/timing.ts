/** "Today / Tomorrow / This week / Upcoming" for schedule rows, and countdowns for the parent home. */
import { parseISODate } from './format';

export type TimingLabel = 'Today' | 'Tomorrow' | 'This week' | 'Upcoming';

/** Whole days from `today` to `date` (both yyyy-mm-dd, local); negative when in the past. */
export function daysUntil(date: string, today: string): number | null {
  const a = parseISODate(date);
  const b = parseISODate(today);
  if (!a || !b) return null;
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/**
 * The timing badge for an upcoming row: Today, Tomorrow, This week (2 to 6 days away), otherwise
 * Upcoming. Past dates (a live game that ran over midnight) count as Today.
 */
export function timingLabel(date: string, today: string): TimingLabel {
  const d = daysUntil(date, today);
  if (d === null) return 'Upcoming';
  if (d <= 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d <= 6) return 'This week';
  return 'Upcoming';
}

/** Minutes until a date + optional time (local), from `now`; null when the date is malformed. */
export function minutesUntil(date: string, time: string | null, now: Date): number | null {
  const d = parseISODate(date);
  if (!d) return null;
  const m = /^(\d{2}):(\d{2})/.exec(time ?? '');
  if (m) d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 60_000);
}

/** "in 3 days", "in 2 h 15 min", "in 40 min", "now", "today" (no time), "started 10 min ago". */
export function countdown(date: string, time: string | null, now: Date): string {
  const mins = minutesUntil(date, time, now);
  if (mins === null) return '';
  if (!time) {
    const days = daysUntil(date, isoOf(now)) ?? 0;
    if (days <= 0) return 'today';
    if (days === 1) return 'tomorrow';
    return `in ${days} days`;
  }
  if (mins <= -120) return 'earlier today';
  if (mins < 0) return `started ${-mins} min ago`;
  if (mins < 1) return 'now';
  if (mins < 60) return `in ${mins} min`;
  if (mins < 24 * 60) {
    const h = Math.floor(mins / 60);
    const r = mins % 60;
    return r ? `in ${h} h ${r} min` : `in ${h} h`;
  }
  const days = Math.round(mins / (24 * 60));
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

const isoOf = (d: Date): string =>
  [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join(
    '-',
  );
