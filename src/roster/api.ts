import { useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { type Player } from '@/teams/api';

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

/** Optimistic helpers shared by the roster mutations. */
function usePlayersMutation<TArgs>(
  teamId: string,
  mutationFn: (args: TArgs) => Promise<void>,
  apply: (players: Player[], args: TArgs) => Player[],
) {
  const qc = useQueryClient();
  const key = qk.players(teamId);
  return useMutation({
    mutationFn,
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Player[]>(key);
      if (previous) qc.setQueryData(key, apply(previous, args));
      return { previous };
    },
    onError: (_e, _a, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ['team', teamId, 'lineups'] });
    },
  });
}

export function useAddPlayer(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ firstName, number }: { firstName: string; number: string }) => {
      const current = qc.getQueryData<Player[]>(qk.players(teamId)) ?? [];
      const sort = current.reduce((m, p) => Math.max(m, p.sort_order), 0) + 1;
      const { data, error } = await supabase
        .from('players')
        .insert({
          team_id: teamId,
          first_name: firstName.trim(),
          jersey_number: number || null,
          sort_order: sort,
        })
        .select()
        .single();
      fail(error);
      return data as Player;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.players(teamId) });
    },
  });
}

export function useUpdatePlayer(teamId: string) {
  return usePlayersMutation<{ id: string; first_name?: string; jersey_number?: string | null }>(
    teamId,
    async ({ id, ...patch }) => fail((await supabase.from('players').update(patch).eq('id', id)).error),
    (players, { id, ...patch }) => players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  );
}

/** Active/out for this game. Marking out also clears the player from the current plan (server-side). */
export function useSetAvailable(teamId: string) {
  return usePlayersMutation<{ id: string; available: boolean }>(
    teamId,
    async ({ id, available }) =>
      fail((await supabase.rpc('set_player_available', { p_player_id: id, p_available: available })).error),
    (players, { id, available }) => players.map((p) => (p.id === id ? { ...p, is_available: available } : p)),
  );
}

export function useEveryoneBack(teamId: string) {
  return usePlayersMutation<undefined>(
    teamId,
    async () =>
      fail(
        (
          await supabase
            .from('players')
            .update({ is_available: true })
            .eq('team_id', teamId)
            .eq('is_available', false)
        ).error,
      ),
    (players) => players.map((p) => ({ ...p, is_available: true })),
  );
}

/** Soft delete: the row stays for game history, disappears from the roster and the plan. */
export function useArchivePlayer(teamId: string) {
  return usePlayersMutation<string>(
    teamId,
    async (id) => fail((await supabase.rpc('archive_player', { p_player_id: id })).error),
    (players, id) => players.filter((p) => p.id !== id),
  );
}
