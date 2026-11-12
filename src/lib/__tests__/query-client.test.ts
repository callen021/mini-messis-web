import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PERSIST_KEY,
  clearPersistedCache,
  deserializeStale,
  makePersister,
  shouldDehydrateQuery,
} from '../query-client';

describe('persisted query cache (D89)', () => {
  beforeEach(() => localStorage.clear());

  it('persists successful queries, never one-off lookups or the clock', () => {
    const qc = new QueryClient();
    qc.setQueryData(['team', 't1', 'players'], []);
    qc.setQueryData(['invite', 'ABCD2345', 'anon'], { name: 'x' });
    qc.setQueryData(['server-time'], 1);
    qc.setQueryData(['game-clock', 'g1'], {});
    qc.setQueryData(['admin', 'teams'], []);
    qc.setQueryData(['team', 't1', 'directory'], new Map([['p1', ['Pat']]]));
    const q = (key: unknown[]) => {
      const found = qc.getQueryCache().find({ queryKey: key });
      if (!found) throw new Error('query missing');
      return found;
    };
    expect(shouldDehydrateQuery(q(['team', 't1', 'players']))).toBe(true);
    expect(shouldDehydrateQuery(q(['invite', 'ABCD2345', 'anon']))).toBe(false);
    expect(shouldDehydrateQuery(q(['server-time']))).toBe(false);
    expect(shouldDehydrateQuery(q(['game-clock', 'g1']))).toBe(false);
    expect(shouldDehydrateQuery(q(['admin', 'teams']))).toBe(false);
    // a Map would come back from JSON as a plain object
    expect(shouldDehydrateQuery(q(['team', 't1', 'directory']))).toBe(false);
  });

  it('a failed or pending query is not persisted', () => {
    const qc = new QueryClient();
    qc.prefetchQuery({ queryKey: ['team', 't2'], queryFn: () => new Promise(() => undefined) });
    const pending = qc.getQueryCache().find({ queryKey: ['team', 't2'] });
    expect(pending && shouldDehydrateQuery(pending)).toBe(false);
  });

  it('the persister writes to localStorage under one key, and sign-out clears it', async () => {
    const persister = makePersister();
    await persister.persistClient({
      buster: 'b',
      timestamp: Date.now(),
      clientState: { queries: [], mutations: [] },
    });
    await new Promise((r) => setTimeout(r, 400)); // throttled write
    expect(localStorage.getItem(PERSIST_KEY)).not.toBeNull();
    clearPersistedCache();
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull();
  });

  it('restored queries are stale on arrival, so the screen refreshes in the background', () => {
    const cached = JSON.stringify({
      buster: 'b',
      timestamp: Date.now(),
      clientState: {
        mutations: [],
        queries: [
          {
            queryKey: ['team', 't1'],
            queryHash: '["team","t1"]',
            state: { data: { id: 't1' }, dataUpdatedAt: Date.now(), status: 'success' },
          },
        ],
      },
    });
    const v = deserializeStale(cached);
    expect(v.clientState.queries[0]?.state.dataUpdatedAt).toBe(0);
    expect(v.clientState.queries[0]?.state.data).toEqual({ id: 't1' });
  });
});
