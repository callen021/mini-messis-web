import { lazy, Suspense } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AuthRoot } from '@/auth/AuthProvider';
import { PublicOnly, RequireAuth } from '@/auth/guards';
import { lazyPage } from './lazy';
import { SignInPage } from '@/auth/pages/SignInPage';
import { RequireTeam } from '@/teams/TeamContext';
import { HomePage } from '@/home/HomePage';
import { FieldPage } from '@/lineups/FieldPage';
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
              {
                path: '/signup',
                element: lazyPage(() =>
                  import('@/auth/pages/SignUpPage').then((m) => ({ default: m.SignUpPage })),
                ),
              },
            ],
          },
        ],
      },
      // reachable either way: the password-reset email lands here, and so does the coach's
      // invite link (a visitor creates their account on it; a member goes straight to the picker)
      {
        element: <AuthLayout />,
        children: [
          {
            path: '/reset',
            element: lazyPage(() => import('@/auth/pages/ResetPage').then((m) => ({ default: m.ResetPage }))),
          },
          {
            path: '/join/:code',
            element: lazyPage(() =>
              import('@/teams/pages/InvitePage').then((m) => ({ default: m.InvitePage })),
            ),
          },
        ],
      },
      // signed in
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              {
                path: '/welcome',
                element: lazyPage(() =>
                  import('@/teams/pages/WelcomePage').then((m) => ({ default: m.WelcomePage })),
                ),
              },
              {
                path: '/join',
                element: lazyPage(() =>
                  import('@/teams/pages/JoinPage').then((m) => ({ default: m.JoinPage })),
                ),
              },
              {
                path: '/create-team',
                element: lazyPage(() =>
                  import('@/teams/pages/CreateTeamPage').then((m) => ({ default: m.CreateTeamPage })),
                ),
              },
              {
                path: '/pending',
                element: lazyPage(() =>
                  import('@/teams/pages/PendingPage').then((m) => ({ default: m.PendingPage })),
                ),
              },
            ],
          },
          // platform admin console (no team context)
          {
            element: lazyPage(() => import('@/admin/AdminLayout').then((m) => ({ default: m.AdminLayout }))),
            children: [
              {
                path: '/admin',
                element: lazyPage(() => import('@/admin/AdminPage').then((m) => ({ default: m.AdminPage }))),
              },
              {
                path: '/admin/teams/:teamId',
                element: lazyPage(() =>
                  import('@/admin/AdminTeamPage').then((m) => ({ default: m.AdminTeamPage })),
                ),
              },
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
                      {
                        path: '/board',
                        element: lazyPage(() =>
                          import('@/board/BoardPage').then((m) => ({ default: m.BoardPage })),
                        ),
                      },
                      { path: '/field', element: <FieldPage /> },
                      {
                        path: '/lineup',
                        element: lazyPage(() =>
                          import('@/games/LineupPage').then((m) => ({ default: m.LineupPage })),
                        ),
                      },
                      {
                        path: '/lineup/order',
                        element: lazyPage(() =>
                          import('@/games/BattingOrderPage').then((m) => ({ default: m.BattingOrderPage })),
                        ),
                      },
                      {
                        path: '/team',
                        element: lazyPage(() =>
                          import('@/roster/TeamPage').then((m) => ({ default: m.TeamPage })),
                        ),
                      },
                      {
                        path: '/team/sheet',
                        element: lazyPage(() =>
                          import('@/roster/TeamSheetPage').then((m) => ({ default: m.TeamSheetPage })),
                        ),
                      },
                      {
                        path: '/games',
                        element: lazyPage(() =>
                          import('@/games/GamesPage').then((m) => ({ default: m.GamesPage })),
                        ),
                      },
                      {
                        path: '/games/:gameId',
                        element: lazyPage(() =>
                          import('@/games/GamePage').then((m) => ({ default: m.GamePage })),
                        ),
                      },
                      {
                        path: '/practices/:practiceId',
                        element: lazyPage(() =>
                          import('@/games/PracticePage').then((m) => ({ default: m.PracticePage })),
                        ),
                      },
                      {
                        path: '/stats',
                        element: lazyPage(() =>
                          import('@/games/StatsPage').then((m) => ({ default: m.StatsPage })),
                        ),
                      },
                      {
                        path: '/players/:playerId',
                        element: lazyPage(() =>
                          import('@/skills/PlayerPage').then((m) => ({ default: m.PlayerPage })),
                        ),
                      },
                      {
                        path: '/players/:playerId/skills',
                        element: lazyPage(() =>
                          import('@/skills/PlayerSkillsPage').then((m) => ({ default: m.PlayerSkillsPage })),
                        ),
                      },
                      {
                        path: '/players/:playerId/skills/:testId',
                        element: lazyPage(() =>
                          import('@/skills/SkillTestPage').then((m) => ({ default: m.SkillTestPage })),
                        ),
                      },
                      {
                        path: '/settings',
                        element: lazyPage(() =>
                          import('@/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
                        ),
                      },
                      {
                        path: '/settings/members',
                        element: lazyPage(() =>
                          import('@/teams/pages/MembersPage').then((m) => ({ default: m.MembersPage })),
                        ),
                      },
                      {
                        path: '/settings/team',
                        element: lazyPage(() =>
                          import('@/settings/TeamSetupPage').then((m) => ({ default: m.TeamSetupPage })),
                        ),
                      },
                      {
                        path: '/settings/season',
                        element: lazyPage(() =>
                          import('@/settings/NewSeasonPage').then((m) => ({ default: m.NewSeasonPage })),
                        ),
                      },
                      {
                        path: '/settings/skills',
                        element: lazyPage(() =>
                          import('@/skills/SkillsSettingsPage').then((m) => ({
                            default: m.SkillsSettingsPage,
                          })),
                        ),
                      },
                      {
                        path: '/profile',
                        element: lazyPage(() =>
                          import('@/settings/ProfilePage').then((m) => ({ default: m.ProfilePage })),
                        ),
                      },
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
