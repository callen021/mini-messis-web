import { useMemo } from 'react';
import { Footer, Group, Row, Section } from '@/components/List';
import { Segmented } from '@/components/Segmented';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { type Player, usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useRsvps, useSetRsvp } from './api';
import { type EventRef, type RsvpRow, type RsvpStatus, RSVP_LABEL, repliesFor, statusOf } from './rsvp';

type Bucket = 'in' | 'out' | 'none';

const BUCKET_TITLE: Record<Bucket, string> = { in: 'In', out: 'Out', none: 'No reply' };

/** Who set a reply, for the row's second line. */
function setterText(r: RsvpRow | undefined, p: Player): string {
  if (r && r.status !== 'none') return r.set_by_role === 'parent' ? 'by parent' : 'by coach';
  if (!p.is_available) return 'by coach · marked out on the Team tab';
  return r ? (r.set_by_role === 'parent' ? 'cleared by parent' : 'cleared by coach') : '';
}

/**
 * The coach's attendance for one event (D107): every player under In, Out or No reply, who set
 * each reply, and a control to change any of them. A player the coach flagged out on the Team
 * tab is listed under Out too; "In" there lifts that flag as well.
 */
export function AttendanceSection({ event }: { event: EventRef }) {
  const { teamId } = useCurrentTeam();
  const toast = useToast();
  const players = usePlayers(teamId);
  const rsvps = useRsvps(teamId);
  const setRsvp = useSetRsvp(teamId);
  const replies = useMemo(() => repliesFor(rsvps.data ?? [], event), [rsvps.data, event]);
  const roster = players.data ?? [];

  const bucketOf = (p: Player): Bucket => {
    const s = statusOf(replies, p.id);
    if (s === 'out' || !p.is_available) return 'out';
    return s === 'going' ? 'in' : 'none';
  };
  const buckets: Record<Bucket, Player[]> = { in: [], out: [], none: [] };
  for (const p of roster) buckets[bucketOf(p)].push(p);
  const inCount = roster.length - buckets.out.length;

  const set = (p: Player, status: RsvpStatus) => {
    setRsvp.mutate(
      { event, playerId: p.id, status },
      {
        onError: (e) => toast(errorMessage(e)),
        onSuccess: () =>
          toast(
            status === 'none' ? `${p.first_name} · reply cleared` : `${p.first_name} · ${RSVP_LABEL[status]}`,
          ),
      },
    );
  };

  return (
    <>
      <Section>
        Attendance · {inCount} in · {buckets.out.length} out
      </Section>
      {(['in', 'out', 'none'] as const).map((b) => (
        <Group key={b} className="attgroup">
          <div className="prow rothead atthead" aria-hidden="true">
            <span className="pname">
              {BUCKET_TITLE[b]} · {buckets[b].length}
            </span>
          </div>
          {buckets[b].map((p) => {
            const r = replies.get(p.id);
            const s = statusOf(replies, p.id);
            const who = setterText(r, p);
            return (
              <Row
                key={p.id}
                className="attrow"
                label={
                  <>
                    {p.first_name}
                    {p.jersey_number && <small> #{p.jersey_number}</small>}
                  </>
                }
                detail={who || undefined}
              >
                <Segmented<RsvpStatus>
                  className="rsvpseg"
                  label={`${p.first_name}: attendance`}
                  value={s}
                  onChange={(v) => set(p, v)}
                  options={[
                    { value: 'going', label: 'In', ariaLabel: 'In' },
                    { value: 'out', label: 'Out', ariaLabel: 'Out' },
                    { value: 'none', label: '–', ariaLabel: 'No reply' },
                  ]}
                />
              </Row>
            );
          })}
          {buckets[b].length === 0 && <Row className="attempty" label={<i>Nobody</i>} />}
        </Group>
      ))}
      <Footer>
        Parents reply from their home page until the game starts; you can change any reply at any time. No
        reply counts as in. Only Out takes a player out of this game’s lineup — a player already placed keeps
        the spot and shows a red OUT tag on the Field until you replace them.
      </Footer>
    </>
  );
}
