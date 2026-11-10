import { cn } from '@/lib/cn';

/** A grey shimmer block; width/height via style or className. Decorative. */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span className={cn('skel', className)} style={style} aria-hidden="true" />;
}

/**
 * Placeholder for a page that is still loading: a title line and a grouped list of `rows` rows,
 * the shape most screens take. Announced once to screen readers through the status text.
 */
export function SkeletonPage({ label = 'Loading…', rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div className="loading skelpage" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton className="skel-title" />
      <Skeleton className="skel-sub" />
      <div className="group skel-group" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skel-row">
            <Skeleton className="skel-icon" />
            <span className="skel-lines">
              <Skeleton className="skel-line" style={{ width: `${55 + ((i * 17) % 30)}%` }} />
              <Skeleton className="skel-line short" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
