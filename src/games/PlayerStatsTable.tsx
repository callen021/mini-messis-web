import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { useIsStaff } from '@/auth/guards';
import { Group } from '@/components/List';
import { cn } from '@/lib/cn';
import { pinFirst } from '@/lib/pin';
import { useMyChildren } from '@/lineups/api';
import { SPORTS } from '@/sports/definitions';
import { useCurrentTeam } from '@/teams/TeamContext';
import { formatStat, type PlayerStatRow, sortRows, statColumns } from './stats';

/**
 * The per-player stats table, for a season or one game. The rows come from the server, which
 * already applies the team's privacy setting (D56): on an "Own" team a parent gets individual
 * numbers for their own children only.
 */
export function PlayerStatsTable({
  rows: data,
  from,
  children,
}: {
  rows: readonly PlayerStatRow[];
  /** Where a player's page goes back to. */
  from: { to: string; label: string };
  /** Rows shown under the table: empty and error messages. */
  children?: ReactNode;
}) {
  const { team, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const isStaff = useIsStaff();
  const kids = useMyChildren();
  const cols = statColumns(S, team.time_mode === 'clock', team.tracked_stats);
  const sorted = sortRows(
    [...data],
    cols.map((c) => c.key),
    S.scoring.hot,
  );
  // a parent's own children lead the table (D54); staff see the plain ranking
  const mine = kids.data ?? new Set<string>();
  const rows = isStaff ? sorted : pinFirst(sorted, (r) => mine.has(r.player_id));
  return (
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
                to={`/players/${r.player_id}/skills`}
                state={{ from: from.to, fromLabel: from.label }}
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
      {children}
    </Group>
  );
}

/** The footnote under a stats table: what the columns mean and who sees what. */
export function StatsFootnote({ lead }: { lead: string }) {
  const { team, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const isStaff = useIsStaff();
  return (
    <>
      {lead}{' '}
      {sport === 'volleyball'
        ? 'PTS is points played on the court; SETS is sets with time on the court. '
        : team.time_mode === 'clock'
          ? 'MIN is minutes on the field from the game clock. '
          : ''}
      {S.scoring.panel === 'run'
        ? 'AVG is hits divided by at-bats; walks, hit by pitch and sacrifices are not at-bats. '
        : ''}
      {!isStaff && team.parent_stats === 'own'
        ? 'Individual stats are shown for your own children; team totals cover everyone.'
        : ''}
    </>
  );
}
