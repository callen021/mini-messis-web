import { cn } from '@/lib/cn';
import { type ClockState, elapsedAt, formatClock, isRunning, remainingAt } from './clock';
import { useServerNow } from './useNow';

/**
 * The clock in a card header (D66): "12:05" counting up, or "7:55" left with a period length,
 * red once over. The label says which it is for screen readers and tiny screens. It ticks on
 * its own (D95), so the page and any open sheet around it are not re-rendered every second.
 */
export function ClockDisplay({
  state,
  periodMinutes,
  fullTime,
}: {
  state: ClockState;
  periodMinutes: number | null;
  fullTime: boolean;
}) {
  const nowMs = useServerNow(!fullTime && isRunning(state));
  if (fullTime) {
    return (
      <span className="gclock done" aria-label="Full time">
        <b>FT</b>
      </span>
    );
  }
  const elapsed = elapsedAt(state, nowMs);
  const left = remainingAt(state, periodMinutes, nowMs);
  const over = left !== null && left <= 0;
  const text = left === null ? formatClock(elapsed) : formatClock(Math.max(0, left));
  const label =
    left === null
      ? `Clock ${formatClock(elapsed)}${isRunning(state) ? ', running' : ', paused'}`
      : over
        ? `Time: ${formatClock(elapsed)} played, ${formatClock(-left)} over`
        : `${formatClock(left)} left${isRunning(state) ? ', running' : ', paused'}`;
  return (
    <span
      className={cn('gclock', isRunning(state) && 'run', over && 'over')}
      aria-label={label}
      title={label}
    >
      <b>{over ? formatClock(elapsed) : text}</b>
      <small>{left === null ? (isRunning(state) ? 'live' : 'paused') : over ? 'over' : 'left'}</small>
    </span>
  );
}
