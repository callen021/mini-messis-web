import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { type Enums, type Tables, type TablesInsert } from '@/lib/database.types';
import { qk } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { type PlayerStatRow } from './stats';
import { type DbErrorLike, dbError } from '@/lib/errors';

export type Game = Tables<'games'>;
export type ScoreEvent = Tables<'score_events'>;
export type PlateAppearance = Tables<'plate_appearances'>;
export type GamePlayer = Tables<'game_players'>;
export type Season = Tables<'seasons'>;
export type HomeAway = Enums<'home_away'>;
export type ScoreSide = Enums<'score_side'>;
export type PaResult = Enums<'pa_result'>;

export interface GameWithScore extends Game {
  us: number;
  them: number;
}

function unwrap<T>(res: { data: T; error: DbErrorLike | null }): NonNullable<T> {
  if (res.error) throw dbError(res.error);
  if (res.data === null || res.data === undefined) throw new Error('No data returned');
  return res.data as NonNullable<T>;
}
const fail = (error: DbErrorLike | null) => {
  if (error) throw dbError(error);
};

/** Generic optimistic list mutation: apply the change to the cached list, roll back on error, refetch after. */
function useListMutation<TRow, TArgs>(
  key: QueryKey,
  mutationFn: (args: TArgs) => Promise<void>,
  apply: (rows: TRow[], args: TArgs) => TRow[],
  alsoInvalidate: readonly QueryKey[] = [],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<TRow[]>(key);
      if (previous) qc.setQueryData(key, apply(previous, args));
      return { previous };
    },
    onError: (_e, _a, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      for (const k of alsoInvalidate) void qc.invalidateQueries({ queryKey: k });
    },
  });
}

const tempId = () => `temp-${Math.random().toString(36).slice(2)}`;

/* ---------- seasons ---------- */

function useSeasonRows<T>(teamId: string, select: (rows: Season[]) => T) {
  return useQuery({
    queryKey: qk.seasons(teamId),
    queryFn: async () =>
      unwrap(await supabase.from('seasons').select('*').eq('team_id', teamId).order('created_at')),
    select,
    staleTime: 5 * 60_000,
  });
}
const pickCurrent = (rows: Season[]) => rows.find((s) => s.is_current) ?? rows[rows.length - 1] ?? null;
const newestFirst = (rows: Season[]) => [...rows].reverse();

export function useCurrentSeason(teamId: string) {
  return useSeasonRows(teamId, pickCurrent);
}

/** Every season of the team, newest first (the picker on Stats, the admin's switch, D94). */
export function useSeasons(teamId: string) {
  return useSeasonRows(teamId, newestFirst);
}

/** The season whose games and stats are being looked at: a past one, or the current one. */
export function seasonLabel(seasons: readonly Season[], seasonId: string | null): string {
  const s = seasonId ? seasons.find((x) => x.id === seasonId) : seasons.find((x) => x.is_current);
  return s?.name ?? '';
}

export interface StartSeasonInput {
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  notReturning: string[];
}

/** Start a new season on the same team (coach or admin, D94): one transaction on the server. */
export function useStartSeason(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StartSeasonInput) =>
      unwrap(
        await supabase.rpc('start_season', {
          p_team_id: teamId,
          p_name: input.name,
          p_starts_on: input.startsOn ?? undefined,
          p_ends_on: input.endsOn ?? undefined,
          p_not_returning: input.notReturning,
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['team', teamId] });
      void qc.invalidateQueries({ queryKey: ['memberships'] });
      void qc.invalidateQueries({ queryKey: ['guardians'] });
    },
  });
}

/** Admin only: make an earlier season current again (D94). */
export function useSetCurrentSeason(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (seasonId: string) =>
      fail((await supabase.rpc('set_current_season', { p_team_id: teamId, p_season_id: seasonId })).error),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['team', teamId] });
    },
  });
}

/* ---------- games ---------- */

async function attachScores<T extends Game>(games: T[]): Promise<(T & { us: number; them: number })[]> {
  if (!games.length) return [];
  // a definer RPC: parents on an 'own' team cannot sum the log themselves (D56)
  const scores = unwrap(await supabase.rpc('game_scores_for', { p_game_ids: games.map((g) => g.id) }));
  const byId = new Map(scores.map((s) => [s.game_id, s]));
  return games.map((g) => ({ ...g, us: byId.get(g.id)?.us ?? 0, them: byId.get(g.id)?.them ?? 0 }));
}

/** Every game of the team, newest first (legacy sort: date desc, then created desc). */
export function useGames(teamId: string) {
  return useQuery({
    queryKey: qk.games(teamId),
    queryFn: async () => {
      const games = unwrap(
        await supabase
          .from('games')
          .select('*')
          .eq('team_id', teamId)
          .order('game_date', { ascending: false })
          .order('created_at', { ascending: false }),
      );
      return attachScores(games);
    },
  });
}

export function useGame(gameId: string | undefined) {
  return useQuery({
    queryKey: qk.game(gameId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId as string)
        .maybeSingle();
      if (error) throw dbError(error);
      if (!data) return null;
      return (await attachScores([data]))[0] ?? null;
    },
    enabled: !!gameId,
  });
}

export interface NewGameInput {
  opponent: string;
  game_date: string;
  start_time: string | null;
  location: string | null;
  /** Street address for Directions and the calendar export (D50). */
  address?: string | null;
  home_away: HomeAway | null;
  parent_notes: string | null;
  /** Start it right away (legacy "Start game now"). */
  start: boolean;
}

/** Invalidate everything a game lifecycle change can touch. */
function useInvalidateGameLifecycle(teamId: string) {
  const qc = useQueryClient();
  return (gameId?: string) => {
    void qc.invalidateQueries({ queryKey: qk.games(teamId) });
    void qc.invalidateQueries({ queryKey: qk.liveGame(teamId) });
    void qc.invalidateQueries({ queryKey: ['team', teamId, 'lineups'] });
    void qc.invalidateQueries({ queryKey: ['team', teamId, 'stats'] });
    if (gameId) void qc.invalidateQueries({ queryKey: qk.game(gameId) });
  };
}

export function useCreateGame(teamId: string) {
  const invalidate = useInvalidateGameLifecycle(teamId);
  return useMutation({
    mutationFn: async (input: NewGameInput): Promise<Game> => {
      let season = (
        await supabase.from('seasons').select('*').eq('team_id', teamId).eq('is_current', true).maybeSingle()
      ).data;
      if (!season) {
        season = unwrap(
          await supabase
            .from('seasons')
            .insert({ team_id: teamId, name: `${new Date().getFullYear()} season`, is_current: true })
            .select()
            .single(),
        );
      }
      const row: TablesInsert<'games'> = {
        team_id: teamId,
        season_id: season.id,
        opponent: input.opponent.trim().slice(0, 40) || 'Opponent',
        game_date: input.game_date,
        start_time: input.start_time,
        location: input.location?.trim() || null,
        address: input.address?.trim().slice(0, 200) || null,
        home_away: input.home_away,
        parent_notes: input.parent_notes?.trim() || null,
      };
      const game = unwrap(await supabase.from('games').insert(row).select().single());
      if (input.start) fail((await supabase.rpc('start_game', { p_game_id: game.id })).error);
      return game;
    },
    onSuccess: (g) => invalidate(g.id),
  });
}

export type GamePatch = Partial<
  Pick<Game, 'opponent' | 'game_date' | 'start_time' | 'location' | 'address' | 'home_away' | 'parent_notes'>
>;

/** Edit schedule fields; optimistic on the detail query. */
export function useUpdateGame(teamId: string, gameId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: GamePatch) =>
      fail((await supabase.from('games').update(patch).eq('id', gameId)).error),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.game(gameId) });
      const previous = qc.getQueryData<GameWithScore | null>(qk.game(gameId));
      if (previous) qc.setQueryData(qk.game(gameId), { ...previous, ...patch });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(qk.game(gameId), ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.game(gameId) });
      void qc.invalidateQueries({ queryKey: qk.games(teamId) });
      void qc.invalidateQueries({ queryKey: qk.liveGame(teamId) });
    },
  });
}

export function useStartGame(teamId: string) {
  const invalidate = useInvalidateGameLifecycle(teamId);
  return useMutation({
    mutationFn: async (gameId: string) =>
      fail((await supabase.rpc('start_game', { p_game_id: gameId })).error),
    onSettled: (_d, _e, gameId) => invalidate(gameId),
  });
}

export function useFinishGame(teamId: string) {
  const invalidate = useInvalidateGameLifecycle(teamId);
  return useMutation({
    mutationFn: async (gameId: string) =>
      fail((await supabase.rpc('finish_game', { p_game_id: gameId })).error),
    onSettled: (_d, _e, gameId) => invalidate(gameId),
  });
}

export function useDeleteGame(teamId: string) {
  const invalidate = useInvalidateGameLifecycle(teamId);
  return useMutation({
    mutationFn: async (gameId: string) =>
      fail((await supabase.from('games').delete().eq('id', gameId)).error),
    onSettled: (_d, _e, gameId) => invalidate(gameId),
  });
}

/* ---------- snapshots ---------- */

export function useGamePlayers(gameId: string | undefined) {
  return useQuery({
    queryKey: qk.gamePlayers(gameId ?? ''),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('game_players')
          .select('*')
          .eq('game_id', gameId as string),
      ),
    enabled: !!gameId,
  });
}

/* ---------- scoring log ---------- */

/** A log row as the viewer may see it: `hidden` marks a scorer withheld by the team's stats setting (D56). */
export type VisibleScoreEvent = ScoreEvent & { hidden?: boolean };

export function useScoreEvents(gameId: string | undefined) {
  return useQuery({
    queryKey: qk.scoreEvents(gameId ?? ''),
    queryFn: async () =>
      unwrap(await supabase.rpc('game_events', { p_game_id: gameId as string })) as VisibleScoreEvent[],
    enabled: !!gameId,
  });
}

export interface NewScoreEvent {
  side: ScoreSide;
  period_index: number;
  event_type: string;
  points: number;
  scorer_player_id: string | null;
  assist_player_id: string | null;
  /** Clock mode (D68): the clock second; the server stamps it during a live clock game when absent. */
  clock_seconds?: number | null;
}

/** Keys that show a game's score somewhere else (list, live card, stats). */
const scoreDependents = (teamId: string, gameId: string): QueryKey[] => [
  qk.game(gameId),
  qk.games(teamId),
  qk.liveGame(teamId),
  ['team', teamId, 'stats'],
];

export function useAddScoreEvent(teamId: string, gameId: string) {
  return useListMutation<ScoreEvent, NewScoreEvent>(
    qk.scoreEvents(gameId),
    async (ev) =>
      fail(
        (
          await supabase.from('score_events').insert({
            game_id: gameId,
            side: ev.side,
            period_index: ev.period_index,
            event_type: ev.event_type,
            points: ev.points,
            scorer_player_id: ev.side === 'us' ? ev.scorer_player_id : null,
            assist_player_id:
              ev.side === 'us' && ev.assist_player_id !== ev.scorer_player_id ? ev.assist_player_id : null,
          })
        ).error,
      ),
    (rows, ev) => [
      ...rows,
      {
        id: tempId(),
        game_id: gameId,
        side: ev.side,
        period_index: ev.period_index,
        event_type: ev.event_type,
        points: ev.points,
        scorer_player_id: ev.side === 'us' ? ev.scorer_player_id : null,
        assist_player_id: ev.side === 'us' ? ev.assist_player_id : null,
        occurred_at: new Date().toISOString(),
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: null,
        clock_seconds: ev.clock_seconds ?? null,
      },
    ],
    scoreDependents(teamId, gameId),
  );
}

export type ScoreEventPatch = Partial<
  Pick<
    ScoreEvent,
    | 'side'
    | 'period_index'
    | 'event_type'
    | 'points'
    | 'scorer_player_id'
    | 'assist_player_id'
    | 'clock_seconds'
  >
>;

export function useUpdateScoreEvent(teamId: string, gameId: string) {
  return useListMutation<ScoreEvent, { id: string } & ScoreEventPatch>(
    qk.scoreEvents(gameId),
    async ({ id, ...patch }) => fail((await supabase.from('score_events').update(patch).eq('id', id)).error),
    (rows, { id, ...patch }) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    scoreDependents(teamId, gameId),
  );
}

export function useDeleteScoreEvent(teamId: string, gameId: string) {
  return useListMutation<ScoreEvent, string>(
    qk.scoreEvents(gameId),
    async (id) => fail((await supabase.from('score_events').delete().eq('id', id)).error),
    (rows, id) => rows.filter((r) => r.id !== id),
    scoreDependents(teamId, gameId),
  );
}

/* ---------- baseball batting log ---------- */

/** An at-bat as the viewer may see it: `player_id` is null and `hidden` true when withheld (D56). */
export type VisiblePlateAppearance = Omit<PlateAppearance, 'player_id'> & {
  player_id: string | null;
  hidden?: boolean;
};

export function usePlateAppearances(gameId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.plateAppearances(gameId ?? ''),
    queryFn: async () =>
      unwrap(
        await supabase.rpc('game_plate_appearances', { p_game_id: gameId as string }),
      ) as VisiblePlateAppearance[],
    enabled: !!gameId && enabled,
  });
}

export interface NewPlateAppearance {
  player_id: string;
  inning: number;
  result: PaResult;
  rbi: number;
}

const paDependents = (teamId: string): QueryKey[] => [['team', teamId, 'stats']];

export function useAddPlateAppearance(teamId: string, gameId: string) {
  const qc = useQueryClient();
  return useListMutation<PlateAppearance, NewPlateAppearance>(
    qk.plateAppearances(gameId),
    async (pa) => {
      const current = qc.getQueryData<PlateAppearance[]>(qk.plateAppearances(gameId)) ?? [];
      const sequence = current.reduce((m, r) => Math.max(m, r.sequence), -1) + 1;
      fail((await supabase.from('plate_appearances').insert({ game_id: gameId, ...pa, sequence })).error);
    },
    (rows, pa) => [
      ...rows,
      {
        id: tempId(),
        game_id: gameId,
        ...pa,
        sequence: rows.reduce((m, r) => Math.max(m, r.sequence), -1) + 1,
        occurred_at: new Date().toISOString(),
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: null,
      },
    ],
    paDependents(teamId),
  );
}

export function useUpdatePlateAppearance(teamId: string, gameId: string) {
  return useListMutation<
    PlateAppearance,
    { id: string } & Partial<Pick<PlateAppearance, 'player_id' | 'inning' | 'result' | 'rbi'>>
  >(
    qk.plateAppearances(gameId),
    async ({ id, ...patch }) =>
      fail((await supabase.from('plate_appearances').update(patch).eq('id', id)).error),
    (rows, { id, ...patch }) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    paDependents(teamId),
  );
}

export function useDeletePlateAppearance(teamId: string, gameId: string) {
  return useListMutation<PlateAppearance, string>(
    qk.plateAppearances(gameId),
    async (id) => fail((await supabase.from('plate_appearances').delete().eq('id', id)).error),
    (rows, id) => rows.filter((r) => r.id !== id),
    paDependents(teamId),
  );
}

/* ---------- coach notes (staff only; RLS hides the table from parents) ---------- */

export function useCoachNotes(gameId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.coachNotes(gameId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('game_coach_notes')
        .select('notes')
        .eq('game_id', gameId as string)
        .maybeSingle();
      if (error) throw dbError(error);
      return data?.notes ?? '';
    },
    enabled: !!gameId && enabled,
  });
}

export function useSaveCoachNotes(gameId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (notes: string) =>
      fail(
        (
          await supabase
            .from('game_coach_notes')
            .upsert({ game_id: gameId, notes }, { onConflict: 'game_id' })
        ).error,
      ),
    onMutate: async (notes) => {
      await qc.cancelQueries({ queryKey: qk.coachNotes(gameId) });
      const previous = qc.getQueryData<string>(qk.coachNotes(gameId));
      qc.setQueryData(qk.coachNotes(gameId), notes);
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(qk.coachNotes(gameId), ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.coachNotes(gameId) });
    },
  });
}

/* ---------- stats ---------- */

/** Per-player stats for a season (the current one unless `seasonId` is given, D94) or one game. */
export function usePlayerStats(
  teamId: string,
  gameId: string | null,
  enabled = true,
  seasonId: string | null = null,
) {
  return useQuery({
    queryKey: qk.stats(teamId, gameId ?? (seasonId ? `season:${seasonId}` : 'season')),
    queryFn: async () =>
      unwrap(
        await supabase.rpc('player_season_stats', {
          p_team_id: teamId,
          p_game_id: gameId ?? undefined,
          p_season_id: seasonId ?? undefined,
        }),
      ) as PlayerStatRow[],
    enabled,
  });
}

/* ---------- batting order ---------- */

export function useSetBattingOrder(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (playerIds: string[]) =>
      fail((await supabase.rpc('set_batting_order', { p_team_id: teamId, p_player_ids: playerIds })).error),
    onMutate: async (playerIds) => {
      await qc.cancelQueries({ queryKey: qk.players(teamId) });
      const previous = qc.getQueryData<Tables<'players'>[]>(qk.players(teamId));
      if (previous) {
        const pos = new Map(playerIds.map((id, i) => [id, i + 1]));
        qc.setQueryData(
          qk.players(teamId),
          previous.map((p) => ({ ...p, batting_order: pos.get(p.id) ?? p.batting_order })),
        );
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.players(teamId), ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.players(teamId) });
    },
  });
}

/** Who batted last (`teams.last_batter_player_id`); null resets to the top of the order. */
export function useSetLastBatter(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (playerId: string | null) =>
      fail((await supabase.from('teams').update({ last_batter_player_id: playerId }).eq('id', teamId)).error),
    onMutate: async (playerId) => {
      await qc.cancelQueries({ queryKey: qk.team(teamId) });
      const previous = qc.getQueryData<Tables<'teams'>>(qk.team(teamId));
      if (previous) qc.setQueryData(qk.team(teamId), { ...previous, last_batter_player_id: playerId });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.team(teamId), ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.team(teamId) });
      void qc.invalidateQueries({ queryKey: ['memberships'] });
    },
  });
}
