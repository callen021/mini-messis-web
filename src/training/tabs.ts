import { LIBRARY_SPORTS } from '@/library/types';

export type TrainingTab = 'drills' | 'tests' | 'library';

export const TAB_LABEL: Record<TrainingTab, string> = {
  drills: 'Daily Drills',
  tests: 'Skill Tests',
  library: 'Library',
};

/**
 * The sections of the Training tab for this viewer (D135). Skill Tests exist for every sport;
 * Daily Drills and the Library only where the sport has them, and Daily Drills only for a child
 * whose link a coach confirmed.
 */
export function trainingTabs(sport: string, hasConfirmedChild: boolean): TrainingTab[] {
  const tabs: TrainingTab[] = [];
  if (sport === 'soccer' && hasConfirmedChild) tabs.push('drills');
  tabs.push('tests');
  if (LIBRARY_SPORTS.includes(sport)) tabs.push('library');
  return tabs;
}
