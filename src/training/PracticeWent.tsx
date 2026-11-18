import { useMemo } from 'react';
import { type Practice } from '@/games/practices';
import { useMyChildLinks } from '@/lineups/api';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { teamToday } from './rotation';
import { WentSection } from './WentSection';

/** "We went" on a practice's own page, for each of the parent's confirmed children (D130). */
export function PracticeWent({ practice }: { practice: Practice }) {
  const { teamId, team } = useCurrentTeam();
  const players = usePlayers(teamId);
  const links = useMyChildLinks();
  const mine = useMemo(
    () => (players.data ?? []).filter((p) => links.data?.get(p.id) === 'approved'),
    [players.data, links.data],
  );
  return (
    <WentSection
      practices={[practice]}
      kids={mine}
      timezone={team.timezone}
      today={teamToday(team.timezone)}
    />
  );
}
