import { useEffect, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { Group, Row } from '@/components/List';
import { Page } from '@/components/Page';
import { Segmented } from '@/components/Segmented';
import { usePractices } from '@/games/practices';
import { ChildSwitcher } from '@/home/children';
import { useMyKids } from '@/home/useMyKids';
import { LibraryList } from '@/library/LibraryPage';
import { SkillsMatrix } from '@/skills/SkillsMatrix';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { DailyDrills } from './DailyDrills';
import { SkillTestsTab } from './SkillTestsTab';
import { TAB_LABEL, type TrainingTab, trainingTabs } from './tabs';
import { addDays, teamToday } from './rotation';
import { StreakCard } from './StreakCard';
import { WentSection } from './WentSection';

type TestsView = 'mine' | 'team';

/**
 * The Training tab (D135): the selected child's streak, then Daily Drills, Skill Tests and the
 * Practice library. A parent sees their own child's Skill Tests; a coach or assistant sees the
 * team's, and one with a linked child chooses between "My kid" (Home results) and "Team" (Coach
 * results). Without a confirmed child there is no streak and no Daily Drills.
 */
export function TrainingPage() {
  const { teamId, team, sport } = useCurrentTeam();
  const isStaff = useIsStaff();
  const players = usePlayers(teamId);
  const { kids, child, confirmed, select, isPending } = useMyKids();
  const practices = usePractices(teamId);
  const [search, setSearch] = useSearchParams();
  const [testsView, setTestsView] = useState<TestsView>('mine');

  if (players.isPending || isPending) return <LoadingScreen label="Loading training…" />;

  // at-home training is for a child whose link a coach has confirmed, as before
  const mine = confirmed ? child : null;
  const tabs = trainingTabs(sport, !!mine);
  const asked = search.get('tab') as TrainingTab | null;
  const tab: TrainingTab = asked && tabs.includes(asked) ? asked : (tabs[0] ?? 'tests');
  const today = teamToday(team.timezone);
  // practices of the last week that "We went" can still be marked for
  const weekAgo = addDays(today, -6);
  const recent = (practices.data ?? []).filter((p) => p.practice_date >= weekAgo && p.practice_date <= today);
  const teamView = isStaff && (!mine || testsView === 'team');

  return (
    <Page
      title="Training"
      documentTitle={mine ? `Training · ${mine.first_name}` : 'Training'}
      sub={
        child ? (
          <>
            <ChildSwitcher kids={kids} child={child} onSelect={select} />
            {mine && sport === 'soccer' ? ' · at home' : ''}
          </>
        ) : isStaff ? (
          'Skill tests and the practice library'
        ) : undefined
      }
      className="training"
    >
      {mine && sport === 'soccer' && (
        <StreakCard key={mine.id} playerId={mine.id} playerName={mine.first_name} />
      )}
      {tabs.length > 1 && (
        <Segmented<TrainingTab>
          wide
          label="Training"
          value={tab}
          onChange={(t) => setSearch(t === tabs[0] ? {} : { tab: t }, { replace: true })}
          options={tabs.map((t) => ({ value: t, label: TAB_LABEL[t] }))}
        />
      )}
      {tab === 'drills' && mine && (
        <>
          <DailyDrills
            key={mine.id}
            playerId={mine.id}
            playerName={mine.first_name}
            sport={sport}
            today={today}
          />
          <WentSection
            title="Team practice this week"
            practices={recent}
            kids={[mine]}
            timezone={team.timezone}
            today={today}
          />
        </>
      )}
      {tab === 'tests' && (
        <>
          {isStaff && mine && (
            <Segmented<TestsView>
              wide
              label="Whose skill tests"
              value={testsView}
              onChange={setTestsView}
              options={[
                { value: 'mine', label: 'My kid' },
                { value: 'team', label: 'Team' },
              ]}
            />
          )}
          {teamView ? (
            <>
              <SkillsMatrix players={players.data ?? []} />
              <Group>
                <Row
                  to="/settings/skills"
                  label="Edit tests"
                  detail="Show or hide, reorder, add and change the team’s tests"
                  chevron
                />
              </Group>
            </>
          ) : mine ? (
            <SkillTestsTab
              key={mine.id}
              teamId={teamId}
              playerId={mine.id}
              playerName={mine.first_name}
              today={today}
            />
          ) : (
            <Group>
              <Row
                label="Skill results appear here once you’re linked to your child"
                detail={
                  child
                    ? `A coach will confirm your link to ${child.first_name}; their skill tests show here after that.`
                    : 'Ask the coach to link your child from Settings → Members.'
                }
              />
            </Group>
          )}
        </>
      )}
      {tab === 'library' && <LibraryList />}
    </Page>
  );
}

/** The old per-child address (/training/:playerId): select that child, then open the tab. */
export function TrainingChildRedirect() {
  const { playerId = '' } = useParams();
  const [search] = useSearchParams();
  const { kids, select, isPending } = useMyKids();
  const known = kids.some((k) => k.id === playerId);
  useEffect(() => {
    if (known) select(playerId);
    // select is stable in effect: it writes the same value on a re-run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known, playerId]);
  if (isPending) return <LoadingScreen label="Loading training…" />;
  const q = search.toString();
  return <Navigate to={`/training${q ? `?${q}` : ''}`} replace />;
}
