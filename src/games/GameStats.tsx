import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/icons';
import { Footer, Section } from '@/components/List';
import { errorMessage } from '@/lib/supabase';
import { useCurrentTeam } from '@/teams/TeamContext';
import { usePlayerStats } from './api';
import { PlayerStatsTable, StatsFootnote } from './PlayerStatsTable';

/**
 * One game's per-player stats (D135; it was Stats → Current game): on the Field tab while the
 * game is live, and on the game's own page during and after it.
 *
 * On the Field tab it is `collapsed` to one line until tapped: the live court has to fit a phone
 * screen without scrolling (D108), and the table is as long as the roster.
 */
export function GameStats({
  gameId,
  live,
  from,
  collapsed = false,
}: {
  gameId: string;
  live: boolean;
  /** Where a player's page goes back to. */
  from: { to: string; label: string };
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(!collapsed);
  const title = live ? 'Player stats · this game' : 'Player stats';
  return (
    <div className="gamestats noprint">
      {collapsed ? (
        <button type="button" className="statstoggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {title}
          {open ? <ChevronUpIcon aria-hidden="true" /> : <ChevronDownIcon aria-hidden="true" />}
        </button>
      ) : (
        <Section>{title}</Section>
      )}
      {open && <GameStatsTable gameId={gameId} live={live} from={from} />}
    </div>
  );
}

/** Loads only once shown, so a collapsed Field tab asks the server for nothing. */
function GameStatsTable({
  gameId,
  live,
  from,
}: {
  gameId: string;
  live: boolean;
  from: { to: string; label: string };
}) {
  const { teamId } = useCurrentTeam();
  const stats = usePlayerStats(teamId, gameId);
  const rows = stats.data ?? [];
  return (
    <>
      <PlayerStatsTable rows={rows} from={from}>
        {stats.error && <div className="prow">Couldn’t load player stats. {errorMessage(stats.error)}</div>}
        {rows.length === 0 && !stats.isPending && !stats.error && (
          <div className="prow">No player stats yet.</div>
        )}
      </PlayerStatsTable>
      <Footer>
        <StatsFootnote lead={live ? 'Updates as the game is scored.' : 'From the saved game.'} />
      </Footer>
    </>
  );
}
