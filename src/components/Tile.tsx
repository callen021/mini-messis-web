import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Grid of stat tiles. 3 columns by default, as in the legacy Games/Stats pages. */
export function Tiles({
  children,
  cols = 3,
  className,
}: {
  children: ReactNode;
  cols?: 3 | 4 | 5;
  className?: string;
}) {
  return <div className={cn('tiles', cols === 4 && 'four', cols === 5 && 'five', className)}>{children}</div>;
}

/** Big number over an uppercase caption. */
export function Tile({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="tile">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}
