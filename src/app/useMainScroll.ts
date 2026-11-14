import { type RefObject, useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router';
import { resetViewport } from './useViewportReset';

const KEY = 'main-scroll';

function load(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
function save(map: Record<string, number>) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* private mode: positions live for this page load only */
  }
}

/**
 * Scroll restoration for the app shell (D110): the document never scrolls, `main` does, so the
 * router's own restoration (which watches the window) is replaced by this. A new page starts at
 * the top; going back (POP) returns to where that page was, keyed by the history entry.
 */
export function useMainScroll(ref: RefObject<HTMLElement | null>) {
  const location = useLocation();
  const navType = useNavigationType();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const key = location.key;
    const saved = load()[key];
    el.scrollTop = navType === 'POP' && saved !== undefined ? saved : 0;
    // a leftover keyboard offset never survives a route change (D112)
    resetViewport();
    return () => {
      const map = load();
      map[key] = el.scrollTop;
      // keep the map small: the last 50 entries
      save(Object.fromEntries(Object.entries(map).slice(-50)));
    };
  }, [ref, location.key, navType]);
}
