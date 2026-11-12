import { periodPlural } from '@/sports/definitions';
import { type SportDefinition } from '@/sports/types';

/** "0 quarters", "1 half", "2 halves" (D82): the caption under a bench jersey in period mode. */
export function periodsPlayed(S: SportDefinition, periodCount: number, n: number): string {
  return `${n} ${n === 1 ? S.periodName(periodCount).toLowerCase() : periodPlural(S, periodCount)}`;
}
