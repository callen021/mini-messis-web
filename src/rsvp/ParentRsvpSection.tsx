import { useMemo } from 'react';
import { Footer, Group, Row, Section } from '@/components/List';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { useMyChildren } from '@/lineups/api';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useRsvps, useSetRsvp } from './api';
import { RsvpButtons } from './RsvpButtons';
import { type EventRef, type RsvpStatus, RSVP_LABEL, repliesFor, statusOf } from './rsvp';

/**
 * The parent's full RSVP control on an event page (D107): one row per linked child, each set
 * separately. Shows nothing for a member with no linked child.
 */
export function ParentRsvpSection({
  event,
  locked,
  lockedText,
}: {
  event: EventRef;
  locked: boolean;
  lockedText: string;
}) {
  const { teamId } = useCurrentTeam();
  const toast = useToast();
  const players = usePlayers(teamId);
  const children = useMyChildren();
  const rsvps = useRsvps(teamId);
  const setRsvp = useSetRsvp(teamId);
  const replies = useMemo(() => repliesFor(rsvps.data ?? [], event), [rsvps.data, event]);
  const mine = useMemo(() => {
    const ids = children.data ?? new Set<string>();
    return (players.data ?? []).filter((p) => ids.has(p.id));
  }, [children.data, players.data]);
  if (!mine.length) return null;

  const set = (playerId: string, name: string, status: RsvpStatus) =>
    setRsvp.mutate(
      { event, playerId, status },
      {
        onError: (e) => toast(errorMessage(e)),
        onSuccess: () =>
          toast(status === 'none' ? `${name} · reply cleared` : `${name} · ${RSVP_LABEL[status]}`),
      },
    );

  return (
    <>
      <Section>{mine.length > 1 ? 'Will they make it?' : `Will ${mine[0]?.first_name} make it?`}</Section>
      <Group>
        {mine.map((p) => (
          <Row
            key={p.id}
            className="rsvprow"
            label={
              <>
                {p.first_name}
                <small className="rsvpstate"> · {RSVP_LABEL[statusOf(replies, p.id)]}</small>
              </>
            }
            detail={
              <RsvpButtons
                status={statusOf(replies, p.id)}
                playerName={p.first_name}
                locked={locked}
                busy={setRsvp.isPending}
                onSet={(s) => set(p.id, p.first_name, s)}
              />
            }
          />
        ))}
      </Group>
      <Footer>
        {locked
          ? lockedText
          : event.kind === 'game'
            ? 'No reply counts as available. Can’t make it takes your player out of this game’s lineup; change it any time until the game starts.'
            : 'No reply counts as available. Change it any time until the practice starts.'}
      </Footer>
    </>
  );
}
