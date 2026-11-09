/** Date/time formatting shared by the games screens (ported from the legacy `fmtDate`). */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local date from an ISO `yyyy-mm-dd` string, or null when malformed. */
export function parseISODate(s: string | null | undefined): Date | null {
  const m = ISO_DATE.exec(s ?? '');
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** "Mar 4" or, long, "Sat, Mar 4, 2026". */
export function fmtDate(s: string | null | undefined, long = false): string {
  const d = parseISODate(s);
  if (!d) return s ?? '';
  return d.toLocaleDateString(
    undefined,
    long
      ? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric' },
  );
}

/** "9:30 AM" from a Postgres `time` ("09:30:00"). */
export function fmtTime(t: string | null | undefined): string {
  const m = /^(\d{2}):(\d{2})/.exec(t ?? '');
  if (!m) return '';
  const d = new Date(2000, 0, 1, Number(m[1]), Number(m[2]));
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Today as `yyyy-mm-dd` in local time. */
export function todayISO(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

export const HOME_AWAY_LABEL: Record<'home' | 'away' | 'neutral', string> = {
  home: 'Home',
  away: 'Away',
  neutral: 'Neutral',
};

/** Schedule line for a game row: date, time, location, home/away. */
export function scheduleLine(
  g: {
    game_date: string;
    start_time: string | null;
    location: string | null;
    home_away: 'home' | 'away' | 'neutral' | null;
  },
  long = false,
): string {
  return [
    fmtDate(g.game_date, long),
    fmtTime(g.start_time),
    g.location ?? '',
    g.home_away ? HOME_AWAY_LABEL[g.home_away] : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
