import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet } from 'react-router';
import { useActAs } from '@/admin/actAs';
import { useAuth } from '@/auth/AuthProvider';
import { LoadingScreen } from '@/auth/guards';
import { useUIStore } from '@/lib/ui-store';
import { type SportKey } from '@/sports/types';
import {
  type ActiveMembership,
  type MemberRole,
  type Team,
  useActiveMemberships,
  useTeam,
  usePendingRequests,
  useProfile,
  useUpdateProfile,
} from './api';

export interface TeamContextValue {
  teamId: string;
  team: Team;
  sport: SportKey;
  role: MemberRole;
  isOwner: boolean;
  memberships: ActiveMembership[];
  switchTeam: (teamId: string) => void;
  /** A platform admin is acting as this team's coach without being a member. */
  adminActing: boolean;
}

const TeamContext = createContext<TeamContextValue | null>(null);

const LAST_TEAM_KEY = 'mm-last-team';
const readLastTeam = (): string | null => {
  try {
    return localStorage.getItem(LAST_TEAM_KEY);
  } catch {
    return null;
  }
};
const writeLastTeam = (id: string) => {
  try {
    localStorage.setItem(LAST_TEAM_KEY, id);
  } catch {
    /* ignore */
  }
};

/**
 * Route element: loads the user's memberships, routes users without a team to onboarding, and
 * provides the current team + role to everything below. Remembers the last-used team per user.
 */
export function RequireTeam() {
  const { user } = useAuth();
  const userId = user?.id;
  const memberships = useActiveMemberships(userId);
  const pending = usePendingRequests(userId);
  const profile = useProfile(userId);
  const updateProfile = useUpdateProfile(userId);
  const setSport = useUIStore((s) => s.setSport);
  const [picked, setPicked] = useState<string | null>(readLastTeam);
  const isAdmin = profile.data?.is_platform_admin ?? false;
  const actAsId = useActAs((s) => s.teamId);
  const setActAs = useActAs((s) => s.setTeamId);
  const adminTeam = useTeam(isAdmin && actAsId ? actAsId : undefined);

  const list = useMemo(() => memberships.data ?? [], [memberships.data]);
  const current = useMemo(() => {
    if (!list.length) return null;
    const wanted = picked ?? profile.data?.last_team_id ?? null;
    return list.find((m) => m.team.id === wanted) ?? list[0] ?? null;
  }, [list, picked, profile.data?.last_team_id]);

  const acting =
    isAdmin && !!actAsId && !!adminTeam.data && !adminTeam.data.archived_at ? adminTeam.data : null;

  // keep the sport tint in step with the team
  useEffect(() => {
    const sport = acting?.sport ?? current?.team.sport;
    if (sport) setSport(sport);
  }, [acting, current, setSport]);

  const switchTeam = useCallback(
    (teamId: string) => {
      setActAs(null);
      setPicked(teamId);
      writeLastTeam(teamId);
      if (profile.data && profile.data.last_team_id !== teamId)
        updateProfile.mutate({ last_team_id: teamId });
    },
    [profile.data, updateProfile, setActAs],
  );

  if (memberships.isPending || (pending.isPending && !list.length)) return <LoadingScreen />;
  if (isAdmin && actAsId && adminTeam.isPending) return <LoadingScreen label="Opening team…" />;
  if (memberships.isError) return <LoadingScreen label="Couldn’t load your teams. Pull to retry." />;
  if (acting) {
    const value: TeamContextValue = {
      teamId: acting.id,
      team: acting,
      sport: acting.sport,
      role: 'coach',
      isOwner: true,
      memberships: list,
      switchTeam,
      adminActing: true,
    };
    return (
      <TeamContext.Provider value={value}>
        <Outlet />
      </TeamContext.Provider>
    );
  }
  if (!current) {
    return <Navigate to={pending.data && pending.data.length > 0 ? '/pending' : '/welcome'} replace />;
  }

  const value: TeamContextValue = {
    teamId: current.team.id,
    team: current.team,
    sport: current.team.sport,
    role: current.membership.role,
    isOwner: current.team.owner_id === userId,
    memberships: list,
    switchTeam,
    adminActing: false,
  };
  return (
    <TeamContext.Provider value={value}>
      <Outlet />
    </TeamContext.Provider>
  );
}

export function useCurrentTeam(): TeamContextValue {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error('useCurrentTeam must be used below <RequireTeam>');
  return ctx;
}

/** Optional variant for components that may render outside a team (returns null there). */
export function useOptionalTeam(): TeamContextValue | null {
  return useContext(TeamContext);
}

export function TeamProviderForTests({ value, children }: { value: TeamContextValue; children: ReactNode }) {
  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}
