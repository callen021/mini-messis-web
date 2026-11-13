/**
 * The pre-start lineup check (D109): before a clock game starts, the coach is warned about open
 * spots in the starting lineup and about placed players who are marked out (the coach flag or a
 * reply for that game), and chooses "Fix lineup" or "Start anyway". Pure.
 */
import { type Formation } from '@/sports/types';

export interface StartIssues {
  /** Position codes of the empty starting spots. */
  open: string[];
  /** Placed players who are marked out, with who said so. */
  outPlaced: { name: string; byParent: boolean }[];
}

export function startIssues(
  formation: Formation,
  slots: readonly string[],
  players: readonly { id: string; first_name: string; is_available: boolean }[],
  outByReply: ReadonlySet<string>,
  byParent: ReadonlySet<string>,
): StartIssues {
  const byId = new Map(players.map((p) => [p.id, p]));
  const open: string[] = [];
  const outPlaced: StartIssues['outPlaced'] = [];
  formation.positions.forEach((pos, i) => {
    const id = slots[i] ?? '';
    const p = id ? byId.get(id) : undefined;
    if (!p) {
      open.push(pos.code);
      return;
    }
    if (!p.is_available || outByReply.has(id))
      outPlaced.push({ name: p.first_name, byParent: byParent.has(id) });
  });
  return { open, outPlaced };
}

export const hasIssues = (i: StartIssues): boolean => i.open.length > 0 || i.outPlaced.length > 0;

/** "2 open spots (LM, RFB). Marked out but still placed: Nolan (parent), Jack." */
export function startWarning(i: StartIssues): string {
  const parts: string[] = [];
  if (i.open.length)
    parts.push(`${i.open.length} open spot${i.open.length === 1 ? '' : 's'} (${i.open.join(', ')}).`);
  if (i.outPlaced.length)
    parts.push(
      `Marked out but still placed: ${i.outPlaced.map((o) => `${o.name}${o.byParent ? ' (parent)' : ''}`).join(', ')}.`,
    );
  return parts.join(' ');
}
