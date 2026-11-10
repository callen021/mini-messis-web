import { type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { SkeletonPage } from '@/components/Skeleton';
import { type Enums } from '@/lib/database.types';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useAuth } from './AuthProvider';

/** Page-shaped loading placeholder (title + list skeleton); the label is read by screen readers. */
export function LoadingScreen({ label = 'Loading…', rows }: { label?: string; rows?: number }) {
  return <SkeletonPage label={label} rows={rows} />;
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
