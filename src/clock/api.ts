import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { type Json, type Tables } from '@/lib/database.types';
import { qk } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { type ClockState, PAUSED_CLOCK, type Stint } from './clock';
import { noteServerTime } from './serverTime';

export type StintRow = Tables<'stints'>;

function unwrap<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  if (res.data === null || res.data === undefined) throw new Error('No data returned');
  return res.data as NonNullable<T>;
}
const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

export const clockKeys = {
  clock: (gameId: string) => ['game', gameId, 'clock'] as const,
  stints: (gameId: string) => ['game', gameId, 'stints'] as const,
  seasonMinutes: (teamId: string) => ['team', teamId, 'season-minutes'] as const,
};

/** The game's clock as the server sees it; every read also corrects the device's clock skew. */
export function useGameClock(gameId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: clockKeys.clock(gameId ?? ''),
    queryFn: async (): Promise<ClockState> => {
      const rows = unwrap(await supabase.rpc('game_clock', { p_game_id: gameId as string }));
      const r = rows[0];
      if (!r) return PAUSED_CLOCK;
      noteServerTime(r.server_now);
      return {
        periodIndex: r.period_index,
        clockSeconds: r.clock_seconds,
        runningSince: r.running_since,
        periodLengths: r.period_lengths ?? [],
      };
    },
    enabled: !!gameId && enabled,
    staleTime: 0,
  });
}

/** Measure the clock skew once per session, and again whenever the app comes back to the front. */
export function useServerTimeSync(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const sync = async () => {
      const { data } = await supabase.rpc('server_time');
      if (typeof data === 'string') noteServerTime(data);
    };
    void sync();
    const onVisible = () => document.visibilityState === 'visible' && void sync();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [active]);
}

export function useStints(gameId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: clockKeys.stints(gameId ?? ''),
    queryFn: async (): Promise<Stint[]> =>
      unwrap(
        await supabase
          .from('stints')
          .select('*')
          .eq('game_id', gameId as string)
          .order('period_index')
          .order('clock_start')
          .order('created_at'),
      ),
    enabled: !!gameId && enabled,
  });
}

/** Everything a clock change can touch. */
function useInvalidateClock(teamId: string, gameId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: clockKeys.clock(gameId) });
    void qc.invalidateQueries({ queryKey: clockKeys.stints(gameId) });
    void qc.invalidateQueries({ queryKey: qk.game(gameId) });
    void qc.invalidateQueries({ queryKey: qk.liveGame(teamId) });
    void qc.invalidateQueries({ queryKey: ['team', teamId, 'lineups'] });
    void qc.invalidateQueries({ queryKey: ['team', teamId, 'stats'] });
  };
}

type ClockCall =
  | { kind: 'start' }
  | { kind: 'pause' }
  | { kind: 'end_period' }
  | { kind: 'sub'; off: string; on: string }
  | { kind: 'swap'; a: string; b: string }
  | { kind: 'empty'; off: string }
  | { kind: 'fill'; playerId: string; slot: number }
  | {
      kind: 'lineup';
      formation: string;
      slots: {
        position_role: string;
        position_code: string;
        player_id: string | null;
        auto_picked?: boolean;
      }[];
    }
  | { kind: 'bench'; a: string; b: string }
  | { kind: 'undo' };

/** One mutation for every clock action: each is a single atomic server function (D66, D67). */
export function useClockAction(teamId: string, gameId: string) {
  const invalidate = useInvalidateClock(teamId, gameId);
  return useMutation({
    mutationFn: async (call: ClockCall): Promise<string | null> => {
      const g = { p_game_id: gameId };
      switch (call.kind) {
        case 'start':
          fail((await supabase.rpc('clock_start', g)).error);
          return null;
        case 'pause':
          fail((await supabase.rpc('clock_pause', g)).error);
          return null;
        case 'end_period':
          fail((await supabase.rpc('clock_end_period', g)).error);
          return null;
        case 'sub':
          fail((await supabase.rpc('clock_sub', { ...g, p_off: call.off, p_on: call.on })).error);
          return null;
        case 'swap':
          fail((await supabase.rpc('clock_swap', { ...g, p_a: call.a, p_b: call.b })).error);
          return null;
        case 'empty':
          fail((await supabase.rpc('clock_empty', { ...g, p_off: call.off })).error);
          return null;
        case 'fill':
          fail(
            (await supabase.rpc('clock_fill', { ...g, p_player: call.playerId, p_slot: call.slot })).error,
          );
          return null;
        case 'lineup':
          fail(
            (
              await supabase.rpc('clock_set_lineup', {
                ...g,
                p_formation_name: call.formation,
                p_slots: call.slots as unknown as Json,
              })
            ).error,
          );
          return null;
        case 'bench':
          fail((await supabase.rpc('clock_bench_swap', { ...g, p_a: call.a, p_b: call.b })).error);
          return null;
        case 'undo': {
          const res = await supabase.rpc('clock_undo', g);
          fail(res.error);
          return res.data ?? null;
        }
      }
    },
    onSettled: invalidate,
  });
}

/* ---------- corrections after the game (D67) ---------- */

export function useStintCorrections(teamId: string, gameId: string) {
  const invalidate = useInvalidateClock(teamId, gameId);
  return useMutation({
    mutationFn: async (
      call:
        | { kind: 'update'; id: string; start: number; end: number }
        | { kind: 'add'; playerId: string; period: number; code: string; start: number; end: number }
        | { kind: 'delete'; id: string },
    ) => {
      if (call.kind === 'update')
        fail(
          (await supabase.rpc('stint_update', { p_stint_id: call.id, p_start: call.start, p_end: call.end }))
            .error,
        );
      else if (call.kind === 'add')
        fail(
          (
            await supabase.rpc('stint_add', {
              p_game_id: gameId,
              p_player: call.playerId,
              p_period: call.period,
              p_code: call.code,
              p_start: call.start,
              p_end: call.end,
            })
          ).error,
        );
      else fail((await supabase.rpc('stint_delete', { p_stint_id: call.id })).error);
    },
    onSettled: invalidate,
  });
}

/* ---------- season minutes for Auto-fill (staff, D71) ---------- */

export interface SeasonMinutes {
  seconds: number;
  byGroup: Record<string, number>;
}

export function useSeasonMinutes(teamId: string, enabled: boolean) {
  return useQuery({
    queryKey: clockKeys.seasonMinutes(teamId),
    queryFn: async (): Promise<Map<string, SeasonMinutes>> => {
      const rows = unwrap(await supabase.rpc('season_minutes', { p_team_id: teamId }));
      return new Map(
        rows.map((r) => [
          r.player_id,
          { seconds: r.seconds, byGroup: (r.by_group ?? {}) as Record<string, number> },
        ]),
      );
    },
    enabled,
    staleTime: 60_000,
  });
}
