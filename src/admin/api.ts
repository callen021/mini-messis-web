import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type Enums, type Json } from '@/lib/database.types';
import { qk } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { type SportKey } from '@/sports/types';
import { type MemberRole, teamDefaults } from '@/teams/api';

export const adminKeys = {
  teams: ['admin', 'teams'] as const,
  users: ['admin', 'users'] as const,
};

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

export interface AdminTeamRow {
  id: string;
  name: string;
  sport: SportKey;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  coaches: number;
  assistants: number;
  parents: number;
  pending: number;
  players: number;
  created_at: string;
  archived_at: string | null;
}

export interface AdminUserTeam {
  team_id: string;
  name: string;
  sport: SportKey;
  role: MemberRole;
  status: Enums<'member_status'>;
}
export interface AdminUserRow {
  user_id: string;
  display_name: string;
  email: string;
  created_at: string;
  is_platform_admin: boolean;
  teams: AdminUserTeam[];
}

export function useAdminTeams(enabled = true) {
  return useQuery({
    queryKey: adminKeys.teams,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_teams');
      fail(error);
      return (data ?? []) as AdminTeamRow[];
    },
    enabled,
  });
}

export function useAdminUsers(enabled = true) {
  return useQuery({
    queryKey: adminKeys.users,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_users');
      fail(error);
      return (data ?? []).map((u) => ({
        ...u,
        teams: (u.teams ?? []) as unknown as AdminUserTeam[],
      })) as AdminUserRow[];
    },
    enabled,
  });
}

function useAdminTeamMutation<TArgs>(teamId: string, fn: (args: TArgs) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.teams });
      void qc.invalidateQueries({ queryKey: adminKeys.users });
      void qc.invalidateQueries({ queryKey: qk.team(teamId) });
      void qc.invalidateQueries({ queryKey: ['memberships'] });
    },
  });
}

export function useAdminRenameTeam(teamId: string) {
  return useAdminTeamMutation<string>(teamId, async (name) =>
    fail((await supabase.from('teams').update({ name }).eq('id', teamId)).error),
  );
}

export function useAdminArchiveTeam(teamId: string) {
  return useAdminTeamMutation<boolean>(teamId, async (archive) =>
    fail(
      (
        await supabase
          .from('teams')
          .update({ archived_at: archive ? new Date().toISOString() : null })
          .eq('id', teamId)
      ).error,
    ),
  );
}

export function useAdminAddMember(teamId: string) {
  return useAdminTeamMutation<{ email: string; role: MemberRole }>(teamId, async ({ email, role }) =>
    fail((await supabase.rpc('admin_add_member', { p_team_id: teamId, p_email: email, p_role: role })).error),
  );
}

/** Switch the team to another sport with that sport's default shape, template and skill tests. */
export function useAdminChangeSport(teamId: string) {
  const qc = useQueryClient();
  return useAdminTeamMutation<SportKey>(teamId, async (sport) => {
    const d = teamDefaults(sport);
    fail(
      (
        await supabase.rpc('admin_change_sport', {
          p_team_id: teamId,
          p_sport: sport,
          p_side_size: d.side_size,
          p_has_gk: d.has_gk,
          p_periods_count: d.periods_count,
          p_colors: d.colors as Json,
          p_template: d.template as unknown as Json,
        })
      ).error,
    );
    void qc.invalidateQueries({ queryKey: ['team', teamId] });
  });
}
