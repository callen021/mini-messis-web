/** Split board text into plain and link segments (D58). Text only: http(s):// and www. links. Pure. */

export type Segment = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string };

const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

export function linkify(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const idx = m.index ?? 0;
    let raw = m[0];
    // trailing punctuation belongs to the sentence, not the link
    const trailing = /[.,;:!?)]+$/.exec(raw)?.[0] ?? '';
    raw = raw.slice(0, raw.length - trailing.length);
    if (idx > last) out.push({ kind: 'text', text: text.slice(last, idx) });
    out.push({ kind: 'link', text: raw, href: raw.startsWith('www.') ? `https://${raw}` : raw });
    last = idx + raw.length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** "2 min ago", "3 h ago", "yesterday", "Nov 3". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.round((now.getTime() - t) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
