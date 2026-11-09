import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
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
    path: '/',
    element: <TabLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/field" replace /> },
      { path: 'field', element: <Placeholder title="Field" phase={4} /> },
      { path: 'team', element: <Placeholder title="Team" phase={4} /> },
      { path: 'games', element: <Placeholder title="Games" phase={5} /> },
      { path: 'stats', element: <Placeholder title="Stats" phase={5} /> },
      { path: 'settings', element: <Placeholder title="Settings" phase={7} /> },
    ],
  },
  ...devRoutes,
  { path: '*', element: <NotFound /> },
];

export const router = createBrowserRouter(routes, base ? { basename: base } : undefined);
