import { type SportDefinition } from '@/sports/types';
import { type ScoreEvent } from './api';
import { type NameLookup } from './names';

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
  const tag = name === 'Inning' ? `Inn ${ev.period_index + 1}` : `${name[0] ?? ''}${ev.period_index + 1}`;
  const kind = S.scoring.events.find((k) => k.type === ev.event_type);
  const noun = kind?.noun ?? ev.event_type.replace(/_/g, ' ');
  if (ev.side === 'them') return `${tag} · ${opponent || 'Opponent'} ${noun}`;
  const who = names.name(ev.scorer_player_id) || 'Unknown';
  return S.scoring.panel === 'points' ? `${tag} · ${who} · ${noun}` : `${tag} · ${who}`;
}
