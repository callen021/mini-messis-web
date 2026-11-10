import { RouterProvider } from 'react-router';
import { AppCrash, ErrorBoundary } from '@/components/ErrorBoundary';
import { Providers } from './providers';
import { router } from './router';

export function App() {
  return (
    <ErrorBoundary fallback={(error, reset) => <AppCrash error={error} reset={reset} />}>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </ErrorBoundary>
  );
}
