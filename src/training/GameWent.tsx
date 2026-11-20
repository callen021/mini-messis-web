import { useMemo } from 'react';
import { type Game } from '@/games/api';
import { useMyChildLinks } from '@/lineups/api';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { teamToday } from './rotation';
import { WentSection } from './WentSection';

/** "We went" on a game's own page, for each of the parent's confirmed children (D138). */
export function GameWent({ game }: { game: Game }) {
  const { teamId, team } = useCurrentTeam();
  const players = usePlayers(teamId);
  const links = useMyChildLinks();
  const mine = useMemo(
    () => (players.data ?? []).filter((p) => links.data?.get(p.id) === 'approved'),
    [players.data, links.data],
  );
  return <WentSection games={[game]} kids={mine} timezone={team.timezone} today={teamToday(team.timezone)} />;
}
