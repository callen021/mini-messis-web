import { FieldIcon, GamesIcon, LineupIcon, StarIcon, TeamIcon, TrainingIcon } from '@/components/icons';
import { type TabItem } from '@/components/Tabbar';
import { type SportDefinition } from '@/sports/types';
import { type Player } from '@/teams/api';

/** At most five tabs fit a phone; a child's tab takes the first slot (D53). */
export const MAX_TABS = 5;

/** Label of the first tab: the selected child's first name, "Home" for a parent with no child yet. */
export function homeTabLabel(child: Pick<Player, 'first_name'> | null): string {
  return child?.first_name ?? 'Home';
}

/**
 * Whether the Lineup tab folds into the Field tab as a "Batting order" switch: a sport with a
 * Lineup tab would need six tabs once the child's tab is there (baseball, softball).
 */
export function foldsLineup(S: SportDefinition, role: 'coach' | 'assistant' | 'parent', hasChild: boolean) {
  return !!S.lineup && (role === 'parent' || hasChild);
}

/**
 * The tabs for a role (D135). Everyone: Field, [Lineup], Team, Schedule, Training. A parent, and a
 * coach or assistant with a linked child on the team, get the child's tab first; when that would
 * make six, the Lineup tab folds into the Field tab.
 */
export function tabsFor(
  S: SportDefinition,
  role: 'coach' | 'assistant' | 'parent',
  homeLabel: string,
  hasChild = false,
): TabItem[] {
  const core: TabItem[] = [
    { to: '/field', label: S.field, icon: <FieldIcon /> },
    ...(S.lineup ? [{ to: '/lineup', label: 'Lineup', icon: <LineupIcon /> }] : []),
    { to: '/team', label: 'Team', icon: <TeamIcon /> },
    { to: '/games', label: 'Schedule', icon: <GamesIcon /> },
    // the Library's drill and game pages keep their /library addresses but belong to Training (D136)
    { to: '/training', label: 'Training', icon: <TrainingIcon />, also: ['/library'] },
  ];
  if (role !== 'parent' && !hasChild) return core;
  const withHome: TabItem[] = [{ to: '/home', label: homeLabel, icon: <StarIcon /> }, ...core];
  return withHome.length > MAX_TABS ? withHome.filter((t) => t.to !== '/lineup') : withHome;
}
