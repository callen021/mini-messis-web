import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { AuthRoot } from '@/auth/AuthProvider';
import { PublicOnly, RequireAuth } from '@/auth/guards';
import { ResetPage } from '@/auth/pages/ResetPage';
import { SignInPage } from '@/auth/pages/SignInPage';
import { SignUpPage } from '@/auth/pages/SignUpPage';
import { VerifyPage } from '@/auth/pages/VerifyPage';
import { ProfilePage } from '@/settings/ProfilePage';
import { SettingsPage } from '@/settings/SettingsPage';
import { CreateTeamPage } from '@/teams/pages/CreateTeamPage';
import { JoinPage } from '@/teams/pages/JoinPage';
import { MembersPage } from '@/teams/pages/MembersPage';
import { PendingPage } from '@/teams/pages/PendingPage';
import { WelcomePage } from '@/teams/pages/WelcomePage';
import { RequireTeam } from '@/teams/TeamContext';
import { AuthLayout } from './layouts/AuthLayout';
import { TabLayout } from './layouts/TabLayout';
import { NotFound } from './pages/NotFound';
import { Placeholder } from './pages/Placeholder';
import { RouteError } from './pages/RouteError';

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
      // reachable either way (email links land here)
      {
        element: <AuthLayout />,
        children: [
          { path: '/verify', element: <VerifyPage /> },
          { path: '/reset', element: <ResetPage /> },
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
          // signed in with a team
          {
            element: <RequireTeam />,
            children: [
              {
                element: <TabLayout />,
                children: [
                  { index: true, element: <Navigate to="/field" replace /> },
                  { path: '/field', element: <Placeholder title="Field" phase={4} /> },
                  { path: '/lineup', element: <Placeholder title="Lineup" phase={5} /> },
                  { path: '/team', element: <Placeholder title="Team" phase={4} /> },
                  { path: '/games', element: <Placeholder title="Games" phase={5} /> },
                  { path: '/stats', element: <Placeholder title="Stats" phase={5} /> },
                  { path: '/settings', element: <SettingsPage /> },
                  { path: '/settings/members', element: <MembersPage /> },
                  { path: '/profile', element: <ProfilePage /> },
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
