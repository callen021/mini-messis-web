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

type ToastFn = (message: string) => void;

const ToastContext = createContext<ToastFn | null>(null);

/** Hosts the single bottom toast. A new message replaces the current one and restarts the timer. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const [show, setShow] = useState(false);
  // px from the viewport bottom when a sticky action bar is on screen: the toast sits just above it (D80)
  const [lift, setLift] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback<ToastFn>((msg) => {
    setMessage(msg);
    const bar = document.querySelector<HTMLElement>('.actionbar')?.getBoundingClientRect();
    setLift(bar && bar.top < window.innerHeight && bar.bottom > 0 ? window.innerHeight - bar.top + 12 : null);
    setShow(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShow(false), TOAST_DURATION_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className={cn('toast', show && 'show')}
        style={lift !== null ? { bottom: lift } : undefined}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {message}
      </div>
    </ToastContext.Provider>
  );
}

/** `const toast = useToast(); toast('Saved')` */
export function useToast(): ToastFn {
  const fn = useContext(ToastContext);
  if (!fn) throw new Error('useToast must be used inside <ToastProvider>');
  return fn;
}
