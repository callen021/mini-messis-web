import { useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { Button, Toolbar } from '@/components/Button';
import { Footer, Group, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { useMyChildren } from '@/lineups/api';
import { DetailsSection } from '@/players/DetailsSection';
import { PeopleSection } from '@/players/PeopleSection';
import { textColor } from '@/sports/colors';
import { SPORTS } from '@/sports/definitions';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useAddSkillResults, useSkillResults, useSkillTests } from './api';
import { RecordResultSheet } from './RecordResultSheet';
import { SkillsBests } from './SkillsBests';

/** Where a player page goes back to: the page that opened it, else the Team tab (D57). */
export interface PlayerBackState {
  from?: string;
  fromLabel?: string;
}

/**
 * A player's contact card (D57): jersey and name, the Parents list, then (for staff and the
 * child's own guardians) birthdate / shirt size and the skills history. Season tiles live on the
 * parent home tab and the Stats tab.
 */
export function PlayerPage() {
  const { playerId = '' } = useParams<{ playerId: string }>();
  const location = useLocation();
  const back = (location.state as PlayerBackState | null) ?? {};
  const { teamId, team, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const isStaff = useIsStaff();
  const toast = useToast();
  const players = usePlayers(teamId);
  const children = useMyChildren();
  const tests = useSkillTests(teamId);
  const results = useSkillResults(teamId, [playerId]);
  const add = useAddSkillResults(teamId);
  const [recording, setRecording] = useState(false);

  const player = players.data?.find((p) => p.id === playerId);
  const isMine = children.data?.has(playerId) ?? false;
  const canSee = isStaff || isMine;
  const shown = useMemo(() => (tests.data ?? []).filter((t) => t.is_active), [tests.data]);
  const backTo = { to: back.from ?? '/team', label: back.fromLabel ?? 'Team' };

  if (players.isPending || tests.isPending) return <LoadingScreen />;
  if (!player) {
    return (
      <Page title="Player" back={backTo}>
        <p className="sub">This player is no longer on the roster.</p>
      </Page>
    );
  }

  const color = (team.colors as Record<string, string> | null)?.[S.groups[0]?.[0] ?? ''] ?? 'var(--tint)';
  const total = (results.data ?? []).length;
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
      back={backTo}
    >
      <PeopleSection
        playerId={playerId}
        childName={player.first_name}
        teamName={team.name}
        canEdit={canSee}
        isStaff={isStaff}
      />
      {canSee && (
        <>
          <DetailsSection playerId={playerId} playerName={player.first_name} canEdit={canSee} />
          <Section>
            Skills
            {total > 0 ? (
              <span className="pill" style={{ marginLeft: 8 }}>
                {total} result{total === 1 ? '' : 's'}
              </span>
            ) : null}
          </Section>
          <Group>
            <SkillsBests playerId={playerId} />
          </Group>
          {isStaff && shown.length > 0 && (
            <Toolbar className="noprint">
              <Button onClick={() => setRecording(true)}>Record a result</Button>
            </Toolbar>
          )}
          <Footer>
            Best is the personal best for each test; the line is the trend over the last sessions. Tap a test
            for every result on record.{isMine ? ' This is your child.' : ''}
          </Footer>
        </>
      )}
      {isStaff && (
        <RecordResultSheet
          open={recording}
          onClose={() => setRecording(false)}
          playerId={playerId}
          playerName={player.first_name}
          tests={shown}
          onSave={(rows) => {
            add.mutate(rows, {
              onError: (e) => toast(errorMessage(e)),
              onSuccess: () => toast(rows.length > 1 ? 'Results saved' : 'Result saved'),
            });
          }}
        />
      )}
    </Page>
  );
}
