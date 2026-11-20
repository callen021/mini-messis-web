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
export type Checkin = Tables<'practice_checkins'>;
export type GameCheckin = Tables<'game_checkins'>;

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
  attempts: (playerId: string) => ['training', playerId, 'attempts'] as const,
  bests: (playerId: string) => ['training', playerId, 'bests'] as const,
  streak: (playerId: string) => ['training', playerId, 'streak'] as const,
  checkins: (playerId: string) => ['training', playerId, 'checkins'] as const,
  gameCheckins: (playerId: string) => ['training', playerId, 'game-checkins'] as const,
  levels: (playerId: string) => ['training', playerId, 'levels'] as const,
};

/** The sport's published at-home drills in the sheet's order (soccer only so far); never a draft. */
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
        .eq('is_published', true)
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
 * Mark a drill Done for today without a score: only for a drill level that has no challenge
 * (D140; every built-in level has one, and recording a score marks the drill Done). The server
 * writes the date and who recorded it; a second Done the same day changes nothing.
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

/** One recorded score (D140). */
export type Attempt = Tables<'home_drill_attempts'>;
/** A score as the challenge hands it over: reps from a timer, seconds from a stopwatch. */
export type Score = { reps: number } | { seconds: number };

/** A child's recent scores on every drill, newest first (the "Recent scores" under More). */
export function useAttempts(playerId: string) {
  return useQuery({
    queryKey: trainingKeys.attempts(playerId),
    queryFn: async (): Promise<Attempt[]> => {
      const { data, error } = await supabase
        .from('home_drill_attempts')
        .select('*')
        .eq('player_id', playerId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw dbError(error);
      return data;
    },
  });
}

/** One score by its id, for the results page; null when it is gone or not this user's to see. */
export function useAttempt(id: string | undefined) {
  return useQuery({
    queryKey: ['training-attempt', id ?? ''] as const,
    enabled: !!id,
    queryFn: async (): Promise<Attempt | null> => {
      const { data, error } = await supabase
        .from('home_drill_attempts')
        .select('*')
        .eq('id', id ?? '')
        .maybeSingle();
      if (error) throw dbError(error);
      return data;
    },
  });
}

/** A child's personal best at one level of one drill: the most reps, or the least time. */
export interface Best {
  reps: number | null;
  seconds: number | null;
  attempts: number;
}
export const bestKey = (itemId: string, level: number): string => `${itemId}:${level}`;

/**
 * Personal bests per drill and level, by `bestKey` (D140). The database works them out and leaves
 * out times on the old five-cone course. For the child's confirmed parents and the team's coaches.
 */
export function useBests(playerId: string | undefined) {
  return useQuery({
    queryKey: trainingKeys.bests(playerId ?? ''),
    enabled: !!playerId,
    queryFn: async (): Promise<Map<string, Best>> => {
      const { data, error } = await supabase.rpc('home_drill_bests', { p_player_id: playerId ?? '' });
      if (error) throw dbError(error);
      return new Map(
        data.map((r) => [
          bestKey(r.item_id, r.level),
          {
            reps: (r.best_reps as number | null) ?? null,
            seconds: r.best_seconds === null ? null : Number(r.best_seconds),
            attempts: r.attempts,
          },
        ]),
      );
    },
  });
}

/**
 * Record a score. The server decides whether it is a record and whether it unlocks the next level,
 * and marks the drill Done when it is the day's first; it answers with the new attempt's id, which
 * is the results page's address.
 */
export function useRecordAttempt(playerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      itemId: string;
      level: number;
      mode: DrillMode;
      score: Score;
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('record_drill_attempt', {
        p_player_id: playerId,
        p_item_id: v.itemId,
        p_level: v.level,
        ...('reps' in v.score ? { p_reps: v.score.reps } : { p_seconds: v.score.seconds }),
        p_mode: v.mode,
      });
      if (error) throw dbError(error);
      return data;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: trainingKeys.player(playerId) }),
  });
}

/** Delete a score recorded today (the server refuses anything older or someone else's). */
export function useDeleteAttempt(playerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_drill_attempt', { p_attempt_id: id });
      if (error) throw dbError(error);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: trainingKeys.player(playerId) }),
  });
}

/**
 * A child's streak, counted by the database from home drills, games played and practices or games
 * marked "We went" (D130, D138). For the child's confirmed parent and the team's coaches.
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

/** The games a child was marked "We went" for (D138). */
export function useGameCheckins(playerId: string) {
  return useQuery({
    queryKey: trainingKeys.gameCheckins(playerId),
    queryFn: async (): Promise<GameCheckin[]> => {
      const { data, error } = await supabase.from('game_checkins').select('*').eq('player_id', playerId);
      if (error) throw dbError(error);
      return data;
    },
  });
}

/** Mark "We went" for a game, or take it back (the same day, by the parent who marked it). */
export function useSetGameWent(playerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ gameId, went }: { gameId: string; went: boolean }) => {
      const { error } = await supabase.rpc('set_game_went', {
        p_game_id: gameId,
        p_player_id: playerId,
        p_went: went,
      });
      if (error) throw dbError(error);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: trainingKeys.player(playerId) }),
  });
}

/** Where a child stands on one drill: the level they are on (D140: stored, Level 1 to start). */
export interface DrillLevel {
  level: number;
  /** The day of the first Done of this drill, `yyyy-mm-dd`; null when it was never done. */
  firstDoneOn: string | null;
}

/**
 * A child's level on every at-home drill, by drill id: Level 1 to start, up when a score meets the
 * level's target, or wherever a parent set it.
 */
export function useDrillLevels(playerId: string) {
  return useQuery({
    queryKey: trainingKeys.levels(playerId),
    queryFn: async (): Promise<Map<string, DrillLevel>> => {
      const { data, error } = await supabase.rpc('home_drill_levels', { p_player_id: playerId });
      if (error) throw dbError(error);
      return new Map(
        data.map((r) => [
          r.item_id,
          {
            level: r.level,
            firstDoneOn: (r.first_done_on as string | null) ?? null,
          },
        ]),
      );
    },
  });
}

/** A parent sets the level of one drill. */
export function useSetDrillLevel(playerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, level }: { itemId: string; level: number }) => {
      const { error } = await supabase.rpc('set_home_drill_level', {
        p_player_id: playerId,
        p_item_id: itemId,
        p_level: level,
      });
      if (error) throw dbError(error);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: trainingKeys.levels(playerId) }),
  });
}
