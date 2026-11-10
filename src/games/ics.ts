/** Minimal iCalendar export for one game or practice (RFC 5545). Pure; the download happens in the caller. */

export interface IcsGame {
  id: string;
  teamName: string;
  opponent: string;
  /** yyyy-mm-dd */
  date: string;
  /** HH:MM[:SS] or null for an all-day event. */
  startTime: string | null;
  location: string | null;
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

const esc = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const pad = (n: number) => String(n).padStart(2, '0');

const stamp = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

const local = (d: Date): string =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

const hm = (t: string | null | undefined): [number, number] | null => {
  const m = /^(\d{2}):(\d{2})/.exec(t ?? '');
  return m ? [Number(m[1]), Number(m[2])] : null;
};

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

export function buildIcsEvent(e: IcsEvent, now: Date = new Date()): string {
  const dateCompact = e.date.replace(/-/g, '');
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    "PRODID:-//Mini-Messi's//Coach//EN",
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}@mini-messis`,
    `DTSTAMP:${stamp(now)}`,
  ];
  const start = hm(e.startTime);
  if (start) {
    // Floating local time: the event happens at the field's wall-clock time wherever it is read.
    const [y, mo, d] = e.date.split('-').map(Number);
    const startDate = new Date(y ?? 2000, (mo ?? 1) - 1, d ?? 1, start[0], start[1]);
    const end = hm(e.endTime);
    let endDate = end ? new Date(y ?? 2000, (mo ?? 1) - 1, d ?? 1, end[0], end[1]) : null;
    if (!endDate || endDate <= startDate)
      endDate = new Date(y ?? 2000, (mo ?? 1) - 1, d ?? 1, start[0], start[1] + e.durationMinutes);
    lines.push(`DTSTART:${local(startDate)}`, `DTEND:${local(endDate)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${dateCompact}`);
  }
  lines.push(`SUMMARY:${esc(e.title)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

export const gameEvent = (g: IcsGame): IcsEvent => ({
  uid: `game-${g.id}`,
  title: `${g.teamName} vs ${g.opponent}`,
  date: g.date,
  startTime: g.startTime,
  durationMinutes: g.durationMinutes ?? 90,
  location: g.location,
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
  location: p.location,
  description: p.notes,
});

export function buildIcs(g: IcsGame, now: Date = new Date()): string {
  return buildIcsEvent(gameEvent(g), now);
}

export function buildPracticeIcs(p: IcsPractice, now: Date = new Date()): string {
  return buildIcsEvent(practiceEvent(p), now);
}

function download(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/[^\w.-]+/g, '-');
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Trigger a download of the game's .ics in the browser. */
export function downloadIcs(g: IcsGame): void {
  download(buildIcs(g), `${g.teamName}-vs-${g.opponent}-${g.date}.ics`);
}

export function downloadPracticeIcs(p: IcsPractice): void {
  download(buildPracticeIcs(p), `${p.teamName}-practice-${p.date}.ics`);
}
