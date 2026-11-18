import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type Enums, type Tables } from '@/lib/database.types';
import { dbError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { type HomeSection, parseContent } from '@/library/types';
import { type SportKey } from '@/sports/types';
import { addDays } from './rotation';

export type DrillMode = Enums<'drill_mode'>;
export type Completion = Tables<'home_drill_completions'>;

export const MODE_LABEL: Readonly<Record<DrillMode, string>> = {
  parent: 'With a Parent',
  solo: 'On My Own',
};

/** An at-home drill ready to show: the library row's id, slug and title with its parsed section. */
export interface HomeDrill {
  id: string;
  slug: string;
  title: string;
  home: HomeSection;
}

export const trainingKeys = {
  drills: (sport: SportKey) => ['library', 'home-drills', sport] as const,
  /** Everything recorded for one child; one invalidation refreshes drills, times and the streak. */
  player: (playerId: string) => ['training', playerId] as const,
  completions: (playerId: string) => ['training', playerId, 'completions'] as const,
};

/** The sport's at-home drills in the sheet's order (soccer only so far). */
export function useHomeDrills(sport: SportKey) {
  return useQuery({
    queryKey: trainingKeys.drills(sport),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<HomeDrill[]> => {
      const { data, error } = await supabase
        .from('library_items')
        .select('id, slug, title, content')
        .eq('sport', sport)
        .eq('category', 'home')
        .order('sort_order');
      if (error) throw dbError(error);
      return data.flatMap((r) => {
        const home = parseContent(r.content).home;
        return home ? [{ id: r.id, slug: r.slug, title: r.title, home }] : [];
      });
    },
  });
}

/** How far back the page looks for a child's last level and mode on each drill. */
const HISTORY_DAYS = 60;

/** A child's recent completions, oldest first. Row security limits them to my own confirmed child. */
export function useCompletions(playerId: string, today: string) {
  return useQuery({
    queryKey: trainingKeys.completions(playerId),
    queryFn: async (): Promise<Completion[]> => {
      const { data, error } = await supabase
        .from('home_drill_completions')
        .select('*')
        .eq('player_id', playerId)
        .gte('done_on', addDays(today, -HISTORY_DAYS))
        .order('done_on')
        .order('created_at');
      if (error) throw dbError(error);
      return data;
    },
  });
}

export interface DoneInput {
  itemId: string;
  level: number;
  mode: DrillMode;
}

/**
 * Mark a drill Done for today. The server writes the date (today where the team plays) and who
 * recorded it; a second Done for the same drill on the same day changes nothing.
 */
export function useMarkDone(playerId: string, today: string) {
  const qc = useQueryClient();
  const key = trainingKeys.completions(playerId);
  return useMutation({
    mutationFn: async ({ itemId, level, mode }: DoneInput) => {
      const { error } = await supabase
        .from('home_drill_completions')
        .upsert(
          { player_id: playerId, item_id: itemId, level, mode },
          { onConflict: 'player_id,item_id,done_on', ignoreDuplicates: true },
        );
      if (error) throw dbError(error);
    },
    onMutate: async ({ itemId, level, mode }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Completion[]>(key);
      if (previous && !previous.some((c) => c.item_id === itemId && c.done_on === today)) {
        qc.setQueryData<Completion[]>(key, [
          ...previous,
          {
            id: `temp-${itemId}`,
            player_id: playerId,
            item_id: itemId,
            done_on: today,
            level,
            mode,
            recorded_by: null,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: trainingKeys.player(playerId) });
    },
  });
}

/** Take back a Done recorded today (the server refuses anything older or someone else's). */
export function useUndoDone(playerId: string) {
  const qc = useQueryClient();
  const key = trainingKeys.completions(playerId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('home_drill_completions').delete().eq('id', id);
      if (error) throw dbError(error);
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Completion[]>(key);
      if (previous)
        qc.setQueryData<Completion[]>(
          key,
          previous.filter((c) => c.id !== id),
        );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: trainingKeys.player(playerId) });
    },
  });
}
