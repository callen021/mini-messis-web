import { useState } from 'react';
import { Link } from 'react-router';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { pinFirst } from '@/lib/pin';
import { useMyChildren } from '@/lineups/api';
import { Scoreline } from '@/components/Badge';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { Segmented } from '@/components/Segmented';
import { Tile, Tiles } from '@/components/Tile';
import { cn } from '@/lib/cn';
import { type StatsView, useUIStore } from '@/lib/ui-store';
import { SPORTS } from '@/sports/definitions';
import { useCurrentTeam } from '@/teams/TeamContext';
import { SkillsMatrix } from '@/skills/SkillsMatrix';
import { usePlayers } from '@/teams/api';
import { useGames, usePlayerStats } from './api';
import { fmtDate } from './format';
import { GameBadge } from './GameBadge';
import { completedGames, formatStat, signed, sortRows, teamRecord } from './stats';

/** Completed games shown on Stats → Season before "See all results". */
export const RECENT_RESULTS = 3;

export function StatsPage() {
  const { teamId, team, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const view = useUIStore((s) => s.statsView);
  const setView = useUIStore((s) => s.setStatsView);
  const games = useGames(teamId);
  const players = usePlayers(teamId);
  const isStaff = useIsStaff();
  const children = useMyChildren();
  const [allResults, setAllResults] = useState(false);

  const all = games.data ?? [];
  const results = completedGames(all);
  const shownResults = allResults ? results : results.slice(0, RECENT_RESULTS);
  // legacy seasonGames: live + done, oldest first
  const season = all
    .filter((g) => g.status !== 'upcoming')
    .sort((a, b) => a.game_date.localeCompare(b.game_date) || a.created_at.localeCompare(b.created_at));
  const live = season.find((g) => g.status === 'live') ?? null;
  const recent = live ?? season[season.length - 1] ?? null;
  const list = view === 'season' ? season : recent ? [recent] : [];
  const stats = usePlayerStats(
    teamId,
    view === 'season' ? null : (recent?.id ?? null),
    view === 'season' || !!recent,
  );

  if (games.isPending) return <LoadingScreen />;

  const rec = teamRecord(list);
  const unit = S.scoring.unitPlural;
  const cols = S.scoring.columns;
  const sorted = sortRows(
    stats.data ?? [],
    cols.map((c) => c.key),
    S.scoring.hot,
  );
  // a parent's own children lead the table (D54); staff see the plain ranking
  const mine = children.data ?? new Set<string>();
  const rows = isStaff ? sorted : pinFirst(sorted, (r) => mine.has(r.player_id));
  const sub =
    view === 'season'
      ? `${season.length} game${season.length === 1 ? '' : 's'} this season${live ? ' incl. the game in progress' : ''}`
      : view === 'skills'
        ? 'Personal bests per test'
        : recent
          ? `vs ${recent.opponent} · ${fmtDate(recent.game_date)}${recent.status === 'live' ? ' · in progress' : ''}`
          : 'No games yet';

  return (
    <Page title="Stats" sub={sub}>
      <Segmented<StatsView>
        wide
        label="Stats view"
        value={view}
        onChange={setView}
        options={[
          { value: 'game', label: 'Current game' },
          { value: 'season', label: 'Season' },
          { value: 'skills', label: 'Skills' },
        ]}
      />
      {view === 'skills' ? (
        <SkillsMatrix players={players.data ?? []} />
      ) : (
        <>
          <Section>Team</Section>
          <Tiles>
            <Tile label="Played" value={view === 'season' ? rec.gp : list.length} />
            <Tile label="W-L-D" value={`${rec.w}-${rec.l}-${rec.d}`} />
            <Tile label={`${unit} for`} value={rec.gf} />
            <Tile label="Against" value={rec.ga} />
            <Tile label="Diff" value={signed(rec.gf - rec.ga)} />
          </Tiles>
          {view === 'season' && (
            <>
              <Section>Results</Section>
              <Group>
                {shownResults.map((g) => (
                  <Row
                    key={g.id}
                    to={`/games/${g.id}`}
                    label={`vs ${g.opponent}`}
                    detail={fmtDate(g.game_date)}
                    chevron
                  >
                    <Scoreline us={g.us} them={g.them} />
                    <GameBadge game={g} />
                  </Row>
                ))}
                {results.length === 0 && (
                  <Row label="No completed games yet. Results appear here after the first game." />
                )}
                {results.length > shownResults.length && (
                  <Row
                    link
                    label={`See all results (${results.length})`}
                    onClick={() => setAllResults(true)}
                  />
                )}
              </Group>
            </>
          )}
          <Section>Players</Section>
          <Group className="statscroll">
            <div className="prow stathead">
              <span className="pname">Player</span>
              {cols.map((c) => (
                <span key={c.key} className="stat" title={c.title}>
                  {c.label}
                </span>
              ))}
            </div>
            {rows.map((r) => (
              <div
                key={r.player_id}
                className={cn('prow', r.removed && 'out', !isStaff && mine.has(r.player_id) && 'mine')}
              >
                <div className="pname">
                  {r.removed ? (
                    <>
                      {r.name}
                      <small>removed</small>
                    </>
                  ) : (
                    <Link
                      to={`/players/${r.player_id}`}
                      state={{ from: '/stats', fromLabel: 'Stats' }}
                      className="plink"
                    >
                      {r.name}
                      {r.number && <small>#{r.number}</small>}
                    </Link>
                  )}
                </div>
                {cols.map((c) => (
                  <span
                    key={c.key}
                    className={cn('stat', c.key === S.scoring.hot && formatStat(r, c.key) !== '0' && 'hot')}
                    aria-label={`${c.title}: ${formatStat(r, c.key)}`}
                  >
                    {formatStat(r, c.key)}
                  </span>
                ))}
              </div>
            ))}
            {list.length === 0 && <div className="prow">Play a game to see player stats.</div>}
            {stats.error && <div className="prow">Couldn’t load player stats: {stats.error.message}</div>}
            {list.length > 0 && rows.length === 0 && !stats.isPending && !stats.error && (
              <div className="prow">No player stats yet.</div>
            )}
          </Group>
          <Footer>
            Stats come from saved games only.{' '}
            {S.scoring.panel === 'run'
              ? 'AVG is hits divided by at-bats; walks, hit by pitch and sacrifices are not at-bats. '
              : ''}
            Removed players stay in the season totals.
            {!isStaff && team.parent_stats === 'own'
              ? ' Individual stats are shown for your own children; team totals cover everyone.'
              : ''}
          </Footer>
        </>
      )}
    </Page>
  );
}
