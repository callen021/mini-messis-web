import { QueryClient } from '@tanstack/react-query';
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
