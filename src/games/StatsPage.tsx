import { Link } from 'react-router';
import { LoadingScreen } from '@/auth/guards';
import { Footer, Group, Section } from '@/components/List';
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
import { formatStat, signed, sortRows, teamRecord } from './stats';

export function StatsPage() {
  const { teamId, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const view = useUIStore((s) => s.statsView);
  const setView = useUIStore((s) => s.setStatsView);
  const games = useGames(teamId);
  const players = usePlayers(teamId);

  const all = games.data ?? [];
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
  const rows = sortRows(
    stats.data ?? [],
    cols.map((c) => c.key),
    S.scoring.hot,
  );
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
              <div key={r.player_id} className={cn('prow', r.removed && 'out')}>
                <div className="pname">
                  {r.removed ? (
                    <>
                      {r.name}
                      <small>removed</small>
                    </>
                  ) : (
                    <Link to={`/players/${r.player_id}`} className="plink">
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
          </Footer>
        </>
      )}
    </Page>
  );
}
