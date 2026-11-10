import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { Button, Toolbar } from '@/components/Button';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { Tile, Tiles } from '@/components/Tile';
import { useToast } from '@/components/Toast';
import { usePlayerStats } from '@/games/api';
import { formatStat } from '@/games/stats';
import { errorMessage } from '@/lib/supabase';
import { useMyChildren } from '@/lineups/api';
import { DetailsSection } from '@/players/DetailsSection';
import { textColor } from '@/sports/colors';
import { SPORTS } from '@/sports/definitions';
import { usePlayers, useTeamMembers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useAddSkillResults, useSkillResults, useSkillTests } from './api';
import { bestOf, defaultFor, fmtResult, mainSide, type SkillResult, sortResults } from './defaults';
import { RecordResultSheet } from './RecordResultSheet';
import { Sparkline } from './Sparkline';

/** Player profile: jersey, four season tiles, guardians (staff), skills with personal bests and trends. */
export function PlayerPage() {
  const { playerId = '' } = useParams<{ playerId: string }>();
  const { teamId, team, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const isStaff = useIsStaff();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const players = usePlayers(teamId);
  const stats = usePlayerStats(teamId, null);
  const children = useMyChildren();
  const tests = useSkillTests(teamId);
  const results = useSkillResults(teamId, [playerId]);
  const members = useTeamMembers(isStaff ? teamId : undefined);
  const add = useAddSkillResults(teamId);
  const [recording, setRecording] = useState(false);

  const player = players.data?.find((p) => p.id === playerId);
  const canSee = isStaff || (children.data?.has(playerId) ?? false);
  const shown = useMemo(() => (tests.data ?? []).filter((t) => t.is_active), [tests.data]);
  const byTest = useMemo(() => {
    const m = new Map<string, SkillResult[]>();
    for (const r of sortResults(results.data ?? [])) {
      const list = m.get(r.skill_test_id) ?? [];
      list.push(r);
      m.set(r.skill_test_id, list);
    }
    return m;
  }, [results.data]);

  if (players.isPending || tests.isPending) return <LoadingScreen />;
  if (!player) {
    return (
      <Page title="Player" back={{ to: '/team', label: 'Team' }}>
        <p className="sub">This player is no longer on the roster.</p>
      </Page>
    );
  }

  const row = stats.data?.find((r) => r.player_id === playerId);
  const color = (team.colors as Record<string, string> | null)?.[S.groups[0]?.[0] ?? ''] ?? 'var(--tint)';
  const guardians = (members.data ?? []).filter(
    (m) => m.status === 'active' && m.children.some((c) => c.player_id === playerId),
  );
  const total = (results.data ?? []).length;
  const name = `${player.first_name}${player.last_name ? ` ${player.last_name}` : ''}`;
  const isMine = user ? children.data?.has(playerId) : false;

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
      back={{ to: '/team', label: 'Team' }}
    >
      <Section>Season</Section>
      <Tiles cols={4}>
        {S.scoring.profile.map((c, i) => (
          <Tile key={`${c.key}-${i}`} label={c.label} value={row ? formatStat(row, c.key) : '–'} />
        ))}
      </Tiles>
      {isStaff && (
        <>
          <Section>Guardians</Section>
          <Group>
            {guardians.map((g) => (
              <Row
                key={g.member_id}
                label={g.display_name}
                detail={g.email}
                value={
                  <span
                    className={`chip${g.children.find((c) => c.player_id === playerId)?.status === 'approved' ? '' : ' pb'}`}
                  >
                    {g.children.find((c) => c.player_id === playerId)?.status === 'approved'
                      ? 'LINKED'
                      : 'PENDING'}
                  </span>
                }
              />
            ))}
            {guardians.length === 0 && (
              <div className="empty">No parent linked yet. Share the team code.</div>
            )}
          </Group>
        </>
      )}
      {canSee && <DetailsSection playerId={playerId} playerName={player.first_name} canEdit={canSee} />}
      <Section>
        Skills
        {canSee && total > 0 ? (
          <span className="pill" style={{ marginLeft: 8 }}>
            {total} results
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
          <>
            {shown.map((t) => {
              const all = byTest.get(t.id) ?? [];
              const list = mainSide(t, all);
              const best = bestOf(t, list);
              const last = all[all.length - 1];
              const draft = defaultFor(sport, t.key)?.draft;
              let detail: string;
              if (!all.length) detail = 'No results yet';
              else if (t.has_sides) {
                const r = bestOf(
                  t,
                  all.filter((x) => x.side === 'right'),
                );
                const l = bestOf(
                  t,
                  all.filter((x) => x.side === 'left'),
                );
                detail = `Best ${fmtResult(t, r)} · ${fmtResult(t, l)} · last ${fmtShort(last?.tested_on)}`;
              } else
                detail = `Best ${fmtResult(t, best)} · latest ${fmtResult(t, last)} · ${fmtShort(last?.tested_on)}`;
              const isPb = !!best && list.length > 1 && best.id === list[list.length - 1]?.id;
              return (
                <Row
                  key={t.id}
                  onClick={() => void navigate(`/players/${playerId}/skills/${t.id}`)}
                  label={
                    <>
                      {t.name}
                      {draft && <span className="chip draft">DRAFT</span>}
                    </>
                  }
                  detail={detail}
                  chevron
                >
                  <Sparkline test={t} results={list} />
                  <span className="best">
                    {fmtResult(t, best, false)}
                    {isPb && <small> PB</small>}
                  </span>
                </Row>
              );
            })}
            {shown.length === 0 && (
              <div className="empty">
                No tests shown.{isStaff ? ' Add or restore tests under Settings → Skills tests.' : ''}
              </div>
            )}
          </>
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

function fmtShort(s: string | undefined): string {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
