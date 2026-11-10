import { Navigate, Outlet } from 'react-router';
import { LoadingScreen } from '@/auth/guards';
import { useIsPlatformAdmin } from './useIsPlatformAdmin';

/** Route guard + plain shell for the admin console (no team context, no tab bar). */
export function AdminLayout() {
  const isAdmin = useIsPlatformAdmin();
  if (isAdmin === undefined) return <LoadingScreen />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return (
    <main className="app-main">
      <Outlet />
    </main>
  );
}
