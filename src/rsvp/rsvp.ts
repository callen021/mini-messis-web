/**
 * Pure RSVP rules (D107): which game the lineup pages plan for, who is effectively available for
 * an event, the schedule-row count, and the parent lock. No React, no Supabase.
 */
import { type Tables } from '@/lib/database.types';

export type RsvpStatus = 'going' | 'out' | 'none';
export type RsvpRow = Tables<'event_rsvps'>;

/** A game or a practice, by id. */
export type EventRef = { kind: 'game'; id: string } | { kind: 'practice'; id: string };

export const eventMatches = (r: Pick<RsvpRow, 'game_id' | 'practice_id'>, ev: EventRef): boolean =>
  ev.kind === 'game' ? r.game_id === ev.id : r.practice_id === ev.id;

/** The replies for one event, by player id. */
export function repliesFor(rows: readonly RsvpRow[], ev: EventRef | null): Map<string, RsvpRow> {
  const m = new Map<string, RsvpRow>();
  if (!ev) return m;
  for (const r of rows) if (eventMatches(r, ev)) m.set(r.player_id, r);
  return m;
}

export const statusOf = (replies: ReadonlyMap<string, RsvpRow>, playerId: string): RsvpStatus =>
  replies.get(playerId)?.status ?? 'none';

/** Player ids whose reply for the event says out. */
export function outByReply(replies: ReadonlyMap<string, RsvpRow>): Set<string> {
  const s = new Set<string>();
  for (const [id, r] of replies) if (r.status === 'out') s.add(id);
  return s;
}

interface PlannableGame {
  id: string;
  game_date: string;
  start_time: string | null;
  status: 'upcoming' | 'live' | 'done';
}

/**
 * The game the Field, the rotation views and the template plan are for: the live game, else the
 * first upcoming game dated today or later. An upcoming game dated before today was never
 * started, and its replies must not stick to the plan (D107).
 */
export function plannedGame<G extends PlannableGame>(games: readonly G[], today: string): G | null {
  const live = games.find((g) => g.status === 'live');
  if (live) return live;
  return (
    [...games]
      .filter((g) => g.status === 'upcoming' && g.game_date >= today)
      .sort(
        (a, b) =>
          a.game_date.localeCompare(b.game_date) || (a.start_time ?? '').localeCompare(b.start_time ?? ''),
      )[0] ?? null
  );
}

interface Countable {
  id: string;
  is_available: boolean;
  archived_at: string | null;
}

/**
 * The schedule-row count: "in" is every player on the roster who is effectively available for
 * the event (not out by reply and not flagged out by the coach), so no reply counts as in;
 * "out" is everyone else.
 */
export function rsvpCount(
  players: readonly Countable[],
  replies: ReadonlyMap<string, RsvpRow>,
): { in: number; out: number } {
  let inN = 0;
  let outN = 0;
  for (const p of players) {
    if (p.archived_at) continue;
    if (p.is_available && statusOf(replies, p.id) !== 'out') inN++;
    else outN++;
  }
  return { in: inN, out: outN };
}

export const countText = (c: { in: number; out: number }): string => `${c.in} in · ${c.out} out`;

/** A reply is "parent-set" for the indicator on the Field and the rotation views. */
export const byParent = (r: RsvpRow | undefined): boolean => !!r && r.set_by_role === 'parent';

/**
 * Parents reply until the game is started; for a practice, until its date and start time have
 * passed (`now` is the device clock; the server checks the team's timezone).
 */
export function parentLocked(
  ev:
    | { kind: 'game'; status: 'upcoming' | 'live' | 'done' }
    | { kind: 'practice'; status: 'scheduled' | 'cancelled'; date: string; time: string | null },
  now: Date,
): boolean {
  if (ev.kind === 'game') return ev.status !== 'upcoming';
  if (ev.status === 'cancelled') return true;
  const [y, m, d] = ev.date.split('-').map(Number);
  const [hh, mm] = (ev.time ?? '23:59').split(':').map(Number);
  const start = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, hh ?? 23, mm ?? 59, ev.time ? 0 : 59);
  return now >= start;
}

/** Players a reply marks out for the event, split by who said so (the Field's indicators). */
export function outSplit(replies: ReadonlyMap<string, RsvpRow>): {
  out: Set<string>;
  byParent: Set<string>;
} {
  const out = new Set<string>();
  const byParent = new Set<string>();
  for (const [id, r] of replies)
    if (r.status === 'out') {
      out.add(id);
      if (r.set_by_role === 'parent') byParent.add(id);
    }
  return { out, byParent };
}

const list = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * The Field's note when players marked out by a reply still hold a spot: who, and whether a
 * parent said so. `vs` is the opponent, when the planned game is known.
 */
export function heldOutNote(held: readonly { name: string; byParent: boolean }[], vs: string | null): string {
  if (!held.length) return '';
  const where = vs ? ` vs ${vs}` : '';
  const parents = held.filter((h) => h.byParent);
  if (parents.length === held.length)
    return `A parent says ${list(held.map((h) => h.name))} can’t make it${where}.`;
  if (!parents.length)
    return `${list(held.map((h) => h.name))} ${held.length > 1 ? 'are' : 'is'} marked out${where} on the attendance list.`;
  return `Marked out${where}: ${held.map((h) => `${h.name}${h.byParent ? ' (by a parent)' : ''}`).join(', ')}.`;
}

/** "Out: Nolan (parent), Teddy" for the bench caption; undefined when nobody is out. */
export function outCaption(
  players: readonly { id: string; first_name: string; is_available: boolean }[],
  out: ReadonlySet<string>,
  byParent: ReadonlySet<string>,
): string | undefined {
  const names = players
    .filter((p) => !p.is_available || out.has(p.id))
    .map((p) => `${p.first_name}${byParent.has(p.id) ? ' (parent)' : ''}`);
  return names.length ? `Out: ${names.join(', ')}` : undefined;
}

/** "Going" / "Can't make it" wording shared by the buttons, the marks and the attendance lists. */
export const RSVP_LABEL: Record<RsvpStatus, string> = {
  going: 'Going',
  out: 'Can’t make it',
  none: 'No reply',
};
