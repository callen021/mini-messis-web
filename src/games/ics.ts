/**
 * iCalendar export for games and practices (RFC 5545). Pure builders; the delivery helpers at the
 * bottom touch the DOM. Times are converted from the team's timezone (D50) to UTC, which every
 * calendar app understands without a VTIMEZONE block.
 */

export interface IcsGame {
  id: string;
  teamName: string;
  opponent: string;
  /** yyyy-mm-dd */
  date: string;
  /** HH:MM[:SS] or null for an all-day event. */
  startTime: string | null;
  location: string | null;
  address?: string | null;
  homeAway: 'home' | 'away' | 'neutral' | null;
  notes: string | null;
  /** Game length used for DTEND when a start time is known. */
  durationMinutes?: number;
}

export interface IcsPractice {
  id: string;
  teamName: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  address?: string | null;
  notes: string | null;
}

/** One calendar event; games and practices both map onto this. */
export interface IcsEvent {
  uid: string;
  title: string;
  /** yyyy-mm-dd */
  date: string;
  /** HH:MM[:SS] or null for an all-day event. */
  startTime: string | null;
  /** HH:MM[:SS]; when missing or not after the start, `durationMinutes` after the start. */
  endTime?: string | null;
  durationMinutes: number;
  location: string | null;
  description: string | null;
}

export const DEFAULT_TIMEZONE = 'America/Chicago';

const esc = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const pad = (n: number) => String(n).padStart(2, '0');

const stamp = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

const hm = (t: string | null | undefined): [number, number] | null => {
  const m = /^(\d{2}):(\d{2})/.exec(t ?? '');
  return m ? [Number(m[1]), Number(m[2])] : null;
};

/** Offset of `tz` from UTC in minutes at a given instant (via Intl, no tz database needed). */
function offsetMinutes(utc: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(utc);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - utc.getTime()) / 60_000);
}

/** The instant at which the wall clock in `tz` reads `date` `hh:mm` (DST handled by a second pass). */
export function zonedToUtc(date: string, hh: number, mm: number, tz: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const guess = Date.UTC(y ?? 2000, (mo ?? 1) - 1, d ?? 1, hh, mm);
  let off = safeOffset(new Date(guess), tz);
  let utc = guess - off * 60_000;
  const off2 = safeOffset(new Date(utc), tz);
  if (off2 !== off) {
    off = off2;
    utc = guess - off * 60_000;
  }
  return new Date(utc);
}

function safeOffset(d: Date, tz: string): number {
  try {
    return offsetMinutes(d, tz);
  } catch {
    return offsetMinutes(d, DEFAULT_TIMEZONE);
  }
}

/** Is this an IANA timezone the runtime knows? */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Fold lines longer than 75 octets as the spec requires. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(rest.slice(0, 75));
    rest = ` ${rest.slice(75)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

function eventLines(e: IcsEvent, tz: string, now: Date): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}@mini-messis`, `DTSTAMP:${stamp(now)}`];
  const start = hm(e.startTime);
  if (start) {
    const startUtc = zonedToUtc(e.date, start[0], start[1], tz);
    const end = hm(e.endTime);
    let endUtc = end ? zonedToUtc(e.date, end[0], end[1], tz) : null;
    if (!endUtc || endUtc <= startUtc) endUtc = new Date(startUtc.getTime() + e.durationMinutes * 60_000);
    lines.push(`DTSTART:${stamp(startUtc)}`, `DTEND:${stamp(endUtc)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`);
  }
  lines.push(`SUMMARY:${esc(e.title)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  lines.push('END:VEVENT');
  return lines;
}

/** A whole calendar file: one VEVENT per event. */
export function buildIcsCalendar(
  events: readonly IcsEvent[],
  tz: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
  calendarName?: string,
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    "PRODID:-//Mini-Messi's//Coach//EN",
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  if (calendarName) lines.push(`X-WR-CALNAME:${esc(calendarName)}`, `X-WR-TIMEZONE:${tz}`);
  for (const e of events) lines.push(...eventLines(e, tz, now));
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

export function buildIcsEvent(e: IcsEvent, now: Date = new Date(), tz: string = DEFAULT_TIMEZONE): string {
  return buildIcsCalendar([e], tz, now);
}

/** "Field 3, Riverside Park — 120 River Rd" when both are known. */
const place = (location: string | null, address: string | null | undefined): string | null =>
  [location?.trim(), address?.trim()].filter(Boolean).join(' — ') || null;

export const gameEvent = (g: IcsGame): IcsEvent => ({
  uid: `game-${g.id}`,
  title: `${g.teamName} vs ${g.opponent}`,
  date: g.date,
  startTime: g.startTime,
  durationMinutes: g.durationMinutes ?? 90,
  location: place(g.location, g.address),
  description:
    [g.homeAway ? `${g.homeAway[0]?.toUpperCase()}${g.homeAway.slice(1)} game` : '', g.notes ?? '']
      .filter(Boolean)
      .join('\n') || null,
});

/** A practice: "<team> practice", ending at end_time or an hour after the start. */
export const practiceEvent = (p: IcsPractice): IcsEvent => ({
  uid: `practice-${p.id}`,
  title: `${p.teamName} practice`,
  date: p.date,
  startTime: p.startTime,
  endTime: p.endTime,
  durationMinutes: 60,
  location: place(p.location, p.address),
  description: p.notes,
});

export function buildIcs(g: IcsGame, now: Date = new Date(), tz: string = DEFAULT_TIMEZONE): string {
  return buildIcsEvent(gameEvent(g), now, tz);
}

export function buildPracticeIcs(
  p: IcsPractice,
  now: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): string {
  return buildIcsEvent(practiceEvent(p), now, tz);
}

/* ---------- delivery ---------- */

const isIOS = (): boolean =>
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/**
 * Hand an .ics to the device. Desktop and Android browsers download it. iOS (Safari and the
 * installed home-screen app) does not honour `download` for blobs; navigating to the blob shows
 * Safari's calendar preview with "Add All", which is what works from a PWA.
 */
export function deliverIcs(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const safeName = filename.replace(/[^\w.-]+/g, '-');
  if (isIOS()) {
    window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Trigger a download of the game's .ics in the browser. */
export function downloadIcs(g: IcsGame, tz: string = DEFAULT_TIMEZONE): void {
  deliverIcs(buildIcs(g, new Date(), tz), `${g.teamName}-vs-${g.opponent}-${g.date}.ics`);
}

export function downloadPracticeIcs(p: IcsPractice, tz: string = DEFAULT_TIMEZONE): void {
  deliverIcs(buildPracticeIcs(p, new Date(), tz), `${p.teamName}-practice-${p.date}.ics`);
}

/** Every upcoming game and practice in one file ("Add all to calendar"). */
export function downloadScheduleIcs(teamName: string, events: readonly IcsEvent[], tz: string): void {
  deliverIcs(buildIcsCalendar(events, tz, new Date(), `${teamName} schedule`), `${teamName}-schedule.ics`);
}
