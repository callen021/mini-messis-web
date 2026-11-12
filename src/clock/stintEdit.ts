import { type Stint, formatClock } from './clock';

/* =====================================================================
   CORRECTIONS AFTER A GAME (D67): parse "m:ss", and check a stint the way the server does —
   it ends after it starts, stays inside its period, and never overlaps the same player's
   other stints — so the sheet can say what is wrong before the call.
   ===================================================================== */

/** "12:30" → 750; "12" → 720 (whole minutes); null when it is not a time. */
export function parseClock(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = /^(\d{1,3})(?::([0-5]?\d))?$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2] ?? 0);
}

export interface StintDraft {
  id: string | null;
  playerId: string;
  period: number;
  start: number;
  end: number;
}

/** Why a draft cannot be saved, or null when it can. */
export function stintProblem(
  draft: StintDraft,
  others: readonly Stint[],
  periodLengths: readonly number[],
): string | null {
  if (draft.start < 0 || draft.end <= draft.start) return 'A stint must end after it starts.';
  const len = periodLengths[draft.period];
  if (len === undefined) return 'That period has no recorded length.';
  if (draft.end > len) return `A stint must stay inside the period (${formatClock(len)} long).`;
  const clash = others.find(
    (s) =>
      s.id !== draft.id &&
      s.player_id === draft.playerId &&
      s.period_index === draft.period &&
      s.clock_start < draft.end &&
      (s.clock_end ?? len) > draft.start,
  );
  if (clash) return `That overlaps ${formatClock(clash.clock_start)}–${formatClock(clash.clock_end ?? len)}.`;
  return null;
}
