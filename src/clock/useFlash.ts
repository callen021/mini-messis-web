import { useEffect, useRef, useState } from 'react';

/**
 * A short gold flash on the jerseys a completed tap touched (D77), so the second tap gets the
 * same confirmation as the first. Returns the ids flashing now and a function to flash a set.
 */
export function useFlash(ms = 1100): [ReadonlySet<string>, (ids: readonly string[]) => void] {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const flash = (next: readonly string[]) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setIds(new Set(next.filter(Boolean)));
    timer.current = window.setTimeout(() => setIds(new Set()), ms);
  };
  return [ids, flash];
}
