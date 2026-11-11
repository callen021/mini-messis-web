import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { keyPlayers, resultsKey, useAddSkillResults, useSkillResults } from '../api';

/**
 * D59: a per-player results query must be keyed by the player ids, never by how many ids there
 * are. Before the fix, Nolan's page and Teddy's page shared the cache entry
 * ['team', t, 'skill-results', 1], so Teddy's page opened with Nolan's results (and "1 results"
 * with nothing listed once the optimistic add had pushed a row into every results cache).
 */

const byPlayer: Record<string, { id: string; player_id: string; skill_test_id: string; value: number }[]> = {
  nolan: [{ id: 'r1', player_id: 'nolan', skill_test_id: 'jug', value: 17 }],
  teddy: [],
};
let inserted: unknown[] = [];
let releaseInsert: () => void = () => undefined;

vi.mock('@/lib/supabase', () => {
  const from = (table: string) => ({
    select: () => ({
      in: (_col: string, ids: string[]) => ({
        order: () => ({
          order: async () => ({ data: ids.flatMap((id) => byPlayer[id] ?? []), error: null }),
        }),
      }),
    }),
    insert: (rows: unknown[]) =>
      new Promise<{ error: null }>((resolve) => {
        releaseInsert = () => {
          if (table === 'skill_results') inserted = rows;
          resolve({ error: null });
        };
      }),
  });
  return { supabase: { from } };
});

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('skill results cache scoping (D59)', () => {
  it('keys carry the player ids, so two single-player pages never share an entry', () => {
    expect(resultsKey('t', ['nolan'])).not.toEqual(resultsKey('t', ['teddy']));
    expect(resultsKey('t', ['b', 'a'])).toEqual(resultsKey('t', ['a', 'b']));
    expect([...keyPlayers(resultsKey('t', ['a', 'b']))]).toEqual(['a', 'b']);
    expect(keyPlayers(['team', 't', 'skill-results']).size).toBe(0);
  });

  it("opening Teddy's page after Nolan's shows Teddy's (empty) results, not Nolan's", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const w = wrapper(client);
    const nolan = renderHook(() => useSkillResults('t', ['nolan']), { wrapper: w });
    await waitFor(() => expect(nolan.result.current.data).toHaveLength(1));
    const teddy = renderHook(() => useSkillResults('t', ['teddy']), { wrapper: w });
    // never served from Nolan's cache, not even for a frame
    expect(teddy.result.current.data).toBeUndefined();
    await waitFor(() => expect(teddy.result.current.isSuccess).toBe(true));
    expect(teddy.result.current.data).toEqual([]);
  });

  it('an optimistic add lands only in the caches that cover that player', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const w = wrapper(client);
    const nolan = renderHook(() => useSkillResults('t', ['nolan']), { wrapper: w });
    const teddy = renderHook(() => useSkillResults('t', ['teddy']), { wrapper: w });
    const both = renderHook(() => useSkillResults('t', ['nolan', 'teddy']), { wrapper: w });
    await waitFor(() => expect(both.result.current.isSuccess && teddy.result.current.isSuccess).toBe(true));
    const add = renderHook(() => useAddSkillResults('t'), { wrapper: w });
    await act(async () => {
      add.result.current.mutate([{ player_id: 'nolan', skill_test_id: 'jug', value: 20 }]);
      await Promise.resolve(); // the insert is held open, so the caches are in their optimistic state
      await Promise.resolve();
    });
    const teddyCache = client.getQueryData<unknown[]>(resultsKey('t', ['teddy']));
    const nolanCache = client.getQueryData<unknown[]>(resultsKey('t', ['nolan']));
    const bothCache = client.getQueryData<unknown[]>(resultsKey('t', ['nolan', 'teddy']));
    expect(teddyCache).toEqual([]);
    expect(nolanCache?.length).toBe(2);
    expect(bothCache?.length).toBe(2);
    act(() => releaseInsert());
    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(nolan.result.current.data?.length).toBeGreaterThanOrEqual(1);
  });
});
