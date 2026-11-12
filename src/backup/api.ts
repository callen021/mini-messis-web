import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type Json } from '@/lib/database.types';
import { qk } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { type ImportPayload } from './legacy';
import { type DbErrorLike, dbError } from '@/lib/errors';

const fail = (error: DbErrorLike | null) => {
  if (error) throw dbError(error);
};

/** Everything a team import can touch. */
function useInvalidateTeam(teamId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.team(teamId) });
    void qc.invalidateQueries({ queryKey: ['memberships'] });
    void qc.invalidateQueries({ queryKey: ['team', teamId] });
    void qc.invalidateQueries({ queryKey: ['game'] });
  };
}

export function useImportBackup(teamId: string) {
  const invalidate = useInvalidateTeam(teamId);
  return useMutation({
    mutationFn: async (payload: ImportPayload) => {
      const { data, error } = await supabase.rpc('import_legacy_backup', {
        p_team_id: teamId,
        p_data: payload as unknown as Json,
      });
      fail(error);
      return data as { players: number; games: number; events: number };
    },
    onSettled: invalidate,
  });
}

/** Owner only: archive the team (members lose access; nothing is hard-deleted). */
export function useArchiveTeam(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      fail(
        (await supabase.from('teams').update({ archived_at: new Date().toISOString() }).eq('id', teamId))
          .error,
      ),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['memberships'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

/** Everything about the team the signed-in user can read, as one JSON document. */
export async function exportTeamBackup(teamId: string): Promise<Record<string, unknown>> {
  const get = async <T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> => {
    const r = await p;
    fail(r.error);
    return r.data;
  };
  const team = await get(supabase.from('teams').select('*').eq('id', teamId).single());
  const players = await get(supabase.from('players').select('*').eq('team_id', teamId).order('sort_order'));
  const seasons = await get(supabase.from('seasons').select('*').eq('team_id', teamId));
  const lineups = await get(supabase.from('lineups').select('*').eq('team_id', teamId).order('period_index'));
  const lineupIds = (lineups ?? []).map((l) => l.id);
  const slots = lineupIds.length
    ? await get(supabase.from('lineup_slots').select('*').in('lineup_id', lineupIds).order('slot_index'))
    : [];
  const games = await get(supabase.from('games').select('*').eq('team_id', teamId).order('game_date'));
  const gameIds = (games ?? []).map((g) => g.id);
  const events = gameIds.length
    ? await get(supabase.from('score_events').select('*').in('game_id', gameIds))
    : [];
  const pas = gameIds.length
    ? await get(supabase.from('plate_appearances').select('*').in('game_id', gameIds))
    : [];
  const gamePlayers = gameIds.length
    ? await get(supabase.from('game_players').select('*').in('game_id', gameIds))
    : [];
  const notes = gameIds.length
    ? ((await supabase.from('game_coach_notes').select('*').in('game_id', gameIds)).data ?? [])
    : [];
  const tests = await get(supabase.from('skill_tests').select('*').eq('team_id', teamId).order('sort_order'));
  const playerIds = (players ?? []).map((p) => p.id);
  const results = playerIds.length
    ? await get(supabase.from('skill_results').select('*').in('player_id', playerIds))
    : [];
  const { join_code: _code, ...teamSafe } = team as NonNullable<typeof team>;
  return {
    format: 'mini-messis-web-v1',
    exported_at: new Date().toISOString(),
    team: teamSafe,
    seasons,
    players,
    lineups,
    lineup_slots: slots,
    games,
    score_events: events,
    plate_appearances: pas,
    game_players: gamePlayers,
    game_coach_notes: notes,
    skill_tests: tests,
    skill_results: results,
  };
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
