import { useMemo } from 'react';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { Page } from '@/components/Page';
import { Segmented } from '@/components/Segmented';
import { type TeamView, useUIStore } from '@/lib/ui-store';
import { useCurrentPlan, useMyChildren } from '@/lineups/api';
import { SPORTS, periodPlural } from '@/sports/definitions';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { RosterView } from './RosterView';
import { RotationView } from './RotationView';
import { ClockRotationView } from '@/clock/ClockRotationView';

export function TeamPage() {
  const { teamId, team, sport } = useCurrentTeam();
  const clockMode = team.time_mode === 'clock';
  const S = SPORTS[sport];
  const isStaff = useIsStaff();
  const view = useUIStore((s) => s.teamView);
  const setView = useUIStore((s) => s.setTeamView);
  const players = usePlayers(teamId);
  const plan = useCurrentPlan(teamId);
  const children = useMyChildren();
  const list = useMemo(() => players.data ?? [], [players.data]);
  const highlight = children.data ?? new Set<string>();

  if (players.isPending || plan.isPending) return <LoadingScreen />;

  const active = list.filter((p) => p.is_available).length;
  const outCount = list.length - active;
  const N = plan.periods.length;
  const sub =
    view === 'rotation'
      ? clockMode
        ? `Minutes each player has played${isStaff ? ' · substitutions on the Field tab' : ''}`
        : `${periodPlural(S, N, true)} each player is scheduled for${isStaff ? ' · tap a box to assign' : ''}`
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
        ]}
      />
      {view === 'rotation' ? (
        clockMode ? (
          <ClockRotationView players={list} canEdit={isStaff} highlight={highlight} />
        ) : (
          <RotationView players={list} canEdit={isStaff} highlight={highlight} />
        )
      ) : (
        <RosterView players={list} canEdit={isStaff} highlight={highlight} />
      )}
    </Page>
  );
}
