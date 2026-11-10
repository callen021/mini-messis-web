import { useMutationState } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

/**
 * Offline tolerance (BUILD-PROMPT §1): mutations are optimistic (D24) and, while the device is
 * offline, TanStack Query pauses them (`networkMode: 'online'`) and resumes them in order when
 * `navigator.onLine` flips back. Network failures that slip through (a request that times out at
 * the edge of signal) are retried with backoff; server-side refusals (RLS, validation) are not,
 * since they would fail again. Last write wins; there is no merge.
 */

/** True for errors thrown by fetch itself (no response), as supabase-js surfaces them. */
export function isNetworkError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error ?? '');
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|ERR_INTERNET_DISCONNECTED|ECONNRESET|ETIMEDOUT/i.test(
    message,
  );
}

export const MUTATION_RETRIES = 3;

/** Retry policy for mutations: network failures only, up to MUTATION_RETRIES times. */
export function shouldRetryMutation(failureCount: number, error: unknown): boolean {
  return failureCount < MUTATION_RETRIES && isNetworkError(error);
}

/** 1s, 2s, 4s … capped at 15s. */
export function mutationRetryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 15_000);
}

const subscribeOnline = (cb: () => void) => onlineManager.subscribe(cb);
const getOnline = () => onlineManager.isOnline();
const getOnlineServer = () => true;

/** Live `navigator.onLine` as TanStack Query sees it. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, getOnline, getOnlineServer);
}

export interface SyncStatus {
  online: boolean;
  /** Mutations not yet acknowledged by the server (in flight, retrying, or paused offline). */
  pending: number;
  /** Of those, how many are waiting for the connection to come back. */
  paused: number;
}

/** What the sync banner shows: are we online, and how many changes are still unsaved. */
export function useSyncStatus(): SyncStatus {
  const online = useIsOnline();
  const states = useMutationState({
    filters: { status: 'pending' },
    select: (m) => m.state.isPaused,
  });
  return { online, pending: states.length, paused: states.filter(Boolean).length };
}
