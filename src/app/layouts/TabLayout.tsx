import { Outlet, ScrollRestoration } from 'react-router';
import { Tabbar } from '@/components/Tabbar';
import { DEFAULT_TABS } from '../tabs';

/** Signed-in, team-selected shell: fixed tab bar + centered content column. */
export function TabLayout() {
  return (
    <>
      <Tabbar tabs={DEFAULT_TABS} />
      <main className="app-main">
        <Outlet />
      </main>
      <ScrollRestoration />
    </>
  );
}
