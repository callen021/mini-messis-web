import { useEffect, useRef } from 'react';
import { useToast } from '@/components/Toast';
import { hapticTick } from '@/lib/haptics';
import { type ClockState, isRunning, remainingAt } from './clock';
import { useServerNow } from './useNow';

/**
 * Buzzes and toasts once when a timed period reaches zero (D66); never ends it. Renders nothing
 * and ticks on its own (D95): the page around it does not re-render every second.
 */
export function PeriodOverAlert({
  clock,
  periodMinutes,
  active,
  label,
}: {
  clock: ClockState;
  periodMinutes: number | null;
  active: boolean;
  /** "H1", "Game" */
  label: string;
}) {
  const toast = useToast();
  const now = useServerNow(active && isRunning(clock));
  const left = active ? remainingAt(clock, periodMinutes, now) : null;
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
