import { Navigate } from 'react-router';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/supabase';
import { useEligibility, useSetEligibility } from '@/players/api';
import { NO_ELIGIBILITY, prefLevel } from '@/players/eligibility';
import { SPORTS } from '@/sports/definitions';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';

/**
 * Eligible positions (D117): the roster down, the sport's position groups across, a tap toggles a
 * cell between can play (the default) and never. Coaches and assistant coaches only; a parent is
 * sent back to the Team tab (and RLS would show them nothing anyway).
 */
export function PositionsPage() {
  const { teamId, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const isStaff = useIsStaff();
  const toast = useToast();
  const players = usePlayers(teamId);
  const elig = useEligibility(teamId, isStaff);
  const set = useSetEligibility(teamId);
  const groups = S.eligibility ?? [];

  if (!isStaff || !groups.length) return <Navigate to="/team" replace />;
  if (players.isPending || elig.isPending) return <LoadingScreen />;
  const roster = (players.data ?? []).filter((p) => !p.archived_at);
  const map = elig.data ?? NO_ELIGIBILITY;
  const onError = (e: unknown) => toast(errorMessage(e));

  return (
    <Page
      title="Positions"
      sub="Tap a cell to switch a position off for a player"
      back={{ to: '/team', label: 'Team' }}
    >
      <Section>Who can play where</Section>
      <Group className="posgrid-wrap">
        <table className="posgrid">
          <thead>
            <tr>
              <th scope="col" className="pname">
                Player
              </th>
              {groups.map(([key, label]) => (
                <th key={key} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roster.map((p) => (
              <tr key={p.id} className={cn(!p.is_available && 'out')}>
                <th scope="row" className="pname">
                  {p.first_name}
                  {p.jersey_number && <small>#{p.jersey_number}</small>}
                </th>
                {groups.map(([key, label]) => {
                  const can = prefLevel(map, p.id, key) !== 'never';
                  return (
                    <td key={key}>
                      <button
                        type="button"
                        className={cn('poscell', can ? 'can' : 'never')}
                        aria-pressed={can}
                        aria-label={`${p.first_name} ${label}: ${can ? 'can play' : 'never'}`}
                        onClick={() =>
                          set.mutate(
                            { playerId: p.id, group: key, level: can ? 'never' : 'can' },
                            { onError },
                          )
                        }
                      >
                        <span aria-hidden="true">{can ? '✓' : '–'}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {roster.length === 0 && <Row label="Add players on the Team tab." />}
      </Group>
      <Footer>
        A tick means the player can play there (the default). Switch a position off and Auto-fill and Suggest
        starters leave the player out of it; when nobody on the bench can play a spot it stays open and the
        message says so. Placing a player by hand is never blocked. Only coaches and assistant coaches see
        this screen.
      </Footer>
    </Page>
  );
}
