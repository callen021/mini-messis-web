/** Pure helpers for practices: weekly date expansion and the merged game + practice schedule. */
import { type Tables } from '@/lib/database.types';
import { parseISODate, fmtDate, fmtTime } from './format';

export type Practice = Tables<'practices'>;

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const toISO = (d: Date): string =>
  [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join(
    '-',
  );

/** Weekday (0 = Sunday) of an ISO date, or null when malformed. */
export function weekdayOf(iso: string): number | null {
  const d = parseISODate(iso);
  return d ? d.getDay() : null;
}

/** Hard cap on a repeating series so a typo in the end date cannot create years of practices. */
export const MAX_SERIES = 60;

/**
 * Every `weekday` (0 = Sunday … 6 = Saturday) from `from` to `to` inclusive, as ISO dates in
 * ascending order. Empty when the range is malformed or reversed. Capped at MAX_SERIES.
 */
export function weeklyDates(weekday: number, from: string, to: string): string[] {
  const start = parseISODate(from);
  const end = parseISODate(to);
  if (!start || !end || end < start || weekday < 0 || weekday > 6) return [];
  const d = new Date(start);
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
  const out: string[] = [];
  while (d <= end && out.length < MAX_SERIES) {
    out.push(toISO(d));
    d.setDate(d.getDate() + 7);
  }
  return out;
}

export interface ScheduleGame {
  id: string;
  game_date: string;
  start_time: string | null;
  status: 'upcoming' | 'live' | 'done';
}

export type ScheduleItem<G extends ScheduleGame = ScheduleGame> =
  | { kind: 'game'; date: string; time: string | null; game: G }
  | { kind: 'practice'; date: string; time: string | null; practice: Practice };

const byDateTime = (a: { date: string; time: string | null }, b: { date: string; time: string | null }) =>
  a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '');

/**
 * The Schedule tab: upcoming games and every practice dated today or later (cancelled ones
 * included, so a parent who saw it still sees it), merged and sorted by date then start time.
 */
export function mergeSchedule<G extends ScheduleGame>(
  games: readonly G[],
  practices: readonly Practice[],
  today: string,
): ScheduleItem<G>[] {
  const items: ScheduleItem<G>[] = [];
  for (const g of games)
    if (g.status === 'upcoming') items.push({ kind: 'game', date: g.game_date, time: g.start_time, game: g });
  for (const p of practices)
    if (p.practice_date >= today)
      items.push({ kind: 'practice', date: p.practice_date, time: p.start_time, practice: p });
  return items.sort(byDateTime);
}

export type ScheduleFilter = 'all' | 'games' | 'practices';

/** The All | Games | Practices segment applied to a merged schedule (order preserved). */
export function filterSchedule<G extends ScheduleGame>(
  items: readonly ScheduleItem<G>[],
  filter: ScheduleFilter,
): ScheduleItem<G>[] {
  if (filter === 'all') return [...items];
  const kind = filter === 'games' ? 'game' : 'practice';
  return items.filter((i) => i.kind === kind);
}

/** "Wed, Nov 11, 2026 · 6:30 PM – 7:30 PM · Field 2" */
export function practiceLine(
  p: Pick<Practice, 'practice_date' | 'start_time' | 'end_time' | 'location'>,
  long = true,
): string {
  const start = fmtTime(p.start_time);
  const end = fmtTime(p.end_time);
  const when = start && end ? `${start} – ${end}` : start;
  return [fmtDate(p.practice_date, long), when, p.location ?? ''].filter(Boolean).join(' · ');
}

/** Minutes between start and end, or null when either is missing. */
export function practiceMinutes(p: Pick<Practice, 'start_time' | 'end_time'>): number | null {
  const a = /^(\d{2}):(\d{2})/.exec(p.start_time ?? '');
  const b = /^(\d{2}):(\d{2})/.exec(p.end_time ?? '');
  if (!a || !b) return null;
  const mins = Number(b[1]) * 60 + Number(b[2]) - (Number(a[1]) * 60 + Number(a[2]));
  return mins > 0 ? mins : null;
}
