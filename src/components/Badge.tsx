import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type GameStatus = 'upcoming' | 'live' | 'done';

/** Small rounded status label; `status` picks the legacy color (live = tint, upcoming = blue). */
export function Badge({
  children,
  status,
  className,
}: {
  children: ReactNode;
  status?: GameStatus;
  className?: string;
}) {
  return <span className={cn('badge', status && `st-${status}`, className)}>{children}</span>;
}

/** Tinted inline pill (e.g. a count next to a title). */
export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('pill', className)}>{children}</span>;
}

/** "N open" (orange) / "Full" (green) pill on a period card header. */
export function OpenPill({ open }: { open: number }) {
  return (
    <span className={cn('openpill', open === 0 && 'full')}>
      <i aria-hidden="true" />
      {open ? `${open} open` : 'Full'}
    </span>
  );
}

/** LAST / UP NEXT style tag in a row. */
export function Tag({ children, up, className }: { children: ReactNode; up?: boolean; className?: string }) {
  return <span className={cn('tag', up && 'up', className)}>{children}</span>;
}

/** Period tag like "Q2" in a scoring log row. */
export function PeriodTag({ children }: { children: ReactNode }) {
  return <span className="qtag">{children}</span>;
}

/** US x – y THEM. `big` is the game-detail hero size. */
export function Scoreline({
  us,
  them,
  big,
  className,
}: {
  us: number;
  them: number;
  big?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('scoreline', big && 'big', className)} aria-label={`Us ${us}, them ${them}`}>
      <small>US</small>
      <b>{us}</b>
      <i aria-hidden="true">–</i>
      <b>{them}</b>
      <small>THEM</small>
    </div>
  );
}
