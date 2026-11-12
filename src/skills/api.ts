import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { type Json, type TablesInsert } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { type SportKey } from '@/sports/types';
import { defaultsPayload, type SkillResult, type SkillTest } from './defaults';
import { type DbErrorLike, dbError } from '@/lib/errors';

export const skillKeys = {
  tests: (teamId: string) => ['team', teamId, 'skill-tests'] as const,
  results: (teamId: string) => ['team', teamId, 'skill-results'] as const,
};

function unwrap<T>(res: { data: T; error: DbErrorLike | null }): NonNullable<T> {
  if (res.error) throw dbError(res.error);
  if (res.data === null || res.data === undefined) throw new Error('No data returned');
  return res.data as NonNullable<T>;
}
const fail = (error: DbErrorLike | null) => {
  if (error) throw dbError(error);
};

function useListMutation<TRow, TArgs>(
  key: QueryKey,
  mutationFn: (args: TArgs) => Promise<void>,
  apply: (rows: TRow[], args: TArgs) => TRow[],
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
    },
  });
}
const tempId = () => `temp-${Math.random().toString(36).slice(2)}`;

/* ---------- tests ---------- */

/** Every test of the team, shown and hidden, in display order. */
export function useSkillTests(teamId: string) {
  return useQuery({
    queryKey: skillKeys.tests(teamId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('skill_tests')
          .select('*')
          .eq('team_id', teamId)
          .order('sort_order')
          .order('name'),
      ),
  });
}

export type SkillTestInput = Pick<
  TablesInsert<'skill_tests'>,
  'key' | 'name' | 'instructions' | 'metric' | 'unit' | 'has_sides' | 'higher_is_better' | 'attempts'
>;

export function useAddSkillTest(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SkillTestInput) => {
      const current = qc.getQueryData<SkillTest[]>(skillKeys.tests(teamId)) ?? [];
      const sort_order = current.reduce((m, t) => Math.max(m, t.sort_order), -1) + 1;
      return unwrap(
        await supabase
          .from('skill_tests')
          .insert({ team_id: teamId, ...input, sort_order })
          .select()
          .single(),
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: skillKeys.tests(teamId) });
    },
  });
}

export type SkillTestPatch = Partial<
  Pick<
    SkillTest,
    'name' | 'instructions' | 'metric' | 'unit' | 'has_sides' | 'higher_is_better' | 'attempts' | 'is_active'
  >
>;

export function useUpdateSkillTest(teamId: string) {
  return useListMutation<SkillTest, { id: string } & SkillTestPatch>(
    skillKeys.tests(teamId),
    async ({ id, ...patch }) => fail((await supabase.from('skill_tests').update(patch).eq('id', id)).error),
    (rows, { id, ...patch }) => rows.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  );
}

export function useDeleteSkillTest(teamId: string) {
  return useListMutation<SkillTest, string>(
    skillKeys.tests(teamId),
    async (id) => fail((await supabase.from('skill_tests').delete().eq('id', id)).error),
    (rows, id) => rows.filter((t) => t.id !== id),
  );
}

/** New display order for the shown tests (hidden ones keep their place after them). */
export function useReorderSkillTests(teamId: string) {
  return useListMutation<SkillTest, string[]>(
    skillKeys.tests(teamId),
    async (ids) =>
      fail((await supabase.rpc('set_skill_test_order', { p_team_id: teamId, p_ids: ids })).error),
    (rows, ids) => {
      const pos = new Map(ids.map((id, i) => [id, i]));
      return [...rows]
        .map((t) => ({ ...t, sort_order: pos.get(t.id) ?? t.sort_order }))
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    },
  );
}

/** Re-add missing defaults and un-hide hidden ones; resolves to how many changed. */
export function useRestoreSkillTests(teamId: string, sport: SportKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await supabase.rpc('restore_skill_tests', {
          p_team_id: teamId,
          p_tests: defaultsPayload(sport) as unknown as Json,
        }),
      ),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: skillKeys.tests(teamId) });
    },
  });
}

/* ---------- results ---------- */

/**
 * Cache key for a set of players' results. The key carries the ids themselves (sorted), never
 * just their count: two single-player pages must never share a cache entry (D59).
 */
export const resultsKey = (teamId: string, playerIds: readonly string[]) =>
  [...skillKeys.results(teamId), 'players', [...playerIds].sort().join(',')] as const;

/** The player ids a results cache key covers (the inverse of `resultsKey`). */
export function keyPlayers(key: QueryKey): Set<string> {
  const ids = key[4];
  return new Set(typeof ids === 'string' && ids ? ids.split(',') : []);
}

/** All results for the team's players that the signed-in user may read (RLS trims parents to their children). */
export function useSkillResults(teamId: string, playerIds: readonly string[]) {
  return useQuery({
    queryKey: resultsKey(teamId, playerIds),
    queryFn: async () => {
      if (!playerIds.length) return [] as SkillResult[];
      return unwrap(
        await supabase
          .from('skill_results')
          .select('*')
          .in('player_id', [...playerIds])
          .order('tested_on')
          .order('created_at'),
      );
    },
  });
}

export type SkillResultInput = Pick<
  TablesInsert<'skill_results'>,
  'player_id' | 'skill_test_id' | 'tested_on' | 'value' | 'attempts' | 'side' | 'note'
>;

export function useAddSkillResults(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: SkillResultInput[]) =>
      fail((await supabase.from('skill_results').insert(rows)).error),
    onMutate: async (rows) => {
      const prefix = skillKeys.results(teamId);
      await qc.cancelQueries({ queryKey: prefix });
      const snapshots = qc.getQueriesData<SkillResult[]>({ queryKey: prefix });
      for (const [key, previous] of snapshots) {
        if (!previous) continue;
        // only caches that cover the row's player get the optimistic row (D59)
        const covered = keyPlayers(key);
        const mine = rows.filter((r) => covered.has(r.player_id));
        if (!mine.length) continue;
        const now = new Date().toISOString();
        qc.setQueryData(key, [
          ...previous,
          ...mine.map((r) => ({
            id: tempId(),
            player_id: r.player_id,
            skill_test_id: r.skill_test_id,
            tested_on: r.tested_on ?? now.slice(0, 10),
            value: r.value,
            attempts: r.attempts ?? null,
            side: r.side ?? null,
            note: r.note ?? null,
            recorded_by: null,
            created_at: now,
            updated_at: now,
            updated_by: null,
          })),
        ]);
      }
      return { snapshots };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, previous] of ctx?.snapshots ?? []) qc.setQueryData(key, previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: skillKeys.results(teamId) });
    },
  });
}

export type SkillResultPatch = Partial<
  Pick<SkillResult, 'tested_on' | 'value' | 'attempts' | 'side' | 'note'>
>;

function useResultsMutation<TArgs>(
  teamId: string,
  mutationFn: (args: TArgs) => Promise<void>,
  apply: (rows: SkillResult[], args: TArgs) => SkillResult[],
) {
  const qc = useQueryClient();
  const prefix = skillKeys.results(teamId);
  return useMutation({
    mutationFn,
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: prefix });
      const snapshots = qc.getQueriesData<SkillResult[]>({ queryKey: prefix });
      for (const [key, previous] of snapshots) if (previous) qc.setQueryData(key, apply(previous, args));
      return { snapshots };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, previous] of ctx?.snapshots ?? []) qc.setQueryData(key, previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: prefix });
    },
  });
}

export function useUpdateSkillResult(teamId: string) {
  return useResultsMutation<{ id: string } & SkillResultPatch>(
    teamId,
    async ({ id, ...patch }) => fail((await supabase.from('skill_results').update(patch).eq('id', id)).error),
    (rows, { id, ...patch }) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  );
}

export function useDeleteSkillResult(teamId: string) {
  return useResultsMutation<string>(
    teamId,
    async (id) => fail((await supabase.from('skill_results').delete().eq('id', id)).error),
    (rows, id) => rows.filter((r) => r.id !== id),
  );
}
