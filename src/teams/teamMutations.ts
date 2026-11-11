import { useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { type Team } from './api';

/** "Parents can see stats for": own children or the whole team (staff, D56). Optimistic. */
export function useSetParentStats(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (parent_stats: Team['parent_stats']) => {
      const { error } = await supabase.from('teams').update({ parent_stats }).eq('id', teamId);
      if (error) throw new Error(error.message);
    },
    onMutate: async (parent_stats) => {
      await qc.cancelQueries({ queryKey: qk.team(teamId) });
      const previous = qc.getQueryData<Team>(qk.team(teamId));
      if (previous) qc.setQueryData(qk.team(teamId), { ...previous, parent_stats });
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
