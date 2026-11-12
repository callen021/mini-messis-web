import { QueryClient, type Query } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { type PersistedClient } from '@tanstack/react-query-persist-client';
import { mutationRetryDelay, shouldRetryMutation } from './offline';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Coaches re-open the PWA constantly during a game; don't refetch on every focus.
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        // Offline: pause and resume in order when the connection returns (see lib/offline.ts).
        networkMode: 'online',
        retry: shouldRetryMutation,
        retryDelay: mutationRetryDelay,
      },
    },
  });
}

/* ---------- persisted cache (D89) ---------- */

export const PERSIST_KEY = 'mm-query-cache';
/** A day: the last-known screen paints at once and refreshes in the background; older is dropped. */
export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;

/** Queries that are never worth restoring: one-off lookups and anything tied to the clock. */
const NEVER_PERSIST = new Set(['invite', 'server-time', 'game-clock', 'admin']);

/**
 * Successful queries only, except the ones above (the key's first segment) and anything whose
 * data would not survive JSON (a Map or Set comes back as a plain object and crashes the page).
 */
export function shouldDehydrateQuery(query: Query): boolean {
  const head = query.queryKey[0];
  if (typeof head === 'string' && NEVER_PERSIST.has(head)) return false;
  const data: unknown = query.state.data;
  if (data instanceof Map || data instanceof Set) return false;
  return query.state.status === 'success';
}

const storage = (): Storage | undefined => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Restored data is always stale (D89): it paints at once and every mounted query refetches in the
 * background, so a change made right before the app was closed never lingers for the staleTime.
 */
export function deserializeStale(cached: string): PersistedClient {
  const v = JSON.parse(cached) as PersistedClient;
  for (const q of v.clientState.queries) q.state.dataUpdatedAt = 0;
  return v;
}

/** localStorage persister; a no-op storage when it is unavailable (private mode, quota). */
export function makePersister() {
  return createSyncStoragePersister({
    key: PERSIST_KEY,
    storage: storage() ?? null,
    throttleTime: 250,
    deserialize: deserializeStale,
  });
}

/** Drop the persisted cache (sign-out): the next person on this device starts clean. */
export function clearPersistedCache(): void {
  try {
    storage()?.removeItem(PERSIST_KEY);
  } catch {
    /* ignore */
  }
}

/** Changing the build invalidates what was persisted by an older one. */
export const PERSIST_BUSTER: string = import.meta.env.VITE_BUILD_ID ?? 'dev';
