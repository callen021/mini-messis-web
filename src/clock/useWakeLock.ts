import { useEffect } from 'react';

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener?: (type: 'release', cb: () => void) => void;
}
interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

/**
 * Keep the screen awake while `active` (a live clock game on the Field, D66), where the browser
 * allows it (Chrome, Safari 16.4+ when installed). The lock drops when the tab is hidden and is
 * re-requested when it comes back; failures are ignored since it is only a convenience.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const wl = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    if (!wl) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let stopped = false;
    const request = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        sentinel = await wl.request('screen');
      } catch {
        sentinel = null;
      }
    };
    const onVisible = () => void request();
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
