import { cn } from '@/lib/cn';
import { FieldIcon, GamesIcon, StatsIcon, TeamIcon } from './icons';
import { Tabbar } from './Tabbar';

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

const SHELL_TABS = [
  { to: '/field', label: 'Field', icon: <FieldIcon /> },
  { to: '/team', label: 'Team', icon: <TeamIcon /> },
  { to: '/games', label: 'Schedule', icon: <GamesIcon /> },
  { to: '/stats', label: 'Stats', icon: <StatsIcon /> },
];

/**
 * The app's frame before its data (D89): status strip, top bar and the tab bar, with a page
 * skeleton in between, so a launch looks like the app at once rather than a blank screen.
 */
export function ShellSkeleton({ label = 'Loading…' }: { label?: string }) {
  return (
    <>
      <div className="statusbar-bg" aria-hidden="true" />
      <main className="app-main">
        <div className="topbar" aria-hidden="true">
          <Skeleton className="skel-title" style={{ width: 140, margin: '10px 16px' }} />
        </div>
        <SkeletonPage label={label} />
      </main>
      <Tabbar tabs={SHELL_TABS} />
    </>
  );
}
