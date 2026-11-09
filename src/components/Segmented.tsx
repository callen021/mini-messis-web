import { type CSSProperties, type KeyboardEvent, type ReactNode, useRef } from 'react';
import { cn } from '@/lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when the label is not plain text. */
  ariaLabel?: string;
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the whole control. */
  label: string;
  /** Full-width variant with 16px side margins (page-level segment). */
  wide?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * iOS segmented control. Exposed as a radio group: Tab lands on the selected segment,
 * arrow keys move the selection.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  wide,
  className,
  style,
}: SegmentedProps<T>) {
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const idx = options.findIndex((o) => o.value === value);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const opt = options[next];
    if (!opt) return;
    onChange(opt.value);
    ref.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  };

  const selectedIdx = options.findIndex((o) => o.value === value);

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      className={cn('seg', wide && 'wide', className)}
      style={style}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.ariaLabel}
            tabIndex={on || (selectedIdx < 0 && i === 0) ? 0 : -1}
            className={cn(on && 'on')}
            onClick={() => onChange(o.value)}
            onKeyDown={onKeyDown}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
