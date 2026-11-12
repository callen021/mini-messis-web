import { useEffect, useState } from 'react';
import { serverNow } from './serverTime';

/**
 * Re-renders every `stepMs` and returns the server's "now" in ms. The clock itself is derived from
 * timestamps each time (never incremented), so a tab that slept catches up on its first tick.
 */
export function useServerNow(active: boolean, stepMs = 1000): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(serverNow()), stepMs);
    const onVisible = () => document.visibilityState === 'visible' && setNow(serverNow());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active, stepMs]);
  return now;
}
