import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { type ReactNode, useState } from 'react';
import { ActionSheetProvider } from '@/components/Sheet';
import { ToastProvider } from '@/components/Toast';
import {
  PERSIST_BUSTER,
  PERSIST_MAX_AGE,
  makePersister,
  makeQueryClient,
  shouldDehydrateQuery,
} from '@/lib/query-client';
import { useApplyTheme } from '@/lib/theme';

function ThemeEffect() {
  useApplyTheme();
  return null;
}

/**
 * App-wide providers: server-state cache (persisted to localStorage so a repeat launch paints the
 * last-known screen at once and refreshes in the background, D89), theme, toast and action-sheet
 * hosts.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  const [persister] = useState(makePersister);
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE,
        buster: PERSIST_BUSTER,
        dehydrateOptions: { shouldDehydrateQuery },
      }}
    >
      <ThemeEffect />
      <ToastProvider>
        <ActionSheetProvider>{children}</ActionSheetProvider>
      </ToastProvider>
    </PersistQueryClientProvider>
  );
}
