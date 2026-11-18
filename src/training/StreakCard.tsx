import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { useCelebrateMilestone, useStreak } from './api';
import { days, EMPTY_STREAK, streakHint } from './streak';

/**
 * The streak at the top of the Training page (D130): the count in days, the longest so far, what
 * today needs, and a milestone note the first time 5, 10, 25, 50 or 100 days is reached.
 */
export function StreakCard({ playerId, playerName }: { playerId: string; playerName: string }) {
  const toast = useToast();
  const streak = useStreak(playerId);
  const celebrate = useCelebrateMilestone(playerId);
  if (streak.isPending) return null;
  if (streak.isError) {
    return (
      <p className="streakcard" role="alert">
        {errorMessage(streak.error)}
      </p>
    );
  }
  const s = streak.data ?? EMPTY_STREAK;
  return (
    <>
      {s.celebrate !== null && (
        <div className="milestone" role="status">
          <span className="burst" aria-hidden="true">
            🏆
          </span>
          <p>
            <b>{s.celebrate}-day streak!</b> {playerName} has kept it going for {days(s.celebrate)}.
          </p>
          <button
            type="button"
            className="linkbtn"
            disabled={celebrate.isPending}
            onClick={() => celebrate.mutate(s.celebrate ?? 0, { onError: (e) => toast(errorMessage(e)) })}
          >
            Nice!
          </button>
        </div>
      )}
      <div className="streakcard">
        <span className="flame" aria-hidden="true">
          🔥
        </span>
        <p className="count">
          <b>{s.current}</b>
          <span>day streak</span>
        </p>
        <p className="more">
          <span>Longest: {days(s.longest)}</span>
          <span>{streakHint(s)}</span>
        </p>
      </div>
    </>
  );
}
