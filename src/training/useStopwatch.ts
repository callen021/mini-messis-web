import { useCallback, useEffect, useRef, useState } from 'react';
import { toTenths } from './times';

/**
 * The stopwatch's clock (D129, D137): one implementation behind the Cone Dribbling stopwatch and
 * the one on the skill result sheets. It measures to a tenth of a second, and what it shows while
 * running is what `stop` returns.
 */
export function useStopwatch() {
  const since = useRef<number | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    let frame = window.requestAnimationFrame(function tick() {
      if (since.current !== null) setElapsed(performance.now() - since.current);
      frame = window.requestAnimationFrame(tick);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [running]);

  const start = useCallback(() => {
    since.current = performance.now();
    setElapsed(0);
    setRunning(true);
  }, []);

  /** Stops the clock and returns the time in seconds; 0 for a tap too quick to be a run, or when not running. */
  const stop = useCallback((): number => {
    if (since.current === null) return 0;
    const seconds = toTenths(performance.now() - since.current);
    since.current = null;
    setRunning(false);
    return seconds;
  }, []);

  return { running, seconds: toTenths(elapsed), start, stop };
}
