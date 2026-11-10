import { FieldIcon, GamesIcon, LineupIcon, StarIcon, StatsIcon, TeamIcon } from '@/components/icons';
import { type TabItem } from '@/components/Tabbar';
import { type SportDefinition } from '@/sports/types';
import { type Player } from '@/teams/api';

/** At most five tabs fit a phone; a parent's child tab takes the first slot (D53). */
export const MAX_TABS = 5;

/** Label of the parent's first tab: the child's first name, "My players" for several, "Home" for none. */
export function homeTabLabel(children: readonly Pick<Player, 'first_name'>[]): string {
  if (children.length === 1) return children[0]?.first_name ?? 'Home';
  if (children.length > 1) return 'My players';
  return 'Home';
}

/**
 * The tabs for a role. Staff: Field, [Lineup], Team, Schedule, Stats. Parents: their child first,
 * then the same, except that when a sport would need six tabs the Lineup tab folds into the
 * Field tab as a segment (baseball).
 */
export function tabsFor(
  S: SportDefinition,
  role: 'coach' | 'assistant' | 'parent',
  homeLabel: string,
): TabItem[] {
  const core: TabItem[] = [
    { to: '/field', label: S.field, icon: <FieldIcon /> },
    ...(S.lineup ? [{ to: '/lineup', label: 'Lineup', icon: <LineupIcon /> }] : []),
    { to: '/team', label: 'Team', icon: <TeamIcon /> },
    { to: '/games', label: 'Schedule', icon: <GamesIcon /> },
    { to: '/stats', label: 'Stats', icon: <StatsIcon /> },
  ];
  if (role !== 'parent') return core;
  const withHome: TabItem[] = [{ to: '/home', label: homeLabel, icon: <StarIcon /> }, ...core];
  return withHome.length > MAX_TABS ? withHome.filter((t) => t.to !== '/lineup') : withHome;
}
