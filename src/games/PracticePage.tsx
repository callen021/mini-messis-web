import { useParams } from 'react-router';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { Badge } from '@/components/Badge';
import { Textarea } from '@/components/Form';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { useActionSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { useCurrentTeam } from '@/teams/TeamContext';
import { fmtDate, fmtTime } from './format';
import { downloadPracticeIcs } from './ics';
import { type Practice, usePractice, useUpdatePractice } from './practices';
import { practiceLine } from './recurrence';

export function PracticeBadge({ practice }: { practice: Pick<Practice, 'status'> }) {
  return practice.status === 'cancelled' ? (
    <Badge status="cancelled">Cancelled</Badge>
  ) : (
    <Badge>Practice</Badge>
  );
}

export function PracticePage() {
  const { practiceId } = useParams<{ practiceId: string }>();
  const practice = usePractice(practiceId);
  if (practice.isPending) return <LoadingScreen />;
  if (!practice.data) {
    return (
      <Page title="Practice" back={{ to: '/games', label: 'Games' }}>
        <p className="sub">This practice is no longer available.</p>
      </Page>
    );
  }
  return <PracticeDetail practice={practice.data} />;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function PracticeDetail({ practice: p }: { practice: Practice }) {
  const { teamId, team } = useCurrentTeam();
  const isStaff = useIsStaff();
  const toast = useToast();
  const sheet = useActionSheet();
  const update = useUpdatePractice(teamId, p.id);
  const onError = (e: unknown) => toast(errorMessage(e));
  const patch = (patch: Parameters<typeof update.mutate>[0]) => update.mutate(patch, { onError });
  const cancelled = p.status === 'cancelled';

  const cancelFlow = async () => {
    const ok = await sheet({
      title: cancelled ? 'Put this practice back on the schedule?' : 'Cancel this practice?',
      message: cancelled
        ? 'Parents see it as scheduled again.'
        : 'It stays on the schedule crossed out so parents can see it was called off. Nothing is deleted.',
      actions: [
        cancelled
          ? { label: 'Restore practice', value: true }
          : { label: 'Cancel practice', value: true, destructive: true },
      ],
    });
    if (!ok) return;
    update.mutate(
      { status: cancelled ? 'scheduled' : 'cancelled' },
      { onSuccess: () => toast(cancelled ? 'Practice restored' : 'Practice cancelled'), onError },
    );
  };

  const calendar = () =>
    downloadPracticeIcs({
      id: p.id,
      teamName: team.name,
      date: p.practice_date,
      startTime: p.start_time,
      endTime: p.end_time,
      location: p.location,
      notes: p.notes,
    });

  return (
    <Page
      title="Practice"
      documentTitle={`Practice ${fmtDate(p.practice_date)}`}
      sub={
        <>
          {fmtDate(p.practice_date, true)}
          {p.start_time ? ` · ${fmtTime(p.start_time)}` : ''}
          {p.end_time ? ` – ${fmtTime(p.end_time)}` : ''} · {team.name} · <PracticeBadge practice={p} />
        </>
      }
      back={{ to: '/games', label: 'Games' }}
    >
      <Section>Details</Section>
      <Group>
        {isStaff ? (
          <>
            <Row label="Date">
              <input
                className="inline"
                type="date"
                aria-label="Date"
                value={p.practice_date}
                onChange={(e) => ISO.test(e.target.value) && patch({ practice_date: e.target.value })}
              />
            </Row>
            <Row label="Start time">
              <input
                className="inline"
                type="time"
                aria-label="Start time"
                value={p.start_time?.slice(0, 5) ?? ''}
                onChange={(e) => patch({ start_time: e.target.value || null })}
              />
            </Row>
            <Row label="End time">
              <input
                className="inline"
                type="time"
                aria-label="End time"
                value={p.end_time?.slice(0, 5) ?? ''}
                onChange={(e) => {
                  const v = e.target.value || null;
                  if (v && p.start_time && v <= p.start_time.slice(0, 5)) {
                    toast('End time must be after the start');
                    return;
                  }
                  patch({ end_time: v });
                }}
              />
            </Row>
            <Row label="Location">
              <input
                className="inline"
                aria-label="Location"
                placeholder="Field / park"
                defaultValue={p.location ?? ''}
                maxLength={80}
                onBlur={(e) => {
                  const v = e.target.value.trim() || null;
                  if (v !== p.location) patch({ location: v });
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </Row>
          </>
        ) : (
          <>
            <Row label="When" value={practiceLine({ ...p, location: null })} />
            {p.location && <Row label="Where" value={p.location} />}
          </>
        )}
        <Row
          link
          onClick={calendar}
          label="Add to calendar"
          detail="Downloads an .ics file for this practice"
        />
      </Group>
      <Section>Note for parents</Section>
      <Group>
        {isStaff ? (
          <Textarea
            className="notes"
            aria-label="Note for parents"
            defaultValue={p.notes ?? ''}
            placeholder="Bring water · shin guards"
            rows={2}
            maxLength={500}
            onBlur={(e) => {
              const v = e.target.value.trim() || null;
              if (v !== p.notes) {
                patch({ notes: v });
                toast('Note saved');
              }
            }}
          />
        ) : (
          <Row label={p.notes ?? 'No notes from the coach.'} />
        )}
      </Group>
      {isStaff && (
        <>
          <Group style={{ marginTop: 18 }}>
            <Row
              destructive={!cancelled}
              link={cancelled}
              label={cancelled ? 'Restore practice' : 'Cancel practice'}
              onClick={() => void cancelFlow()}
              disabled={update.isPending}
            />
          </Group>
          <Footer>
            Practices are never deleted: a cancelled one stays on the schedule crossed out, so a parent who
            already saw it knows it was called off.
          </Footer>
        </>
      )}
    </Page>
  );
}
