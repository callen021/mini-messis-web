import { useEffect, useMemo, useRef } from 'react';
import { Outlet } from 'react-router';
import { BoardButton } from '@/board/BoardButton';
import { SyncBanner } from '@/components/SyncBanner';
import { Tabbar } from '@/components/Tabbar';
import { useMyKids } from '@/home/useMyKids';
import { useTeamRealtime } from '@/lineups/api';
import { ProfileSync } from '@/settings/ProfileSync';
import { SPORTS } from '@/sports/definitions';
import { preloadFieldImage } from '@/sports/field';
import { useUIStore } from '@/lib/ui-store';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useMainScroll } from '../useMainScroll';
import { TeamSwitcher } from '@/teams/TeamSwitcher';
import { homeTabLabel, tabsFor } from '../tabs';

/** Signed-in, team-selected shell: team switcher, content column, fixed bottom tab bar. */
export function TabLayout() {
  const { teamId, sport, role } = useCurrentTeam();
  const S = SPORTS[sport];
  useTeamRealtime(teamId);
  const view = useUIStore((s) => s.fieldView);
  useEffect(() => preloadFieldImage(sport, view), [sport, view]);
  // the first tab is the selected child's, for a parent and for a coach with a linked child (D135)
  const { child } = useMyKids();
  const tabs = useMemo(() => tabsFor(S, role, homeTabLabel(child), !!child), [S, role, child]);
  // main is the scroller (D110): restore its position on back, start new pages at the top
  const mainRef = useRef<HTMLElement>(null);
  useMainScroll(mainRef);
  return (
    <>
      <ProfileSync />
      <div className="statusbar-bg" aria-hidden="true" />
      <main className="app-main" ref={mainRef}>
        <SyncBanner />
        <div className="topbar">
          <TeamSwitcher />
          <BoardButton />
        </div>
        <Outlet />
      </main>
      <Tabbar tabs={tabs} />
    </>
  );
}
