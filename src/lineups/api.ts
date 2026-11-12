import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { type Json, type Tables } from '@/lib/database.types';
import { qk } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { SPORTS, formationByName } from '@/sports/definitions';
import { type EnginePlayer, type Formation, type Period } from '@/sports/types';
import { type Player } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { periodsToPayload, rowsToPeriods, type StoredPeriod } from './convert';

export type Game = Tables<'games'>;

function unwrap<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  if (res.data === null || res.data === undefined) throw new Error('No data returned');
  return res.data as NonNullable<T>;
}

/** The team's live game, if any (only one can exist). */
export function useLiveGame(teamId: string) {
  return useQuery({
    queryKey: qk.liveGame(teamId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('team_id', teamId)
        .eq('status', 'live')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

async function fetchLineups(teamId: string, gameId: string | null): Promise<StoredPeriod[]> {
  let q = supabase.from('lineups').select('*').eq('team_id', teamId);
  q = gameId === null ? q.is('game_id', null) : q.eq('game_id', gameId);
  const lineups = unwrap(await q.order('period_index'));
  if (!lineups.length) return [];
  const slots = unwrap(
    await supabase
      .from('lineup_slots')
      .select('*')
      .in(
        'lineup_id',
        lineups.map((l) => l.id),
      ),
  );
  return rowsToPeriods(lineups, slots);
}

export function useLineups(teamId: string, gameId: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.lineups(teamId, gameId),
    queryFn: () => fetchLineups(teamId, gameId),
    enabled,
  });
}

/** The periods being coached right now: the live game's lineups, else the template (legacy `P()`). */
export function useCurrentPlan(teamId: string) {
  const live = useLiveGame(teamId);
  const gameId = live.data?.id ?? null;
  const lineups = useLineups(teamId, gameId, !live.isPending);
  return {
    gameId,
    liveGame: live.data ?? null,
    periods: lineups.data ?? [],
    isPending: live.isPending || lineups.isPending,
    error: live.error ?? lineups.error,
  };
}

/** Formations for the current team's size/gk, plus a lookup that falls back to the first. */
export function useFormations() {
  const { team, sport } = useCurrentTeam();
  return useMemo(() => {
    const forms = SPORTS[sport].formations({ size: team.side_size, gk: team.has_gk });
    return { forms, formationFor: (name: string): Formation => formationByName(forms, name) };
  }, [sport, team.side_size, team.has_gk]);
}

/** Players as the engine sees them (archived rows are already excluded by the query). */
export const toEnginePlayers = (players: readonly Player[]): EnginePlayer[] =>
  players.map((p) => ({ id: p.id, name: p.first_name, active: p.is_available }));

export const playerName = (p: Player | undefined): string =>
  p ? `${p.first_name}${p.last_name ? ` ${p.last_name}` : ''}` : '';

/**
 * Save a whole plan atomically with an optimistic update: the cache shows the new periods at
 * once, rolls back on error, and refetches on settle. Last write wins (documented in DECISIONS).
 */
export function useSavePlan(teamId: string, gameId: string | null) {
  const qc = useQueryClient();
  const { formationFor } = useFormations();
  const key = qk.lineups(teamId, gameId);
  return useMutation({
    mutationFn: async (periods: Period[]) => {
      const payload = periodsToPayload(periods, formationFor);
      const { error } = await supabase.rpc('save_lineups', {
        p_team_id: teamId,
        p_game_id: gameId ?? undefined,
        p_periods: payload as unknown as Json,
      });
      if (error) throw new Error(error.message);
    },
    onMutate: async (periods) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<StoredPeriod[]>(key);
      const optimistic: StoredPeriod[] = periods.map((q, i) => {
        const f = formationFor(q.formation);
        return {
          lineupId: previous?.[i]?.lineupId ?? `optimistic-${i}`,
          formation: f.name,
          slots: f.positions.map((_, k) => q.slots[k] ?? ''),
          auto: q.auto.filter((k) => !!q.slots[k]),
          codes: f.positions.map((p) => p.code),
          roles: f.positions.map((p) => p.role),
          bench: q.bench ? [...q.bench] : (previous?.[i]?.bench ?? []),
        };
      });
      qc.setQueryData(key, optimistic);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
    },
  });
}

/** Player ids the signed-in user is an approved guardian of (highlighted for parents). */
export function useMyChildren() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.guardians(user?.id ?? ''),
    queryFn: async () => {
      const rows = unwrap(
        await supabase
          .from('player_guardians')
          .select('player_id')
          .eq('user_id', user?.id ?? '')
          .eq('status', 'approved'),
      );
      return new Set(rows.map((r) => r.player_id));
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
}

/**
 * Realtime: any change to the team's players, lineups, slots or games refreshes the caches.
 * Realtime honours RLS, so members only ever receive rows they could read anyway.
 */
export function useTeamRealtime(teamId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const invalidate = (keys: readonly (readonly unknown[])[]) => () => {
      for (const k of keys) void qc.invalidateQueries({ queryKey: k });
    };
    const channel = supabase
      .channel(`team-${teamId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `team_id=eq.${teamId}` },
        invalidate([qk.players(teamId), ['team', teamId, 'lineups']]),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lineups', filter: `team_id=eq.${teamId}` },
        invalidate([['team', teamId, 'lineups']]),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lineup_slots' },
        invalidate([['team', teamId, 'lineups']]),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `team_id=eq.${teamId}` },
        invalidate([qk.games(teamId), qk.liveGame(teamId), ['game'], ['team', teamId, 'stats']]),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'practices', filter: `team_id=eq.${teamId}` },
        invalidate([qk.practices(teamId), ['practice']]),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'score_events' },
        invalidate([['game'], qk.games(teamId), qk.liveGame(teamId), ['team', teamId, 'stats']]),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'skill_tests', filter: `team_id=eq.${teamId}` },
        invalidate([['team', teamId, 'skill-tests']]),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'skill_results' },
        invalidate([['team', teamId, 'skill-results']]),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'plate_appearances' },
        invalidate([['game'], ['team', teamId, 'stats']]),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stints' },
        invalidate([
          ['game'],
          ['team', teamId, 'lineups'],
          ['team', teamId, 'stats'],
          ['team', teamId, 'season-minutes'],
        ]),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams', filter: `id=eq.${teamId}` },
        invalidate([qk.team(teamId), ['memberships']]),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'board_posts', filter: `team_id=eq.${teamId}` },
        invalidate([['team', teamId, 'board']]),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'board_comments' },
        invalidate([['team', teamId, 'board']]),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [teamId, qc]);
}
