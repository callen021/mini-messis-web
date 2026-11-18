import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type Enums, type Tables } from '@/lib/database.types';
import { dbError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { type HomeSection, parseContent } from '@/library/types';
import { type SportKey } from '@/sports/types';
import { addDays } from './rotation';
import { EMPTY_STREAK, type Streak } from './streak';

export type DrillMode = Enums<'drill_mode'>;
export type Completion = Tables<'home_drill_completions'>;
export type DrillTime = Tables<'home_drill_times'>;
export type Checkin = Tables<'practice_checkins'>;

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
  times: (playerId: string, itemId: string) => ['training', playerId, 'times', itemId] as const,
  streak: (playerId: string) => ['training', playerId, 'streak'] as const,
  checkins: (playerId: string) => ['training', playerId, 'checkins'] as const,
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

/** Every saved run of a child on one timed drill, oldest first (personal bests need them all). */
export function useDrillTimes(playerId: string, itemId: string) {
  return useQuery({
    queryKey: trainingKeys.times(playerId, itemId),
    queryFn: async (): Promise<DrillTime[]> => {
      const { data, error } = await supabase
        .from('home_drill_times')
        .select('*')
        .eq('player_id', playerId)
        .eq('item_id', itemId)
        .order('created_at');
      if (error) throw dbError(error);
      return data;
    },
  });
}

/**
 * Save a clean run. The server stamps the date and marks the drill Done for the day, so the
 * child's whole training state is refreshed afterwards.
 */
export function useSaveTime(playerId: string, itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ level, seconds }: { level: number; seconds: number }) => {
      const { error } = await supabase
        .from('home_drill_times')
        .insert({ player_id: playerId, item_id: itemId, level, seconds });
      if (error) throw dbError(error);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: trainingKeys.player(playerId) }),
  });
}

/**
 * A child's streak, counted by the database from home drills, games played and practices marked
 * "We went" (D130). For the child's confirmed parent and the team's coaches.
 */
export function useStreak(playerId: string, enabled = true) {
  return useQuery({
    queryKey: trainingKeys.streak(playerId),
    enabled,
    queryFn: async (): Promise<Streak> => {
      const { data, error } = await supabase.rpc('training_streak', { p_player_id: playerId });
      if (error) throw dbError(error);
      const row = data[0];
      if (!row) return EMPTY_STREAK;
      return {
        current: row.current_streak,
        longest: row.longest_streak,
        todayCounts: row.today_counts,
        misses: row.misses,
        celebrate: (row.celebrate as number | null) ?? null,
      };
    },
  });
}

/** The milestone was shown: remember it, so each is celebrated once. */
export function useCelebrateMilestone(playerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (milestone: number) => {
      const { error } = await supabase.rpc('celebrate_training_milestone', {
        p_player_id: playerId,
        p_milestone: milestone,
      });
      if (error) throw dbError(error);
    },
    onSuccess: () => {
      qc.setQueryData<Streak>(trainingKeys.streak(playerId), (s) => (s ? { ...s, celebrate: null } : s));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: trainingKeys.streak(playerId) }),
  });
}

/** The practices a child was marked "We went" for. */
export function useCheckins(playerId: string) {
  return useQuery({
    queryKey: trainingKeys.checkins(playerId),
    queryFn: async (): Promise<Checkin[]> => {
      const { data, error } = await supabase.from('practice_checkins').select('*').eq('player_id', playerId);
      if (error) throw dbError(error);
      return data;
    },
  });
}

/** Mark "We went" for a practice, or take it back (the same day, by the parent who marked it). */
export function useSetWent(playerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ practiceId, went }: { practiceId: string; went: boolean }) => {
      const { error } = await supabase.rpc('set_practice_went', {
        p_practice_id: practiceId,
        p_player_id: playerId,
        p_went: went,
      });
      if (error) throw dbError(error);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: trainingKeys.player(playerId) }),
  });
}
