import { useParams } from 'react-router';
import { LoadingScreen } from '@/auth/guards';
import { Group, Row } from '@/components/List';
import { Page } from '@/components/Page';
import { useMyChildLinks } from '@/lineups/api';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { DailyDrills } from './DailyDrills';
import { teamToday } from './rotation';

const BACK = { to: '/home', label: 'Home', pop: true } as const;

/**
 * A child's at-home Training (D128), opened from the streak indicator on the parent dashboard.
 * Only a parent with a confirmed link to the child gets in; the database enforces the same rule.
 */
export function TrainingPage() {
  const { playerId = '' } = useParams();
  const { teamId, team, sport } = useCurrentTeam();
  const players = usePlayers(teamId);
  const links = useMyChildLinks();

  if (players.isPending || links.isPending) return <LoadingScreen label="Loading training…" />;

  const child = (players.data ?? []).find((p) => p.id === playerId) ?? null;
  if (!child || links.data?.get(playerId) !== 'approved') {
    return (
      <Page title="Training" back={BACK}>
        <Group>
          <Row
            label="Training isn’t available here"
            detail="At-home training is for a parent whose link to the child a coach has confirmed."
          />
        </Group>
      </Page>
    );
  }

  const today = teamToday(team.timezone);
  return (
    <Page
      title="Training"
      documentTitle={`Training · ${child.first_name}`}
      sub={`${child.first_name} · at home`}
      back={BACK}
      className="training"
    >
      <DailyDrills playerId={child.id} playerName={child.first_name} sport={sport} today={today} />
    </Page>
  );
}
