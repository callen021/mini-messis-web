import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dbError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { type SportKey } from '@/sports/types';
import { type LibraryItemRow, type LibraryItemSummary } from './types';

export const LIBRARY_BUCKET = 'practice-library';

export const libraryKeys = {
  list: (sport: SportKey) => ['library', 'items', sport] as const,
  item: (slug: string) => ['library', 'item', slug] as const,
  override: (teamId: string, itemId: string) => ['team', teamId, 'library-override', itemId] as const,
};

/** Public URL of an image in the library bucket; swapping an image is a change to the stored path. */
export function libraryImageUrl(path: string): string {
  return supabase.storage.from(LIBRARY_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * The sport's items in display order. Row security decides what comes back: published items for
 * everyone, drafts as well for a platform admin (D125). Built-in content changes rarely.
 */
export function useLibraryItems(sport: SportKey) {
  return useQuery({
    queryKey: libraryKeys.list(sport),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LibraryItemSummary[]> => {
      const { data, error } = await supabase
        .from('library_items')
        .select(
          'id, slug, sport, category, title, age_min, age_max, sort_order, is_published, drill_group:content->home->>skill',
        )
        .eq('sport', sport)
        .order('sort_order')
        .order('title');
      if (error) throw dbError(error);
      return data;
    },
  });
}

/** One item with its content; null when the slug is unknown or a draft this user may not see. */
export function useLibraryItem(slug: string | undefined) {
  return useQuery({
    queryKey: libraryKeys.item(slug ?? ''),
    enabled: !!slug,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LibraryItemRow | null> => {
      const { data, error } = await supabase
        .from('library_items')
        .select('*')
        .eq('slug', slug ?? '')
        .maybeSingle();
      if (error) throw dbError(error);
      return data;
    },
  });
}

/**
 * Publish or unpublish an item (D139). Platform admins only; the database refuses anyone else.
 * Everything read from the library is refreshed: the list, the item and the Daily Drills.
 */
export function useSetLibraryPublished() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { itemId: string; published: boolean }) => {
      const { error } = await supabase.rpc('set_library_item_published', {
        p_item_id: v.itemId,
        p_published: v.published,
      });
      if (error) throw dbError(error);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['library'] }),
  });
}

/** The team's changes to an item's setup numbers, as stored ({} when there are none). */
export function useLibraryOverride(teamId: string, itemId: string | undefined) {
  return useQuery({
    queryKey: libraryKeys.override(teamId, itemId ?? ''),
    enabled: !!itemId,
    queryFn: async (): Promise<Record<string, unknown>> => {
      const { data, error } = await supabase
        .from('team_library_overrides')
        .select('params')
        .eq('team_id', teamId)
        .eq('item_id', itemId ?? '')
        .maybeSingle();
      if (error) throw dbError(error);
      const p = data?.params;
      return typeof p === 'object' && p !== null && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
    },
  });
}

/**
 * Save the team's numbers for an item (coaches and assistant coaches; RLS enforces it). An empty
 * object removes the row, which is "Reset to default". Optimistic, and serial per item so quick
 * stepper taps reach the server in order.
 */
export function useSetLibraryOverride(teamId: string, itemId: string) {
  const qc = useQueryClient();
  const key = libraryKeys.override(teamId, itemId);
  return useMutation({
    mutationKey: ['library-override', teamId, itemId],
    scope: { id: `library-override:${teamId}:${itemId}` },
    mutationFn: async (params: Record<string, number>) => {
      const res = Object.keys(params).length
        ? await supabase
            .from('team_library_overrides')
            .upsert({ team_id: teamId, item_id: itemId, params }, { onConflict: 'team_id,item_id' })
        : await supabase.from('team_library_overrides').delete().eq('team_id', teamId).eq('item_id', itemId);
      if (res.error) throw dbError(res.error);
    },
    onMutate: async (params) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Record<string, unknown>>(key);
      qc.setQueryData(key, params);
      return { previous };
    },
    onError: (_e, _p, ctx) => {
      qc.setQueryData(key, ctx?.previous ?? {});
    },
    onSettled: () => {
      // refetch once the last queued tap has landed, so an older answer never overwrites a newer tap
      if (qc.isMutating({ mutationKey: ['library-override', teamId, itemId] }) <= 1)
        void qc.invalidateQueries({ queryKey: key });
    },
  });
}
