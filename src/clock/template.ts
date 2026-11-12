import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type Json } from '@/lib/database.types';
import { qk } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { useFormations } from '@/lineups/api';
import { periodsToPayload, type StoredPeriod } from '@/lineups/convert';
import { type Period } from '@/sports/types';

/**
 * Save the starters of a clock-mode team (D70). The template keeps its period rows (the
 * period-mode count), every one of them set to the starters, so `start_game` and a switch back
 * to period mode both find a complete plan. Optimistic, rolling back on error like `useSavePlan`.
 */
export function useSaveStarters(teamId: string) {
  const qc = useQueryClient();
  const { formationFor } = useFormations();
  const key = qk.lineups(teamId, null);
  return useMutation({
    mutationFn: async ({ starters, count }: { starters: Period; count: number }) => {
      const periods = Array.from({ length: count }, () => starters);
      const { error } = await supabase.rpc('save_lineups', {
        p_team_id: teamId,
        p_game_id: undefined,
        p_periods: periodsToPayload(periods, formationFor) as unknown as Json,
      });
      if (error) throw new Error(error.message);
    },
    onMutate: async ({ starters, count }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<StoredPeriod[]>(key);
      const f = formationFor(starters.formation);
      const optimistic: StoredPeriod[] = Array.from({ length: count }, (_, i) => ({
        lineupId: previous?.[i]?.lineupId ?? `optimistic-${i}`,
        formation: f.name,
        slots: f.positions.map((_, k) => starters.slots[k] ?? ''),
        auto: starters.auto.filter((k) => !!starters.slots[k]),
        codes: f.positions.map((p) => p.code),
        roles: f.positions.map((p) => p.role),
      }));
      qc.setQueryData(key, optimistic);
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
    },
  });
}
