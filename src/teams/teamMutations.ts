import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dbError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { type Team } from './api';
import { invalidateTeamCaches, patchTeamCaches } from './teamCache';

type TeamPatch = Partial<Pick<Team, 'parent_stats' | 'name' | 'require_approval' | 'join_enabled'>>;

/**
 * One optimistic update of team columns: every cached copy changes at once (D88), rolls back on
 * error and refetches when settled. RLS and the teams triggers decide who may.
 */
function useTeamPatch<TArgs>(teamId: string, toPatch: (args: TArgs) => TeamPatch) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: TArgs) => {
      const { error } = await supabase.from('teams').update(toPatch(args)).eq('id', teamId);
      if (error) throw dbError(error);
    },
    onMutate: (args) => ({ restore: patchTeamCaches(qc, teamId, toPatch(args)) }),
    onError: (_e, _v, ctx) => ctx?.restore(),
    onSettled: () => invalidateTeamCaches(qc, teamId),
  });
}

/** "Parents can see stats for": own children or the whole team (staff, D56). Optimistic. */
export function useSetParentStats(teamId: string) {
  return useTeamPatch(teamId, (parent_stats: Team['parent_stats']) => ({ parent_stats }));
}

/** Rename the team (coach only; the database trigger enforces it). Optimistic. */
export function useRenameTeam(teamId: string) {
  return useTeamPatch(teamId, (name: string) => ({ name }));
}

/** "Approve new parents before they join" (staff, D91). Optimistic. */
export function useSetRequireApproval(teamId: string) {
  return useTeamPatch(teamId, (require_approval: boolean) => ({ require_approval }));
}
