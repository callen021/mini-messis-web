import { type Player } from '@/teams/api';

/** A sensible default name for the next season: the year after the current season's, or this year. */
export function defaultSeasonName(current: string | null | undefined, now = new Date()): string {
  const year = now.getFullYear();
  const m = /(\d{4})/.exec(current ?? '');
  const next = m ? Number(m[1]) + 1 : year;
  return `${Math.max(next, year)} season`;
}

/** The confirmation text for the roster review (D94). */
export function seasonSummary(
  name: string,
  returning: number,
  notReturning: readonly Pick<Player, 'first_name'>[],
  losing: string,
): string {
  const out = notReturning.length
    ? `${notReturning.length} not returning (${notReturning.map((p) => p.first_name).join(', ')}): removed from the roster, history kept. `
    : '';
  return `${returning} player${returning === 1 ? '' : 's'} returning. ${out}${losing ? `${losing} ` : ''}${name} starts with an empty schedule and zeroed stats; the lineup template is cleared. Everything else carries over, and past seasons stay under Stats.`;
}
