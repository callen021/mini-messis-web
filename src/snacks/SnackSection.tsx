import { Button } from '@/components/Button';
import { Footer, Group, Row, Section } from '@/components/List';
import { AllergySummary } from '@/players/AllergySummary';
import { type EventRef } from '@/rsvp/rsvp';
import { useCurrentTeam } from '@/teams/TeamContext';
import { type SnackSlot, familyLabel, snackWanted } from './snacks';
import { useSnackFamily } from './useSnackFamily';

/**
 * The Snacks block on a game or practice page (D115): who brings them, "You're bringing snacks"
 * with the team's allergy summary for that family, Sign up / Release for parents, and the
 * coach's Assign with the "can't make it" flag.
 */
export function SnackSection({ event, slot, open }: { event: EventRef; slot: SnackSlot; open: boolean }) {
  const { teamId, team } = useCurrentTeam();
  const f = useSnackFamily();
  if (!snackWanted(team.snack_signup, event.kind)) return null;
  const who = slot.snack_player_id ? f.nameOf(slot.snack_player_id) : undefined;
  const mine = f.isMine(slot);
  const label = !slot.snack_player_id ? 'Open' : who ? familyLabel(who) : 'A family';
  return (
    <>
      <Section>Snacks</Section>
      <Group>
        <Row
          className="snackrow"
          icon="🍎"
          iconColor="var(--green)"
          label={mine ? 'You’re bringing snacks' : slot.snack_player_id ? label : 'Nobody has signed up yet'}
          detail={
            f.isStaff && slot.snack_flagged
              ? `${label} can’t make it: find another family.`
              : mine
                ? 'Thanks! Check the allergies below.'
                : undefined
          }
          onClick={f.isStaff ? () => void f.assign(event, slot) : undefined}
          chevron={f.isStaff}
        >
          {f.isStaff ? (
            <span className={`val${slot.snack_flagged ? ' mine' : ''}`}>{slot.snack_flagged ? '⚠︎' : ''}</span>
          ) : open && !slot.snack_player_id && f.mine.length > 0 ? (
            <Button size="sm" variant="tinted" disabled={f.busy} onClick={() => void f.claim(event)}>
              Sign up
            </Button>
          ) : open && mine ? (
            <Button size="sm" variant="gray" disabled={f.busy} onClick={() => void f.release(event)}>
              Release
            </Button>
          ) : null}
        </Row>
        {mine && (
          <p className="snacknote">
            <AllergySummary teamId={teamId} bare label="Allergies on the team" />
          </p>
        )}
      </Group>
      {!f.isStaff && (
        <Footer>One family per {event.kind}; the full list is under Snack signup on your Home tab.</Footer>
      )}
    </>
  );
}
