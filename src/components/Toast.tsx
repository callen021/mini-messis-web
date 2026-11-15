import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/cn';

export const TOAST_DURATION_MS = 1800;
/** A toast carrying an action stays long enough to tap it (D113). */
export const TOAST_ACTION_MS = 5000;

export interface ToastOptions {
  /** One small button inside the toast, e.g. Undo; the toast closes when it is tapped. */
  action?: { label: string; onClick: () => void };
  /** How long the toast stays; defaults to the action length when there is an action. */
  duration?: number;
}

type ToastFn = (message: string, options?: ToastOptions) => void;

const ToastContext = createContext<ToastFn | null>(null);

/** Hosts the single bottom toast. A new message replaces the current one and restarts the timer. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const [action, setAction] = useState<ToastOptions['action'] | null>(null);
  const [show, setShow] = useState(false);
  // px from the viewport bottom when a sticky action bar is on screen: the toast sits just above it (D80)
  const [lift, setLift] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback<ToastFn>((msg, options) => {
    setMessage(msg);
    setAction(options?.action ?? null);
    const bar = document.querySelector<HTMLElement>('.actionbar')?.getBoundingClientRect();
    setLift(bar && bar.top < window.innerHeight && bar.bottom > 0 ? window.innerHeight - bar.top + 12 : null);
    setShow(true);
    window.clearTimeout(timer.current);
    const ms = options?.duration ?? (options?.action ? TOAST_ACTION_MS : TOAST_DURATION_MS);
    timer.current = window.setTimeout(() => setShow(false), ms);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const value = useMemo(() => toast, [toast]);

  const onAction = () => {
    window.clearTimeout(timer.current);
    setShow(false);
    action?.onClick();
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className={cn('toast', show && 'show', action && 'hasaction')}
        style={lift !== null ? { bottom: lift } : undefined}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span>{message}</span>
        {action && show && (
          <button type="button" className="toastact" onClick={onAction}>
            {action.label}
          </button>
        )}
      </div>
    </ToastContext.Provider>
  );
}

/** `const toast = useToast(); toast('Saved')`, or `toast('Nolan on for Ava', { action: { label: 'Undo', onClick } })`. */
export function useToast(): ToastFn {
  const fn = useContext(ToastContext);
  if (!fn) throw new Error('useToast must be used inside <ToastProvider>');
  return fn;
}
