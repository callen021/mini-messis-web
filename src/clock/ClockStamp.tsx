import { type ClockState, elapsedAt, formatClock, isRunning } from './clock';
import { useServerNow } from './useNow';

/**
 * "H1 · 12:34": the period and clock time a goal added now is stamped with (D96). A leaf that
 * ticks on its own, so the sheet around it is never re-rendered by the clock (D95).
 */
export function ClockStamp({ clock, label }: { clock: ClockState; label: string }) {
  const now = useServerNow(isRunning(clock));
  const time = formatClock(elapsedAt(clock, now));
  return <>{label ? `${label} · ${time}` : time}</>;
}
