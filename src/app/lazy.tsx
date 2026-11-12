import { type ComponentType, lazy, Suspense } from 'react';
import { LoadingScreen } from '@/auth/guards';

/**
 * Every page a launch does not need loads on demand (D89): the first paint carries the shell, the
 * sign-in page, the Field and the parent's home tab; the other tabs, settings, the admin console,
 * the board and the one-off screens arrive as small chunks when first opened.
 */
export function lazyPage(load: () => Promise<{ default: ComponentType }>) {
  const C = lazy(load);
  return (
    <Suspense fallback={<LoadingScreen />}>
      <C />
    </Suspense>
  );
}
