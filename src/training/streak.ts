/** A child's streak as the database counts it (D130; no days off since D138). */
export interface Streak {
  current: number;
  longest: number;
  /** Today already counts: a drill is Done, or a game or practice today counted. */
  todayCounts: boolean;
  /** A milestone reached and not yet celebrated; only ever set for the child's parent. */
  celebrate: number | null;
}

export const EMPTY_STREAK: Streak = {
  current: 0,
  longest: 0,
  todayCounts: false,
  celebrate: null,
};

/** "1 day", "4 days". */
export const days = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'}`;

/** The one line under the numbers: what today needs. A missed day ends the streak (D138). */
export function streakHint(s: Streak): string {
  if (s.todayCounts) return 'Done for today.';
  return s.current > 0 ? 'One drill today keeps it going.' : 'Do one drill today to start a streak.';
}

/** `yyyy-mm-ddThh:mm` right now where the team plays, to compare with a practice's start. */
export function teamNowStamp(timezone: string | null | undefined, now: Date = new Date()): string {
  const fmt = (tz: string | undefined) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = fmt(timezone || undefined);
  } catch {
    parts = fmt(undefined);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Has something on the schedule started: its date and start time, or the start of its date? */
export function eventStarted(date: string, startTime: string | null, nowStamp: string): boolean {
  return `${date}T${(startTime ?? '00:00').slice(0, 5)}` <= nowStamp;
}

/**
 * "We went" opens once a practice has started: its date and start time, or the start of its date
 * when it has no time. Never for a cancelled practice. The server checks the same thing.
 */
export function practiceStarted(
  p: { practice_date: string; start_time: string | null; status: string },
  nowStamp: string,
): boolean {
  if (p.status === 'cancelled') return false;
  return eventStarted(p.practice_date, p.start_time, nowStamp);
}
