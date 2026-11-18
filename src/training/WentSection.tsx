import { Button } from '@/components/Button';
import { Footer, Group, Row, Section } from '@/components/List';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/auth/AuthProvider';
import { fmtDate, fmtTime } from '@/games/format';
import { type Practice } from '@/games/practices';
import { errorMessage } from '@/lib/supabase';
import { useCheckins, useSetWent } from './api';
import { teamToday } from './rotation';
import { practiceStarted, teamNowStamp } from './streak';

export interface WentChild {
  id: string;
  first_name: string;
}

/**
 * "We went" (D130): a parent marks that their child was at a practice, which counts the day
 * toward the streak. Offered only once the practice has started, never for a cancelled one, and
 * only for a child whose link a coach confirmed. It can be taken back the same day.
 */
export function WentSection({
  practices,
  kids,
  timezone,
  today,
  title = 'Were you there?',
}: {
  /** The practices to offer, already narrowed by the caller. */
  practices: readonly Practice[];
  /** The parent's confirmed children. */
  kids: readonly WentChild[];
  timezone: string | null;
  /** Today where the team plays. */
  today: string;
  title?: string;
}) {
  const now = teamNowStamp(timezone);
  const started = practices.filter((p) => practiceStarted(p, now));
  if (!started.length || !kids.length) return null;
  return (
    <>
      <Section>{title}</Section>
      <Group>
        {started.flatMap((p) =>
          kids.map((c) => (
            <WentRow key={`${p.id}:${c.id}`} practice={p} child={c} today={today} timezone={timezone} />
          )),
        )}
      </Group>
      <Footer>“We went” counts that day toward the streak. You can take it back the same day.</Footer>
    </>
  );
}

function WentRow({
  practice: p,
  child,
  today,
  timezone,
}: {
  practice: Practice;
  child: WentChild;
  today: string;
  timezone: string | null;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const checkins = useCheckins(child.id);
  const setWent = useSetWent(child.id);
  const row = (checkins.data ?? []).find((k) => k.practice_id === p.id);
  const went = !!row;
  // the server decides; this only hides a button that would be refused
  const canUndo = went && row.set_by === user?.id && teamToday(timezone, new Date(row.created_at)) === today;
  const set = (value: boolean) =>
    setWent.mutate(
      { practiceId: p.id, went: value },
      {
        onError: (e) => toast(errorMessage(e)),
        onSuccess: () => toast(value ? `${child.first_name} · went to practice` : 'Taken back'),
      },
    );
  return (
    <Row
      label={
        <>
          {child.first_name} · practice {fmtDate(p.practice_date)}
        </>
      }
      detail={went ? 'Marked: we went' : p.start_time ? fmtTime(p.start_time) : undefined}
    >
      {went ? (
        canUndo ? (
          <Button size="sm" variant="gray" disabled={setWent.isPending} onClick={() => set(false)}>
            Undo
          </Button>
        ) : (
          <span className="wentmark" role="img" aria-label="We went">
            ✓
          </span>
        )
      ) : (
        <Button size="sm" disabled={setWent.isPending || checkins.isPending} onClick={() => set(true)}>
          We went
        </Button>
      )}
    </Row>
  );
}
