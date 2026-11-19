import { Link } from 'react-router';
import { useStreak } from './api';

export interface StreakChild {
  id: string;
  first_name: string;
}

/**
 * The small streak indicator on the parent dashboard (D131): a flame, the child's current streak
 * and a "Daily Drills" label. Tapping it opens the Training tab on Daily Drills. The dashboard shows the
 * selected child's (D135).
 */
export function StreakIndicators({
  kids,
  named = kids.length > 1,
}: {
  kids: readonly StreakChild[];
  /** Show each child's first name: whenever the dashboard is about more than one child. */
  named?: boolean;
}) {
  if (!kids.length) return null;
  return (
    <div className="streaklinks">
      {kids.map((k) => (
        <StreakIndicator key={k.id} child={k} named={named} />
      ))}
    </div>
  );
}

function StreakIndicator({ child, named }: { child: StreakChild; named: boolean }) {
  const streak = useStreak(child.id);
  const n = streak.data?.current ?? 0;
  return (
    <Link
      to="/training"
      className="streaklink"
      aria-label={`${child.first_name}: ${n}-day streak. Daily Drills`}
    >
      <span className="top" aria-hidden="true">
        <span className={`flame${n === 0 ? ' cold' : ''}`}>🔥</span>
        <b>{streak.isPending ? '–' : n}</b>
      </span>
      <small aria-hidden="true">{named ? child.first_name : 'Daily Drills'}</small>
      {named && (
        <small className="what" aria-hidden="true">
          Daily Drills
        </small>
      )}
    </Link>
  );
}
