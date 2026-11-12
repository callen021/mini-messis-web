import { useEffect, useMemo } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { BoardButton } from '@/board/BoardButton';
import { SyncBanner } from '@/components/SyncBanner';
import { Tabbar } from '@/components/Tabbar';
import { useMyChildren, useTeamRealtime } from '@/lineups/api';
import { ProfileSync } from '@/settings/ProfileSync';
import { SPORTS } from '@/sports/definitions';
import { preloadFieldImage } from '@/sports/field';
import { useUIStore } from '@/lib/ui-store';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { TeamSwitcher } from '@/teams/TeamSwitcher';
import { homeTabLabel, tabsFor } from '../tabs';

/** Signed-in, team-selected shell: team switcher, content column, fixed bottom tab bar. */
export function TabLayout() {
  const { teamId, sport, role } = useCurrentTeam();
  const S = SPORTS[sport];
  useTeamRealtime(teamId);
  const view = useUIStore((s) => s.fieldView);
  useEffect(() => preloadFieldImage(sport, view), [sport, view]);
  const children = useMyChildren();
  const players = usePlayers(teamId);
  const mine = useMemo(() => {
    const ids = children.data ?? new Set<string>();
    return (players.data ?? []).filter((p) => ids.has(p.id));
  }, [children.data, players.data]);
  const tabs = useMemo(() => tabsFor(S, role, homeTabLabel(mine)), [S, role, mine]);
  return (
    <>
      <ProfileSync />
      <div className="statusbar-bg" aria-hidden="true" />
      <main className="app-main">
        <SyncBanner />
        <div className="topbar">
          <TeamSwitcher />
          <BoardButton />
        </div>
        <Outlet />
      </main>
      <Tabbar tabs={tabs} />
      <ScrollRestoration />
    </>
  );
}
