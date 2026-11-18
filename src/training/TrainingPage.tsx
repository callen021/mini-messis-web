import { useParams, useSearchParams } from 'react-router';
import { LoadingScreen } from '@/auth/guards';
import { Group, Row } from '@/components/List';
import { Page } from '@/components/Page';
import { Segmented } from '@/components/Segmented';
import { useMyChildLinks } from '@/lineups/api';
import { usePractices } from '@/games/practices';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { DailyDrills } from './DailyDrills';
import { SkillTestsTab } from './SkillTestsTab';
import { addDays, teamToday } from './rotation';
import { StreakCard } from './StreakCard';
import { WentSection } from './WentSection';

type Tab = 'drills' | 'tests';

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
  const practices = usePractices(teamId);
  const [search, setSearch] = useSearchParams();
  const tab: Tab = search.get('tab') === 'tests' ? 'tests' : 'drills';

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
  // practices of the last week that "We went" can still be marked for
  const weekAgo = addDays(today, -6);
  const recent = (practices.data ?? []).filter((p) => p.practice_date >= weekAgo && p.practice_date <= today);
  return (
    <Page
      title="Training"
      documentTitle={`Training · ${child.first_name}`}
      sub={`${child.first_name} · at home`}
      back={BACK}
      className="training"
    >
      <StreakCard playerId={child.id} playerName={child.first_name} />
      <Segmented<Tab>
        wide
        label="Training"
        value={tab}
        onChange={(t) => setSearch(t === 'drills' ? {} : { tab: t }, { replace: true })}
        options={[
          { value: 'drills', label: 'Daily Drills' },
          { value: 'tests', label: 'Skill Tests' },
        ]}
      />
      {tab === 'drills' ? (
        <>
          <DailyDrills playerId={child.id} playerName={child.first_name} sport={sport} today={today} />
          <WentSection
            title="Team practice this week"
            practices={recent}
            kids={[child]}
            timezone={team.timezone}
            today={today}
          />
        </>
      ) : (
        <SkillTestsTab teamId={teamId} playerId={child.id} playerName={child.first_name} today={today} />
      )}
    </Page>
  );
}
