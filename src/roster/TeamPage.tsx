import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { Page } from '@/components/Page';
import { Segmented } from '@/components/Segmented';
import { type TeamView, useUIStore } from '@/lib/ui-store';
import { useCurrentPlan, useMyChildren } from '@/lineups/api';
import { SPORTS, periodPlural } from '@/sports/definitions';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { AllergySummary } from '@/players/AllergySummary';
import { SeasonStats } from '@/games/SeasonStats';
import { RosterView } from './RosterView';
import { RotationView } from './RotationView';
import { ClockRotationView } from '@/clock/ClockRotationView';

export function TeamPage() {
  const { teamId, team, sport } = useCurrentTeam();
  const clockMode = team.time_mode === 'clock';
  const S = SPORTS[sport];
  const isStaff = useIsStaff();
  const stored = useUIStore((s) => s.teamView);
  const setStored = useUIStore((s) => s.setTeamView);
  // a link can name the view (?view=season, from the season tiles and the old Stats address)
  const [search, setSearch] = useSearchParams();
  const asked = search.get('view');
  const view: TeamView = asked === 'season' || asked === 'roster' || asked === 'rotation' ? asked : stored;
  const setView = (v: TeamView) => {
    setStored(v);
    if (asked) setSearch({}, { replace: true });
  };
  const players = usePlayers(teamId);
  const plan = useCurrentPlan(teamId);
  const children = useMyChildren();
  const list = useMemo(() => players.data ?? [], [players.data]);
  const highlight = children.data ?? new Set<string>();

  // "Parents can see stats for: Own" also narrows Rotation to the parent's own children (D134)
  const ownOnly = !isStaff && team.parent_stats === 'own';

  if (players.isPending || plan.isPending || (ownOnly && children.isPending)) return <LoadingScreen />;

  const active = list.filter((p) => p.is_available).length;
  const outCount = list.length - active;
  const N = plan.periods.length;
  const sub =
    view === 'season'
      ? 'The season so far: record, results and player stats'
      : view === 'rotation'
        ? clockMode
          ? ownOnly
            ? 'Minutes your child has played'
            : `Minutes each player has played${isStaff ? ' · substitutions on the Field tab' : ''}`
          : ownOnly
            ? N === 1
              ? 'When your child plays'
              : `${periodPlural(S, N, true)} your child is scheduled for`
            : `${N === 1 ? 'Who plays the game' : `${periodPlural(S, N, true)} each player is scheduled for`}${isStaff ? ' · tap a box to assign' : ''}`
        : `${S.emoji} ${S.name} roster · ${active} active${outCount ? ` · ${outCount} out` : ''}`;

  return (
    <Page title="Team" sub={sub}>
      <Segmented<TeamView>
        wide
        label="Team view"
        value={view}
        onChange={setView}
        options={[
          { value: 'rotation', label: 'Rotation' },
          { value: 'roster', label: 'Roster' },
          { value: 'season', label: 'Season' },
        ]}
      />
      {view === 'season' ? (
        <SeasonStats />
      ) : view === 'rotation' ? (
        clockMode ? (
          <ClockRotationView players={list} canEdit={isStaff} highlight={highlight} ownOnly={ownOnly} />
        ) : (
          <RotationView players={list} canEdit={isStaff} highlight={highlight} ownOnly={ownOnly} />
        )
      ) : (
        <>
          <RosterView players={list} canEdit={isStaff} highlight={highlight} />
          <AllergySummary teamId={teamId} />
        </>
      )}
    </Page>
  );
}
