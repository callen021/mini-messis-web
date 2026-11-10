import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type Enums, type Json, type Tables } from '@/lib/database.types';
import { qk } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { defaultsPayload } from '@/skills/defaults';
import { SPORTS, defaultFormation } from '@/sports/definitions';
import { type SportKey } from '@/sports/types';

export type Team = Tables<'teams'>;
export type Membership = Tables<'team_members'>;
export type Player = Tables<'players'>;
export type Profile = Tables<'profiles'>;
export type MemberRole = Enums<'member_role'>;

export interface ActiveMembership {
  membership: Membership;
  team: Team;
}

function unwrap<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  if (res.data === null || res.data === undefined) throw new Error('No data returned');
  return res.data as NonNullable<T>;
}

/* ---------- memberships ---------- */

export async function fetchActiveMemberships(userId: string): Promise<ActiveMembership[]> {
  const memberships = unwrap(
    await supabase.from('team_members').select('*').eq('user_id', userId).eq('status', 'active'),
  );
  if (!memberships.length) return [];
  const teams = unwrap(
    await supabase
      .from('teams')
      .select('*')
      .in(
        'id',
        memberships.map((m) => m.team_id),
      )
      .is('archived_at', null),
  );
  const byId = new Map(teams.map((t) => [t.id, t]));
  return memberships.flatMap((m) => {
    const team = byId.get(m.team_id);
    return team ? [{ membership: m, team }] : [];
  });
}

export function useActiveMemberships(userId: string | undefined) {
  return useQuery({
    queryKey: qk.memberships(userId ?? ''),
    queryFn: () => fetchActiveMemberships(userId as string),
    enabled: !!userId,
  });
}

export interface PendingRequest {
  member_id: string;
  team_id: string;
  team_name: string;
  sport: SportKey;
  requested_role: MemberRole;
  created_at: string;
}

export function usePendingRequests(userId: string | undefined) {
  return useQuery({
    queryKey: qk.pendingRequests(userId ?? ''),
    queryFn: async () => unwrap(await supabase.rpc('my_pending_requests')) as PendingRequest[],
    enabled: !!userId,
  });
}

/* ---------- profile ---------- */

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: qk.profile(userId ?? ''),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId as string)
          .single(),
      ),
    enabled: !!userId,
  });
}

export function useUpdateProfile(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      patch: Partial<Pick<Profile, 'display_name' | 'theme' | 'field_view' | 'last_team_id'>>,
    ) =>
      unwrap(
        await supabase
          .from('profiles')
          .update(patch)
          .eq('id', userId as string)
          .select()
          .single(),
      ),
    onSuccess: (profile) => qc.setQueryData(qk.profile(userId ?? ''), profile),
  });
}

/* ---------- team ---------- */

export function useTeam(teamId: string | undefined) {
  return useQuery({
    queryKey: qk.team(teamId ?? ''),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('teams')
          .select('*')
          .eq('id', teamId as string)
          .single(),
      ),
    enabled: !!teamId,
  });
}

export function usePlayers(teamId: string | undefined) {
  return useQuery({
    queryKey: qk.players(teamId ?? ''),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('players')
          .select('*')
          .eq('team_id', teamId as string)
          .is('archived_at', null)
          .order('sort_order')
          .order('first_name'),
      ),
    enabled: !!teamId,
  });
}

/** Build the create_team payload from the sport definition (rules stay in code). */
export function teamDefaults(sport: SportKey) {
  const S = SPORTS[sport];
  const forms = S.formations({ size: S.defaultSize, gk: S.hasGK });
  const f = defaultFormation(forms, S);
  const template = Array.from({ length: S.defaultPeriods }, () => ({
    formation_name: f.name,
    slots: f.positions.map((p) => ({ position_role: p.role, position_code: p.code })),
  }));
  return {
    side_size: S.defaultSize,
    has_gk: S.hasGK,
    periods_count: S.defaultPeriods,
    colors: { ...S.defaultColors } as Record<string, string>,
    template,
  };
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, sport }: { name: string; sport: SportKey }) => {
      const d = teamDefaults(sport);
      return unwrap(
        await supabase.rpc('create_team', {
          p_name: name.trim(),
          p_sport: sport,
          p_side_size: d.side_size,
          p_has_gk: d.has_gk,
          p_periods_count: d.periods_count,
          p_colors: d.colors as Json,
          p_template: d.template as unknown as Json,
          p_skill_tests: defaultsPayload(sport) as unknown as Json,
        }),
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['memberships'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

/* ---------- join flow ---------- */

export interface JoinPreview {
  team_id: string;
  name: string;
  sport: SportKey;
  players: { id: string; first_name: string; jersey_number: string | null }[];
}

export async function lookupJoinCode(code: string): Promise<JoinPreview | null> {
  const data = unwrap(await supabase.rpc('lookup_join_code', { p_code: code }));
  return (data as unknown as JoinPreview | null) ?? null;
}

export interface JoinResult {
  status: 'pending' | 'active';
  team_id: string;
  name: string;
  sport: SportKey;
}

export function useRequestJoin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      code: string;
      role: Extract<MemberRole, 'parent' | 'assistant'>;
      playerIds: string[];
      unlistedChildName: string;
    }) =>
      unwrap(
        await supabase.rpc('request_join', {
          p_code: args.code,
          p_requested_role: args.role,
          p_player_ids: args.playerIds,
          p_unlisted_child_name: args.unlistedChildName || undefined,
        }),
      ) as unknown as JoinResult,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['memberships'] });
      void qc.invalidateQueries({ queryKey: ['pending-requests'] });
    },
  });
}

/* ---------- member management (coach) ---------- */

export interface ChildLink {
  link_id: string;
  player_id: string;
  first_name: string;
  jersey_number: string | null;
  status: Enums<'guardian_status'>;
}

export interface TeamMemberRow {
  member_id: string;
  user_id: string;
  role: MemberRole;
  status: Enums<'member_status'>;
  requested_role: MemberRole | null;
  display_name: string;
  email: string;
  is_owner: boolean;
  created_at: string;
  approved_at: string | null;
  children: ChildLink[];
  unlisted: string[];
}

export function useTeamMembers(teamId: string | undefined) {
  return useQuery({
    queryKey: qk.teamMembers(teamId ?? ''),
    queryFn: async () =>
      (
        unwrap(
          await supabase.rpc('list_team_members', { p_team_id: teamId as string }),
        ) as unknown as TeamMemberRow[]
      ).map((r) => ({
        ...r,
        children: (r.children ?? []) as ChildLink[],
        unlisted: (r.unlisted ?? []) as string[],
      })),
    enabled: !!teamId,
  });
}

function useTeamMutation<TArgs>(teamId: string, fn: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.team(teamId) });
    },
  });
}

export function useApproveMember(teamId: string) {
  return useTeamMutation(
    teamId,
    async (a: { memberId: string; role: MemberRole; playerIds: string[] | null }) =>
      unwrap(
        await supabase
          .rpc('approve_member', {
            p_member_id: a.memberId,
            p_role: a.role,
            p_player_ids: a.playerIds ?? undefined,
          })
          .then((r) => ({ data: true, error: r.error })),
      ),
  );
}
export function useDeclineMember(teamId: string) {
  return useTeamMutation(teamId, async (memberId: string) =>
    unwrap(
      await supabase
        .rpc('decline_member', { p_member_id: memberId })
        .then((r) => ({ data: true, error: r.error })),
    ),
  );
}
export function useRemoveMember(teamId: string) {
  return useTeamMutation(teamId, async (memberId: string) =>
    unwrap(
      await supabase
        .rpc('remove_member', { p_member_id: memberId })
        .then((r) => ({ data: true, error: r.error })),
    ),
  );
}
export function useSetMemberRole(teamId: string) {
  return useTeamMutation(teamId, async (a: { memberId: string; role: MemberRole }) =>
    unwrap(
      await supabase
        .rpc('set_member_role', { p_member_id: a.memberId, p_role: a.role })
        .then((r) => ({ data: true, error: r.error })),
    ),
  );
}
export function useApproveGuardianLink(teamId: string) {
  return useTeamMutation(teamId, async (a: { linkId: string; approve: boolean }) =>
    unwrap(
      await supabase
        .rpc('approve_guardian_link', { p_link_id: a.linkId, p_approve: a.approve })
        .then((r) => ({ data: true, error: r.error })),
    ),
  );
}
export function useRotateJoinCode(teamId: string) {
  return useTeamMutation(teamId, async () =>
    unwrap(await supabase.rpc('rotate_join_code', { p_team_id: teamId })),
  );
}
export function useTransferOwnership(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) =>
      unwrap(
        await supabase
          .rpc('transfer_ownership', { p_team_id: teamId, p_user_id: userId })
          .then((r) => ({ data: true, error: r.error })),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.team(teamId) });
      void qc.invalidateQueries({ queryKey: ['memberships'] });
    },
  });
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
