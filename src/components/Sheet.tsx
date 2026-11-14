import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { useFocusTrap, useScrollLock } from './useFocusTrap';

const EXIT_MS = 260;

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  children: ReactNode;
}

/**
 * Bottom sheet primitive: dimmed backdrop, slide-up panel, focus trap, Escape/backdrop to close,
 * body scroll lock. Content stays mounted during the exit animation.
 */
export function Sheet({ open, onClose, label, children }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  // `exited` flips true once the close animation has had time to run; `shown` drives the CSS
  // transition one frame after mount. Both are reset synchronously during render when `open`
  // changes (the "adjust state while rendering" pattern), so no setState happens inside an effect body.
  const [exited, setExited] = useState(!open);
  const [shown, setShown] = useState(false);
  if (open && exited) setExited(false);
  if (!open && shown) setShown(false);

  useEffect(() => {
    if (open) return;
    // a field still focused inside the closing sheet is blurred now, so the keyboard reset
    // (D111, D112) runs before the sheet unmounts it
    const active = document.activeElement;
    if (active instanceof HTMLElement && ref.current?.contains(active)) active.blur();
    const t = window.setTimeout(() => setExited(true), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useFocusTrap(ref, open, onClose);
  useScrollLock(open);

  const mounted = open || !exited;
  if (!mounted) return null;

  const onBackdrop = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    // The backdrop is a click target only to dismiss; keyboard users dismiss with Escape.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div className={cn('backdrop', shown && 'show')} onClick={onBackdrop} data-testid="sheet-backdrop">
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Rounded group inside a sheet. */
export function SheetGroup({ children }: { children: ReactNode }) {
  return <div className="grp">{children}</div>;
}

/** Centered title/message at the top of a group. */
export function SheetHeader({ title, message }: { title?: ReactNode; message?: ReactNode }) {
  if (title === undefined && message === undefined) return null;
  return (
    <div className="hd">
      {title !== undefined && <b>{title}</b>}
      {message}
    </div>
  );
}

/** Full-width action in a group. */
export function SheetButton({
  children,
  onClick,
  destructive,
  cancel,
  initialFocus,
}: {
  children: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  cancel?: boolean;
  /** Receive focus when the sheet opens (the focus trap prefers `[data-autofocus]`). */
  initialFocus?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(destructive && 'destructive', cancel && 'cancel')}
      onClick={onClick}
      data-autofocus={initialFocus ? '' : undefined}
    >
      {children}
    </button>
  );
}

/* ---------- form sheet ---------- */

export interface FormSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Defaults to the title. */
  label?: string;
  /** Cancel button text; null hides it. */
  cancel?: string | null;
  children: ReactNode;
}

/** A sheet holding a form (`.form` grid of Fields and Buttons) plus a Cancel group. */
export function FormSheet({ open, onClose, title, label, cancel = 'Cancel', children }: FormSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} label={label ?? title ?? 'Form'}>
      <SheetGroup>
        <div className="form">
          {title && <h3>{title}</h3>}
          {children}
        </div>
      </SheetGroup>
      {cancel && (
        <SheetGroup>
          <SheetButton cancel onClick={onClose}>
            {cancel}
          </SheetButton>
        </SheetGroup>
      )}
    </Sheet>
  );
}

/* ---------- imperative action sheet ---------- */

export interface ActionSheetAction<T> {
  label: string;
  value: T;
  destructive?: boolean;
}

export interface ActionSheetOptions<T> {
  title?: string;
  message?: string;
  actions?: readonly ActionSheetAction<T>[];
  /** Cancel button text; null hides it (use for info sheets with an "OK" action). */
  cancel?: string | null;
}

type ShowFn = <T>(options: ActionSheetOptions<T>) => Promise<T | null>;

interface Pending {
  options: ActionSheetOptions<unknown>;
  resolve: (value: unknown) => void;
}

const ActionSheetContext = createContext<ShowFn | null>(null);

/**
 * Provides `useActionSheet()`: `const choice = await sheet({ title, message, actions })`.
 * Resolves with the chosen action's value, or null on Cancel / Escape / backdrop.
 */
export function ActionSheetProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);
  const settled = useRef(false);

  const show = useCallback<ShowFn>(
    <T,>(options: ActionSheetOptions<T>) =>
      new Promise<T | null>((resolve) => {
        settled.current = false;
        setPending({
          options: options as ActionSheetOptions<unknown>,
          resolve: (v) => resolve(v as T | null),
        });
        setOpen(true);
      }),
    [],
  );

  const close = useCallback(
    (value: unknown) => {
      if (!settled.current) {
        settled.current = true;
        pending?.resolve(value);
      }
      setOpen(false);
    },
    [pending],
  );
  const cancel = useCallback(() => close(null), [close]);

  const value = useMemo(() => show, [show]);
  const o = pending?.options;
  const cancelLabel = o?.cancel === undefined ? 'Cancel' : o.cancel;

  return (
    <ActionSheetContext.Provider value={value}>
      {children}
      <Sheet open={open} onClose={cancel} label={o?.title ?? 'Choose an action'}>
        {o && (
          <>
            <SheetGroup>
              <SheetHeader title={o.title} message={o.message} />
              {o.actions?.map((a, i) => (
                <SheetButton key={i} destructive={a.destructive} onClick={() => close(a.value)}>
                  {a.label}
                </SheetButton>
              ))}
            </SheetGroup>
            {cancelLabel && (
              <SheetGroup>
                <SheetButton cancel onClick={cancel} initialFocus>
                  {cancelLabel}
                </SheetButton>
              </SheetGroup>
            )}
          </>
        )}
      </Sheet>
    </ActionSheetContext.Provider>
  );
}

export function useActionSheet(): ShowFn {
  const fn = useContext(ActionSheetContext);
  if (!fn) throw new Error('useActionSheet must be used inside <ActionSheetProvider>');
  return fn;
}
