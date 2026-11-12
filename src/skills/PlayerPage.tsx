import { useLocation, useParams } from 'react-router';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { Page } from '@/components/Page';
import { useMyChildLinks } from '@/lineups/api';
import { type PlayerBackState, playerBack } from './playerBack';
import { DetailsSection } from '@/players/DetailsSection';
import { PeopleSection } from '@/players/PeopleSection';
import { textColor } from '@/sports/colors';
import { SPORTS } from '@/sports/definitions';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';

/** A player's contact card (D57, D60): jersey and name, the Parents list, birthdate and shirt size. */
export function PlayerPage() {
  const { playerId = '' } = useParams<{ playerId: string }>();
  const location = useLocation();
  const back = playerBack((location.state as PlayerBackState | null) ?? {}, { to: '/team', label: 'Team' });
  const { teamId, team, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const isStaff = useIsStaff();
  const players = usePlayers(teamId);
  const links = useMyChildLinks();

  const player = players.data?.find((p) => p.id === playerId);
  const link = links.data?.get(playerId);
  // details and other people's contacts need a staff-confirmed link (D91); any link allows an own entry
  const canEdit = isStaff || link === 'approved';
  const selfLinked = !!link;

  if (players.isPending) return <LoadingScreen />;
  if (!player) {
    return (
      <Page title="Player" back={back}>
        <p className="sub">This player is no longer on the roster.</p>
      </Page>
    );
  }

  const color = (team.colors as Record<string, string> | null)?.[S.groups[0]?.[0] ?? ''] ?? 'var(--tint)';
  const name = `${player.first_name}${player.last_name ? ` ${player.last_name}` : ''}`;

  return (
    <Page
      title={
        <div className="hero">
          <div className="jersey" style={{ background: color, color: textColor(color) }}>
            {player.jersey_number || '–'}
          </div>
          <div>
            <div className="name">{name}</div>
            <div className="meta">
              {player.jersey_number ? `#${player.jersey_number} · ` : ''}
              {team.name} · {S.emoji} {S.name}
              {!player.is_available ? ' · out this game' : ''}
            </div>
          </div>
        </div>
      }
      documentTitle={name}
      back={back}
    >
      <PeopleSection
        playerId={playerId}
        childName={player.first_name}
        teamName={team.name}
        canEdit={canEdit}
        selfLinked={selfLinked}
        isStaff={isStaff}
      />
      {canEdit && <DetailsSection playerId={playerId} playerName={player.first_name} canEdit={canEdit} />}
    </Page>
  );
}
