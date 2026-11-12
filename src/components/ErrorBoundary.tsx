import { Component, type ErrorInfo, type ReactNode } from 'react';
import { errorMessage } from '@/lib/errors';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Rendered instead of the children after an error; receives a reset callback. */
  fallback: (error: Error, reset: () => void) => ReactNode;
  /** When any of these change, a caught error is cleared and the children render again. */
  resetKeys?: readonly unknown[];
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

const sameKeys = (a: readonly unknown[] = [], b: readonly unknown[] = []) =>
  a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/**
 * Catches render errors below it so one broken screen does not blank the whole app. React Router's
 * `errorElement` covers errors inside routes; this one wraps the router itself (and can wrap any
 * subtree that should fail on its own).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
    if (import.meta.env.DEV) console.error(error, info.componentStack);
  }

  override componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error && !sameKeys(prev.resetKeys, this.props.resetKeys)) this.reset();
  }

  reset = () => this.setState({ error: null });

  override render() {
    return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children;
  }
}

/** Plain-HTML fallback for the outermost boundary, where the router (and its Links) may be gone. */
export function AppCrash({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="app-main">
      <section className="page">
        <h1 className="large">Something went wrong</h1>
        <p className="sub">{errorMessage(error)}</p>
        <div className="group">
          <button type="button" className="row link" onClick={reset}>
            <span className="lbl">Try again</span>
          </button>
          <button type="button" className="row link" onClick={() => window.location.reload()}>
            <span className="lbl">Reload the app</span>
          </button>
        </div>
        <p className="footer">Your data is safe on the server. Reloading usually clears this.</p>
      </section>
    </main>
  );
}
