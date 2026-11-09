import { Outlet, ScrollRestoration } from 'react-router';
import { FieldIcon, GamesIcon, LineupIcon, StatsIcon, TeamIcon } from '@/components/icons';
import { Tabbar, type TabItem } from '@/components/Tabbar';
import { ProfileSync } from '@/settings/ProfileSync';
import { SPORTS } from '@/sports/definitions';
import { useCurrentTeam } from '@/teams/TeamContext';
import { TeamSwitcher } from '@/teams/TeamSwitcher';

/** Signed-in, team-selected shell: team switcher, content column, fixed bottom tab bar. */
export function TabLayout() {
  const { sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const tabs: TabItem[] = [
    { to: '/field', label: S.field, icon: <FieldIcon /> },
    ...(S.lineup ? [{ to: '/lineup', label: 'Lineup', icon: <LineupIcon /> }] : []),
    { to: '/team', label: 'Team', icon: <TeamIcon /> },
    { to: '/games', label: 'Games', icon: <GamesIcon /> },
    { to: '/stats', label: 'Stats', icon: <StatsIcon /> },
  ];
  return (
    <>
      <ProfileSync />
      <main className="app-main">
        <TeamSwitcher />
        <Outlet />
      </main>
      <Tabbar tabs={tabs} />
      <ScrollRestoration />
    </>
  );
}
