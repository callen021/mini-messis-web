import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { LoadingScreen } from '@/auth/guards';
import { Group } from '@/components/List';
import { Page } from '@/components/Page';
import { useActionSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { useCurrentTeam } from '@/teams/TeamContext';
import { bestKey, useAttempt, useBests, useDeleteAttempt, useHomeDrills } from './api';
import { scoreText } from './challenge';
import { teamToday } from './rotation';

const BACK = { to: '/training', label: 'Training' } as const;

/**
 * The results page of one recorded score (D140): the score, the personal best at that level, NEW
 * RECORD when this attempt beat the best (a tie does not, and neither does a first score: there
 * was nothing to beat), the level it unlocked, then Try Again and Back to Training. The page is
 * the attempt's own address, so a reload shows the same thing. Whoever recorded the score can
 * delete it the same day.
 */
export function ResultPage() {
  const { attemptId } = useParams();
  const { team, sport } = useCurrentTeam();
  const { user } = useAuth();
  const navigate = useNavigate();
  const sheet = useActionSheet();
  const toast = useToast();
  const attempt = useAttempt(attemptId);
  const a = attempt.data ?? null;
  const drills = useHomeDrills(sport);
  const bests = useBests(a?.player_id);
  const remove = useDeleteAttempt(a?.player_id ?? '');

  if (attempt.isPending || drills.isPending) return <LoadingScreen label="Loading the score…" />;
  const drill = a ? (drills.data ?? []).find((d) => d.id === a.item_id) : undefined;
  if (attempt.isError || !a || !drill) {
    return (
      <Page title="Score not found" back={BACK}>
        <Group>
          <div className="empty" role={attempt.isError ? 'alert' : undefined}>
            {attempt.isError ? errorMessage(attempt.error) : 'This score is not here any more.'}
          </div>
        </Group>
      </Page>
    );
  }

  const timed = a.kind === 'time';
  const challenge = drill.home.levels[a.level - 1]?.challenge ?? null;
  const previous = timed ? a.previous_best_seconds : a.previous_best_reps;
  const first = previous === null;
  const tied = !first && !a.is_record && Number(previous) === Number(timed ? a.seconds : a.reps);
  // the best as it stands now; until it has loaded, what this attempt itself tells
  const best =
    bests.data?.get(bestKey(a.item_id, a.level)) ??
    (a.is_record || first
      ? { reps: a.reps, seconds: a.seconds, attempts: 1 }
      : { reps: a.previous_best_reps, seconds: a.previous_best_seconds, attempts: 1 });
  const mine = a.recorded_by === user?.id && a.done_on === teamToday(team.timezone);
  const home = `/training/${a.player_id}`;

  const del = async () => {
    const ok = await sheet({
      title: 'Delete this score?',
      message: 'It is removed from the scores and the personal best. A level it unlocked stays.',
      actions: [{ label: 'Delete this score', value: true, destructive: true }],
    });
    if (!ok) return;
    remove.mutate(a.id, {
      onSuccess: () => {
        toast('Score deleted');
        void navigate(home, { replace: true });
      },
      onError: (e) => toast(errorMessage(e)),
    });
  };

  return (
    <Page title={drill.title} sub={`Level ${a.level}`} back={BACK} className="chresult">
      <div className={a.is_record ? 'resultcard record' : 'resultcard'}>
        {a.is_record && (
          <p className="resultrecord" role="status">
            NEW RECORD
          </p>
        )}
        <p className="resultlabel">
          {timed ? 'Course time' : `Reps in ${challenge?.mode === 'timer' ? challenge.seconds : 60} seconds`}
        </p>
        <p className="resultscore" data-testid="result-score">
          {scoreText(a)}
        </p>
        <p className="resultbest">
          Personal best: <b>{scoreText(best)}</b>
          {a.is_record && previous !== null
            ? ` (was ${scoreText({ reps: a.previous_best_reps, seconds: a.previous_best_seconds })})`
            : ''}
        </p>
        {first && <p className="resultnote">First score at this level: that is the one to beat.</p>}
        {tied && <p className="resultnote">That ties the best. One better is a new record.</p>}
        {a.unlocked_level !== null && (
          <p className="resultunlock" role="status">
            <b>Level {a.unlocked_level} unlocked!</b> {drill.title} opens at Level {a.unlocked_level} next
            time.
          </p>
        )}
      </div>
      <div className="resultactions">
        <Link className="btn" to={`${home}?drill=${drill.slug}`}>
          Try Again
        </Link>
        <Link className="btn gray" to={home}>
          Back to Training
        </Link>
      </div>
      {mine && (
        <p className="resultdelete">
          <button type="button" className="linkbtn" disabled={remove.isPending} onClick={() => void del()}>
            Delete this score
          </button>
        </p>
      )}
    </Page>
  );
}
