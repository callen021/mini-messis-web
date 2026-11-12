import { type SportDefinition } from '@/sports/types';
import { type ScoreEvent } from './api';
import { eventTag, type NameLookup } from './names';

/** Double-tap guard shared by every score button (legacy `lastGoalAt`, 400 ms). */
let lastScoreAt = 0;
export function scoreTapAllowed(now = Date.now()): boolean {
  if (now - lastScoreAt < 400) return false;
  lastScoreAt = now;
  return true;
}
/** Tests only: forget the last tap. */
export function resetScoreTapGuard(): void {
  lastScoreAt = 0;
}

/** Short description for toasts and the undo row: "Q2 · Nolan" / "Inn 3 · Bears run". */
export function describeEvent(
  S: SportDefinition,
  periodCount: number,
  opponent: string,
  ev: ScoreEvent,
  names: NameLookup,
): string {
  const name = S.periodName(periodCount);
  const tag = eventTag(name, ev);
  const kind = S.scoring.events.find((k) => k.type === ev.event_type);
  const noun = kind?.noun ?? ev.event_type.replace(/_/g, ' ');
  const parts = (...xs: string[]) => xs.filter(Boolean).join(' · ');
  if (ev.side === 'them') return parts(tag, `${opponent || 'Opponent'} ${noun}`);
  const who = names.name(ev.scorer_player_id) || 'Unknown';
  return S.scoring.panel === 'points' ? parts(tag, who, noun) : parts(tag, who);
}

/** What one logged event is called in copy: 'goal', 'run', or 'score' for point-based sports. */
export function scoreNoun(S: SportDefinition): string {
  return S.scoring.panel === 'points' ? 'score' : (S.scoring.events[0]?.noun ?? 'score');
}
