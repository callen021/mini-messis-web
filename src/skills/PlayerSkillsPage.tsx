import { useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { Button, Toolbar } from '@/components/Button';
import { Footer, Group, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { useMyChildren } from '@/lineups/api';
import { textColor } from '@/sports/colors';
import { SPORTS } from '@/sports/definitions';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useAddSkillResults, useSkillResults, useSkillTests } from './api';
import { type PlayerBackState, playerBack } from './playerBack';
import { RecordResultSheet } from './RecordResultSheet';
import { SkillsBests } from './SkillsBests';

/**
 * The skills page (D60): jersey, name, then skills only. Opened from Stats → Skills, the parent
 * home tab and a test's own page; the contact card (Roster) is a separate page.
 */
export function PlayerSkillsPage() {
  const { playerId = '' } = useParams<{ playerId: string }>();
  const location = useLocation();
  const back = playerBack((location.state as PlayerBackState | null) ?? {}, { to: '/stats', label: 'Stats' });
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

  if (players.isPending || tests.isPending) return <LoadingScreen />;
  if (!player) {
    return (
      <Page title="Player" back={back}>
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
              {team.name} · skills
            </div>
          </div>
        </div>
      }
      documentTitle={`${name} · skills`}
      back={back}
    >
      <Section>
        Skills
        {canSee && total > 0 ? (
          <span className="pill" style={{ marginLeft: 8 }}>
            {total} result{total === 1 ? '' : 's'}
          </span>
        ) : null}
      </Section>
      <Group>
        {!canSee ? (
          <div className="lock">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <span>
              Skill results are shared only with a player’s own parents. You can see positions, playing time
              and stats for the whole team.
            </span>
          </div>
        ) : (
          <SkillsBests playerId={playerId} playerName={player.first_name} />
        )}
      </Group>
      {isStaff && shown.length > 0 && (
        <Toolbar className="noprint">
          <Button onClick={() => setRecording(true)}>Record a result</Button>
        </Toolbar>
      )}
      {canSee && (
        <Footer>
          Best is the personal best for each test; the line is the trend over the last sessions. Tap a test
          for every result on record.{isMine ? ' This is your child.' : ''}
        </Footer>
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
