/* =====================================================================
   DUPLICATE CONTACTS (D116). Two contact rows on one player that look like the same person: the
   same phone (digits only, a leading +1 ignored), the same email (lowercased, trimmed) or the
   same name. The server attaches a joining account to a phone or email match on its own; a
   name-only match is only ever a prompt for the coaches, and any pair can be merged by hand.
   ===================================================================== */

import { type Person } from './api';

export type DuplicateMatch = 'phone' | 'email' | 'name';

export interface DuplicatePair {
  /** The row that survives a merge: the coach's entry (no account) when there is one. */
  keep: Person;
  drop: Person;
  match: DuplicateMatch;
}

export function phoneKey(phone: string | null | undefined): string | null {
  const d = (phone ?? '').replace(/\D/g, '');
  if (!d) return null;
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}
export const emailKey = (email: string | null | undefined): string | null =>
  (email ?? '').trim().toLowerCase() || null;
export const nameKey = (name: string | null | undefined): string | null =>
  (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ') || null;

function matchOf(a: Person, b: Person): DuplicateMatch | null {
  if (a.user_id && b.user_id && a.user_id !== b.user_id) return null; // two different accounts
  const pa = phoneKey(a.phone);
  if (pa && pa === phoneKey(b.phone)) return 'phone';
  const ea = emailKey(a.email);
  if (ea && ea === emailKey(b.email)) return 'email';
  const na = nameKey(a.name);
  if (na && na === nameKey(b.name)) return 'name';
  return null;
}

/** Every pair of contact rows (not bare accounts) that look like the same person. */
export function findDuplicates(people: readonly Person[]): DuplicatePair[] {
  const rows = people.filter((p) => !!p.contact_id);
  const out: DuplicatePair[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i] as Person;
      const b = rows[j] as Person;
      const match = matchOf(a, b);
      if (!match) continue;
      // keep the coach's entry (no account) so its label and share setting survive
      const keep = a.user_id && !b.user_id ? b : a;
      out.push({ keep, drop: keep === a ? b : a, match });
    }
  }
  return out;
}

export const MATCH_TEXT: Record<DuplicateMatch, string> = {
  phone: 'the same phone number',
  email: 'the same email',
  name: 'the same name',
};
