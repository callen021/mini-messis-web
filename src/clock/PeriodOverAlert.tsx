import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useToast } from '@/components/Toast';
import { hapticTick } from '@/lib/haptics';
import { clockKeys } from './api';
import { type ClockState, atLimit, formatClock, isRunning, remainingAt } from './clock';
import { useServerNow } from './useNow';

/**
 * Buzzes and toasts once when a timed period reaches zero (D66); never ends it. Also watches the
 * safety stop (D105): when the running stretch reaches its limit it asks the server for the clock,
 * which settles the pause, and says so once. Renders nothing and ticks on its own (D95): the page
 * around it does not re-render every second.
 */
export function PeriodOverAlert({
  gameId,
  clock,
  periodMinutes,
  active,
  label,
}: {
  gameId: string;
  clock: ClockState;
  periodMinutes: number | null;
  active: boolean;
  /** "H1", "Game" */
  label: string;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const now = useServerNow(active && isRunning(clock));
  const left = active ? remainingAt(clock, periodMinutes, now) : null;
  const capped = active && atLimit(clock, now);
  const cappedAt = useRef<number | null>(null);
  useEffect(() => {
    if (!capped || cappedAt.current === clock.limitSeconds) return;
    cappedAt.current = clock.limitSeconds ?? null;
    toast(`Clock paused automatically at ${formatClock(clock.limitSeconds ?? 0)}`);
    void qc.invalidateQueries({ queryKey: clockKeys.clock(gameId) });
  }, [capped, clock.limitSeconds, gameId, qc, toast]);
  const wasOver = useRef(false);
  useEffect(() => {
    const over = left !== null && left <= 0;
    if (over && !wasOver.current && active) {
      hapticTick();
      window.setTimeout(hapticTick, 150);
      window.setTimeout(hapticTick, 300);
      toast(`Time · ${label} is over`);
    }
    wasOver.current = over;
  }, [left, active, toast, label]);
  return null;
}
