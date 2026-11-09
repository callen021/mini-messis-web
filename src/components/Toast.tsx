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
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback<ToastFn>((msg) => {
    setMessage(msg);
    setShow(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShow(false), TOAST_DURATION_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={cn('toast', show && 'show')} role="status" aria-live="polite" aria-atomic="true">
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
