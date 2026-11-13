/** RSVP data (D107): the team's replies, the set_rsvp call, and the planned game's parent-outs. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useIsStaff } from '@/auth/guards';
import { useGames } from '@/games/api';
import { todayISO } from '@/games/format';
import { type DbErrorLike, dbError } from '@/lib/errors';
import { qk } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { type EventRef, type RsvpRow, type RsvpStatus, outSplit, plannedGame, repliesFor } from './rsvp';

function unwrap<T>(res: { data: T; error: DbErrorLike | null }): NonNullable<T> {
  if (res.error) throw dbError(res.error);
  if (res.data === null || res.data === undefined) throw new Error('No data returned');
  return res.data as NonNullable<T>;
}

/** Every reply on the team (one small table; the schedule and the Field read it together). */
export function useRsvps(teamId: string) {
  return useQuery({
    queryKey: qk.rsvps(teamId),
    queryFn: async () =>
      unwrap(await supabase.from('event_rsvps').select('*').eq('team_id', teamId)) as RsvpRow[],
  });
}

export interface SetRsvpInput {
  event: EventRef;
  playerId: string;
  status: RsvpStatus;
}

/**
 * set_rsvp with an optimistic row so the buttons flip at once; the server decides who may write
 * and whether replies are still open, and the cache rolls back on a refusal.
 */
export function useSetRsvp(teamId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isStaff = useIsStaff();
  const key = qk.rsvps(teamId);
  return useMutation({
    mutationFn: async ({ event, playerId, status }: SetRsvpInput) => {
      const { error } = await supabase.rpc('set_rsvp', {
        p_player_id: playerId,
        p_status: status,
        ...(event.kind === 'game' ? { p_game_id: event.id } : { p_practice_id: event.id }),
      });
      if (error) throw dbError(error);
    },
    onMutate: async ({ event, playerId, status }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<RsvpRow[]>(key);
      const rest = (previous ?? []).filter(
        (r) =>
          !(r.player_id === playerId && (event.kind === 'game' ? r.game_id : r.practice_id) === event.id),
      );
      const row: RsvpRow = {
        id: `optimistic-${playerId}-${event.id}`,
        team_id: teamId,
        game_id: event.kind === 'game' ? event.id : null,
        practice_id: event.kind === 'practice' ? event.id : null,
        player_id: playerId,
        status,
        set_by_role: isStaff ? 'coach' : 'parent',
        set_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      qc.setQueryData<RsvpRow[]>(key, [...rest, row]);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      // a coach's "going" may lift the team-wide flag too
      void qc.invalidateQueries({ queryKey: qk.players(teamId) });
    },
  });
}

/**
 * The game the Field and the rotation views plan for (live, else the first upcoming from today)
 * and the players whose reply for it says out (`parentOut`), with the subset a parent set
 * (`byParent`) for the indicators. Out-by-reply players count as out on the Field but are never
 * removed from a spot they already hold (D107).
 */
export function usePlannedGame(teamId: string) {
  const games = useGames(teamId);
  const rsvps = useRsvps(teamId);
  const today = todayISO();
  return useMemo(() => {
    const game = plannedGame(games.data ?? [], today);
    const replies = repliesFor(rsvps.data ?? [], game ? { kind: 'game', id: game.id } : null);
    const split = outSplit(replies);
    return {
      game,
      replies,
      parentOut: split.out,
      byParent: split.byParent,
      isPending: games.isPending || rsvps.isPending,
    };
  }, [games.data, games.isPending, rsvps.data, rsvps.isPending, today]);
}
