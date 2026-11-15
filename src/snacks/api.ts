import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dbError } from '@/lib/errors';
import { qk } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { type EventRef } from '@/rsvp/rsvp';

export const snackKeys = {
  cap: (teamId: string) => ['team', teamId, 'snack-cap'] as const,
};

/** The per-family cap this season, as the server computes it (null outside the team). */
export function useSnackCap(teamId: string, enabled = true) {
  return useQuery({
    queryKey: snackKeys.cap(teamId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('snack_cap', { p_team_id: teamId });
      if (error) throw dbError(error);
      return (data ?? null) as number | null;
    },
    enabled,
    staleTime: 60_000,
  });
}

function useInvalidateSnacks(teamId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.games(teamId) });
    void qc.invalidateQueries({ queryKey: qk.practices(teamId) });
    void qc.invalidateQueries({ queryKey: ['game'] });
    void qc.invalidateQueries({ queryKey: ['practice'] });
    void qc.invalidateQueries({ queryKey: snackKeys.cap(teamId) });
  };
}

const eventArgs = (event: EventRef) =>
  event.kind === 'game' ? { p_game_id: event.id } : { p_practice_id: event.id };

/** A family claims an event (a parent, within the cap) or a coach assigns one (any family, any time). */
export function useSetSnack(teamId: string) {
  const invalidate = useInvalidateSnacks(teamId);
  return useMutation({
    mutationFn: async ({ event, playerId }: { event: EventRef; playerId: string }) => {
      const { error } = await supabase.rpc('set_snack', { p_player_id: playerId, ...eventArgs(event) });
      if (error) throw dbError(error);
    },
    onSettled: invalidate,
  });
}

/** The family releases its own slot, or a coach clears any. */
export function useClearSnack(teamId: string) {
  const invalidate = useInvalidateSnacks(teamId);
  return useMutation({
    mutationFn: async (event: EventRef) => {
      const { error } = await supabase.rpc('clear_snack', eventArgs(event));
      if (error) throw dbError(error);
    },
    onSettled: invalidate,
  });
}
