import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { ActionSheetProvider } from '@/components/Sheet';
import { ToastProvider } from '@/components/Toast';
import { makeQueryClient } from '@/lib/query-client';
import { useApplyTheme } from '@/lib/theme';

function ThemeEffect() {
  useApplyTheme();
  return null;
}

/** App-wide providers: server-state cache, theme, toast and action-sheet hosts. */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <ThemeEffect />
      <ToastProvider>
        <ActionSheetProvider>{children}</ActionSheetProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
