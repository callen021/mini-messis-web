import { FieldIcon, GamesIcon, StatsIcon, TeamIcon } from '@/components/icons';
import { type TabItem } from '@/components/Tabbar';

/** Tabs for soccer/lacrosse/basketball. Baseball adds Lineup (Phase 5); the Field label follows the sport. */
export const DEFAULT_TABS: readonly TabItem[] = [
  { to: '/field', label: 'Field', icon: <FieldIcon /> },
  { to: '/team', label: 'Team', icon: <TeamIcon /> },
  { to: '/games', label: 'Games', icon: <GamesIcon /> },
  { to: '/stats', label: 'Stats', icon: <StatsIcon /> },
];
