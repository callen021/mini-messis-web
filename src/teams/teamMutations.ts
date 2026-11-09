import { useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { type Team } from './api';

/** Rename the team (coach only; the database trigger enforces it). Optimistic. */
export function useRenameTeam(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('teams').update({ name }).eq('id', teamId);
      if (error) throw new Error(error.message);
    },
    onMutate: async (name) => {
      await qc.cancelQueries({ queryKey: qk.team(teamId) });
      const previous = qc.getQueryData<Team>(qk.team(teamId));
      if (previous) qc.setQueryData(qk.team(teamId), { ...previous, name });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.team(teamId), ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.team(teamId) });
      void qc.invalidateQueries({ queryKey: ['memberships'] });
    },
  });
}
