import { cn } from '@/lib/cn';

export interface StepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** What is being stepped, e.g. "Players on the field". Used for the button labels. */
  label: string;
  /** Text shown in the middle; defaults to the number. Use it when stepping through an index. */
  display?: string;
  step?: number;
  disabled?: boolean;
  className?: string;
}

/** − value + control. Buttons disable at the bounds; the value announces changes politely. */
export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  display,
  step = 1,
  disabled,
  className,
}: StepperProps) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  return (
    <div className={cn('stepper', className)} role="group" aria-label={label}>
      <button
        type="button"
        onClick={dec}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${label}`}
      >
        −
      </button>
      <b aria-live="polite">{display ?? String(value)}</b>
      <button
        type="button"
        onClick={inc}
        disabled={disabled || value >= max}
        aria-label={`Increase ${label}`}
      >
        +
      </button>
    </div>
  );
}
