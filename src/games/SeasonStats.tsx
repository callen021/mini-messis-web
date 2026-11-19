import { useState } from 'react';
import { Scoreline } from '@/components/Badge';
import { Footer, Group, Row, Section } from '@/components/List';
import { Tile, Tiles } from '@/components/Tile';
import { errorMessage } from '@/lib/supabase';
import { SPORTS } from '@/sports/definitions';
import { useCurrentTeam } from '@/teams/TeamContext';
import { seasonLabel, useGames, usePlayerStats, useSeasons } from './api';
import { fmtDate } from './format';
import { GameBadge } from './GameBadge';
import { PlayerStatsTable, StatsFootnote } from './PlayerStatsTable';
import { completedGames, signed, teamRecord } from './stats';

/** Completed games shown under Results before "See all results". */
export const RECENT_RESULTS = 3;

/** Back target for pages opened from here. */
const FROM = { to: '/team?view=season', label: 'Season' } as const;

/**
 * Team → Season (D135; it was Stats → Season): the team record, results and the per-player
 * season table, with a "Last game" link to the most recent finished game on top. A past season
 * can be chosen and is read-only (D94).
 */
export function SeasonStats() {
  const { teamId, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const games = useGames(teamId);
  const seasons = useSeasons(teamId);
  const [allResults, setAllResults] = useState(false);
  // null = the current season
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const seasonRows = seasons.data ?? [];
  const current = seasonRows.find((s) => s.is_current) ?? null;
  const chosen = seasonId ? (seasonRows.find((s) => s.id === seasonId) ?? current) : current;
  const pastSeason = !!chosen && !chosen.is_current;

  const all = (games.data ?? []).filter((g) => !chosen || g.season_id === chosen.id);
  const results = completedGames(all);
  const shownResults = allResults ? results : results.slice(0, RECENT_RESULTS);
  // live + done, as the season totals count the game in progress
  const season = all.filter((g) => g.status !== 'upcoming');
  const live = season.some((g) => g.status === 'live');
  const stats = usePlayerStats(teamId, null, true, pastSeason ? (chosen?.id ?? null) : null);
  // the most recent finished game of any season: "Last game" does not follow the season picker
  const last = completedGames(games.data ?? [])[0] ?? null;

  const rec = teamRecord(season);
  const unit = S.scoring.unitPlural;
  const rows = stats.data ?? [];
  const name = seasonLabel(seasonRows, chosen?.id ?? null) || 'this season';

  return (
    <>
      <p className="sub seasonsub">
        {season.length} game{season.length === 1 ? '' : 's'} in {name}
        {live ? ' incl. the game in progress' : ''}
        {pastSeason ? ' · past season, read-only' : ''}
      </p>
      {last && (
        <Group>
          <Row
            to={`/games/${last.id}`}
            label={<b>Last game</b>}
            detail={`vs ${last.opponent} · ${fmtDate(last.game_date)} · score, stats and lineup`}
            chevron
          >
            <Scoreline us={last.us} them={last.them} />
            <GameBadge game={last} />
          </Row>
        </Group>
      )}
      {seasonRows.length > 1 && (
        <div className="seasonpick">
          <label htmlFor="season-pick">Season</label>
          <select
            id="season-pick"
            className="inline"
            value={chosen?.id ?? ''}
            onChange={(e) => setSeasonId(e.target.value === current?.id ? null : e.target.value)}
          >
            {seasonRows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.is_current ? ' · current' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      <Section>Team</Section>
      <Tiles>
        <Tile label="Played" value={rec.gp} />
        <Tile label="W-L-D" value={`${rec.w}-${rec.l}-${rec.d}`} />
        <Tile label={`${unit} for`} value={rec.gf} />
        <Tile label="Against" value={rec.ga} />
        <Tile label="Diff" value={signed(rec.gf - rec.ga)} />
      </Tiles>
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
          <Row link label={`See all results (${results.length})`} onClick={() => setAllResults(true)} />
        )}
      </Group>
      <Section>Players</Section>
      <PlayerStatsTable rows={rows} from={FROM}>
        {season.length === 0 && <div className="prow">Play a game to see player stats.</div>}
        {stats.error && <div className="prow">Couldn’t load player stats. {errorMessage(stats.error)}</div>}
        {season.length > 0 && rows.length === 0 && !stats.isPending && !stats.error && (
          <div className="prow">No player stats yet.</div>
        )}
      </PlayerStatsTable>
      <Footer>
        <StatsFootnote lead="Stats come from saved games only. Removed players stay in the season totals." />
      </Footer>
    </>
  );
}
