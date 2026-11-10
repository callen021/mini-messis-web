import { lazy, Suspense } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AuthRoot } from '@/auth/AuthProvider';
import { PublicOnly, RequireAuth } from '@/auth/guards';
import { AdminLayout } from '@/admin/AdminLayout';
import { AdminPage } from '@/admin/AdminPage';
import { AdminTeamPage } from '@/admin/AdminTeamPage';
import { ResetPage } from '@/auth/pages/ResetPage';
import { SignInPage } from '@/auth/pages/SignInPage';
import { SignUpPage } from '@/auth/pages/SignUpPage';
import { ProfilePage } from '@/settings/ProfilePage';
import { SettingsPage } from '@/settings/SettingsPage';
import { CreateTeamPage } from '@/teams/pages/CreateTeamPage';
import { InvitePage } from '@/teams/pages/InvitePage';
import { JoinPage } from '@/teams/pages/JoinPage';
import { MembersPage } from '@/teams/pages/MembersPage';
import { PendingPage } from '@/teams/pages/PendingPage';
import { WelcomePage } from '@/teams/pages/WelcomePage';
import { RequireTeam } from '@/teams/TeamContext';
import { BattingOrderPage } from '@/games/BattingOrderPage';
import { GamePage } from '@/games/GamePage';
import { PracticePage } from '@/games/PracticePage';
import { GamesPage } from '@/games/GamesPage';
import { LineupPage } from '@/games/LineupPage';
import { StatsPage } from '@/games/StatsPage';
import { HomePage } from '@/home/HomePage';
import { FieldPage } from '@/lineups/FieldPage';
import { PlayerPage } from '@/skills/PlayerPage';
import { SkillsSettingsPage } from '@/skills/SkillsSettingsPage';
import { SkillTestPage } from '@/skills/SkillTestPage';
import { TeamSetupPage } from '@/settings/TeamSetupPage';
import { TeamPage } from '@/roster/TeamPage';
import { AuthLayout } from './layouts/AuthLayout';
import { TabLayout } from './layouts/TabLayout';
import { NotFound } from './pages/NotFound';
import { RouteError } from './pages/RouteError';
import { LandingRedirect } from './pages/LandingRedirect';
import { TabError } from './pages/TabError';

const base = import.meta.env.BASE_URL.replace(/\/+$/, '');

const devRoutesEnabled = import.meta.env.DEV || import.meta.env.VITE_DEV_ROUTES === 'true';

/** Dev-only routes. The dynamic import lives inside the dead branch so production builds drop the chunk. */
function makeDevRoutes(): RouteObject[] {
  if (!devRoutesEnabled) return [];
  const ComponentsPage = lazy(() => import('@/dev/ComponentsPage'));
  const FieldPage = lazy(() => import('@/dev/FieldPage'));
  return [
    {
      path: '/dev/components',
      element: (
        <Suspense fallback={null}>
          <ComponentsPage />
        </Suspense>
      ),
    },
    {
      path: '/dev/field',
      element: (
        <Suspense fallback={null}>
          <FieldPage />
        </Suspense>
      ),
    },
  ];
}
const devRoutes = makeDevRoutes();

export const routes: RouteObject[] = [
  {
    element: <AuthRoot />,
    errorElement: <RouteError />,
    children: [
      // signed-out only
      {
        element: <PublicOnly />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: '/signin', element: <SignInPage /> },
              { path: '/signup', element: <SignUpPage /> },
            ],
          },
        ],
      },
      // reachable either way: the password-reset email lands here, and so does the coach's
      // invite link (a visitor creates their account on it; a member goes straight to the picker)
      {
        element: <AuthLayout />,
        children: [
          { path: '/reset', element: <ResetPage /> },
          { path: '/join/:code', element: <InvitePage /> },
        ],
      },
      // signed in
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: '/welcome', element: <WelcomePage /> },
              { path: '/join', element: <JoinPage /> },
              { path: '/create-team', element: <CreateTeamPage /> },
              { path: '/pending', element: <PendingPage /> },
            ],
          },
          // platform admin console (no team context)
          {
            element: <AdminLayout />,
            children: [
              { path: '/admin', element: <AdminPage /> },
              { path: '/admin/teams/:teamId', element: <AdminTeamPage /> },
            ],
          },
          // signed in with a team
          {
            element: <RequireTeam />,
            children: [
              {
                element: <TabLayout />,
                children: [
                  {
                    // a page that throws shows TabError inside the shell; the tab bar keeps working
                    errorElement: <TabError />,
                    children: [
                      { index: true, element: <LandingRedirect /> },
                      { path: '/home', element: <HomePage /> },
                      { path: '/field', element: <FieldPage /> },
                      { path: '/lineup', element: <LineupPage /> },
                      { path: '/lineup/order', element: <BattingOrderPage /> },
                      { path: '/team', element: <TeamPage /> },
                      { path: '/games', element: <GamesPage /> },
                      { path: '/games/:gameId', element: <GamePage /> },
                      { path: '/practices/:practiceId', element: <PracticePage /> },
                      { path: '/stats', element: <StatsPage /> },
                      { path: '/players/:playerId', element: <PlayerPage /> },
                      { path: '/players/:playerId/skills/:testId', element: <SkillTestPage /> },
                      { path: '/settings', element: <SettingsPage /> },
                      { path: '/settings/members', element: <MembersPage /> },
                      { path: '/settings/team', element: <TeamSetupPage /> },
                      { path: '/settings/skills', element: <SkillsSettingsPage /> },
                      { path: '/profile', element: <ProfilePage /> },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  ...devRoutes,
  { path: '*', element: <NotFound /> },
];

export const router = createBrowserRouter(routes, base ? { basename: base } : undefined);
