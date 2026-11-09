/** Minimal iCalendar export for one game (RFC 5545). Pure; the download happens in the caller. */

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

const esc = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const pad = (n: number) => String(n).padStart(2, '0');

const stamp = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

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

export function buildIcs(g: IcsGame, now: Date = new Date()): string {
  const title = `${g.teamName} vs ${g.opponent}`;
  const dateCompact = g.date.replace(/-/g, '');
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    "PRODID:-//Mini-Messi's//Coach//EN",
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:game-${g.id}@mini-messis`,
    `DTSTAMP:${stamp(now)}`,
  ];
  const m = /^(\d{2}):(\d{2})/.exec(g.startTime ?? '');
  if (m) {
    // Floating local time: the game happens at the field's wall-clock time wherever it is read.
    const start = `${dateCompact}T${m[1]}${m[2]}00`;
    const [y, mo, d] = g.date.split('-').map(Number);
    const endDate = new Date(
      y ?? 2000,
      (mo ?? 1) - 1,
      d ?? 1,
      Number(m[1]),
      Number(m[2]) + (g.durationMinutes ?? 90),
    );
    const end = `${endDate.getFullYear()}${pad(endDate.getMonth() + 1)}${pad(endDate.getDate())}T${pad(endDate.getHours())}${pad(endDate.getMinutes())}00`;
    lines.push(`DTSTART:${start}`, `DTEND:${end}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${dateCompact}`);
  }
  lines.push(`SUMMARY:${esc(title)}`);
  if (g.location) lines.push(`LOCATION:${esc(g.location)}`);
  const desc = [g.homeAway ? `${g.homeAway[0]?.toUpperCase()}${g.homeAway.slice(1)} game` : '', g.notes ?? '']
    .filter(Boolean)
    .join('\n');
  if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Trigger a download of the .ics in the browser. */
export function downloadIcs(g: IcsGame): void {
  const blob = new Blob([buildIcs(g)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${g.teamName}-vs-${g.opponent}-${g.date}.ics`.replace(/[^\w.-]+/g, '-');
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
