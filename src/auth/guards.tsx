import { type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { type Enums } from '@/lib/database.types';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useAuth } from './AuthProvider';

export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      {label}
    </div>
  );
}

/** Children require a session; otherwise go to sign-in and come back afterwards. */
export function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Sign-in / sign-up pages: a signed-in user is sent into the app. */
export function PublicOnly() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}

export type MemberRole = Enums<'member_role'>;
export const STAFF_ROLES: readonly MemberRole[] = ['coach', 'assistant'];

/** Render children only for the given roles on the current team. */
export function RoleGate({
  allow,
  children,
  fallback = null,
}: {
  allow: readonly MemberRole[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { role } = useCurrentTeam();
  return <>{allow.includes(role) ? children : fallback}</>;
}

/** Convenience hooks for the common checks. */
export function useIsStaff(): boolean {
  const { role } = useCurrentTeam();
  return STAFF_ROLES.includes(role);
}
export function useIsCoach(): boolean {
  return useCurrentTeam().role === 'coach';
}
