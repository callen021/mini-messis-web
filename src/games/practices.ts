import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type TablesInsert } from '@/lib/database.types';
import { qk } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { type Practice } from './recurrence';

export type { Practice } from './recurrence';

function unwrap<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  if (res.data === null || res.data === undefined) throw new Error('No data returned');
  return res.data as NonNullable<T>;
}
const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

/** Every practice of the team (both statuses), oldest first. */
export function usePractices(teamId: string) {
  return useQuery({
    queryKey: qk.practices(teamId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('practices')
          .select('*')
          .eq('team_id', teamId)
          .order('practice_date')
          .order('start_time', { nullsFirst: true }),
      ) as Practice[],
  });
}

export function usePractice(practiceId: string | undefined) {
  return useQuery({
    queryKey: qk.practice(practiceId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('practices')
        .select('*')
        .eq('id', practiceId as string)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as Practice | null) ?? null;
    },
    enabled: !!practiceId,
  });
}

export interface NewPracticesInput {
  /** One date for a single practice, several for a repeating one. */
  dates: string[];
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
}

/** Create one or many practices in the current season (created on the fly if the team has none). */
export function useCreatePractices(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewPracticesInput): Promise<number> => {
      if (!input.dates.length) return 0;
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
      const rows: TablesInsert<'practices'>[] = input.dates.map((d) => ({
        team_id: teamId,
        season_id: season.id,
        practice_date: d,
        start_time: input.start_time,
        end_time: input.end_time,
        location: input.location?.trim().slice(0, 80) || null,
        notes: input.notes?.trim().slice(0, 500) || null,
      }));
      fail((await supabase.from('practices').insert(rows)).error);
      return rows.length;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.practices(teamId) }),
  });
}

export type PracticePatch = Partial<
  Pick<Practice, 'practice_date' | 'start_time' | 'end_time' | 'location' | 'notes' | 'status'>
>;

/** Edit or cancel/restore one practice; optimistic on the detail query. There is no delete (D40). */
export function useUpdatePractice(teamId: string, practiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: PracticePatch) =>
      fail((await supabase.from('practices').update(patch).eq('id', practiceId)).error),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.practice(practiceId) });
      const previous = qc.getQueryData<Practice | null>(qk.practice(practiceId));
      if (previous) qc.setQueryData(qk.practice(practiceId), { ...previous, ...patch });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(qk.practice(practiceId), ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.practice(practiceId) });
      void qc.invalidateQueries({ queryKey: qk.practices(teamId) });
    },
  });
}
