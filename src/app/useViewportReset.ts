import { useEffect } from 'react';

/** Everything that can bring up the keyboard. */
const isField = (el: EventTarget | null): el is HTMLElement =>
  el instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

/** Put the window back at the top; the app shell never scrolls the document on purpose (D110). */
export function resetViewport(): void {
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  if (document.documentElement.scrollTop) document.documentElement.scrollTop = 0;
  if (document.body.scrollTop) document.body.scrollTop = 0;
}

/**
 * iOS keyboard fix for the installed app (D111): to reveal a focused field, iOS scrolls the
 * document even though the body is overflow: hidden, and leaves that offset in place when the
 * keyboard closes. Fixed elements then sit that many pixels too high, with the page background
 * showing under the tab bar. So whenever a field loses focus, and whenever the visual viewport is
 * back to full height (the keyboard is gone), the window goes back to the top. Nothing happens
 * while the keyboard is up, so iOS can still scroll a field into view while typing.
 */
export function useViewportReset(): void {
  useEffect(() => {
    const timers = new Set<number>();
    const later = (ms: number) => {
      const t = window.setTimeout(() => {
        timers.delete(t);
        resetViewport();
      }, ms);
      timers.add(t);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!isField(e.target)) return;
      // once right away, once after the keyboard's closing animation
      later(60);
      later(400);
    };
    const vv = window.visualViewport;
    const onViewport = () => {
      // the keyboard is closed when the visual viewport is (nearly) the whole layout viewport
      if (vv && vv.height >= window.innerHeight - 40) resetViewport();
    };
    document.addEventListener('focusout', onFocusOut, true);
    vv?.addEventListener('resize', onViewport);
    vv?.addEventListener('scroll', onViewport);
    return () => {
      document.removeEventListener('focusout', onFocusOut, true);
      vv?.removeEventListener('resize', onViewport);
      vv?.removeEventListener('scroll', onViewport);
      for (const t of timers) window.clearTimeout(t);
    };
  }, []);
}
