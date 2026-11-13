import { type RefObject, useEffect, useRef } from 'react';

const FOCUSABLE =
  'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest('[hidden]'));
}

/**
 * While `active`: moves focus into `ref` (preferring `[data-autofocus]`), keeps Tab inside it,
 * calls `onEscape` on Escape, and restores focus to the previously focused element afterwards.
 *
 * Initial focus is set once, when the trap becomes active (D95). The escape handler is read
 * through a ref, so a parent that re-renders every second (a live game clock) and hands down a
 * new closure never re-runs the trap and never moves focus out of an open menu or field.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape: () => void,
): void {
  const escape = useRef(onEscape);
  useEffect(() => {
    escape.current = onEscape;
  });
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const raf = requestAnimationFrame(() => {
      const preferred = el.querySelector<HTMLElement>('[data-autofocus]');
      (preferred ?? focusables(el)[0] ?? el).focus({ preventScroll: true });
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        escape.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables(el);
      if (list.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (!first || !last) return;
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !el.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !el.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus({ preventScroll: true });
    };
  }, [ref, active]);
}

/** Prevents the page behind a sheet from scrolling: the body, and the app shell's scroller (D110). */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const main = document.querySelector<HTMLElement>('.app-main');
    const { overflow } = document.body.style;
    const mainOverflow = main?.style.overflowY ?? '';
    document.body.style.overflow = 'hidden';
    if (main) main.style.overflowY = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (main) main.style.overflowY = mainOverflow;
    };
  }, [active]);
}
