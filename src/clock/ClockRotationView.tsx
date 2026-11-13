import { useMemo } from 'react';
import { Button, Toolbar } from '@/components/Button';
import { Footer, Group, Section } from '@/components/List';
import { Switch } from '@/components/Switch';
import { useToast } from '@/components/Toast';
import { useGames } from '@/games/api';
import { completedGames } from '@/games/stats';
import { cn } from '@/lib/cn';
import { pinFirst } from '@/lib/pin';
import { errorMessage } from '@/lib/supabase';
import { useLiveGame } from '@/lineups/api';
import { useEveryoneBack, useSetAvailable } from '@/roster/api';
import { usePlannedGame, useSetRsvp } from '@/rsvp/api';
import { SPORTS, shortPeriod } from '@/sports/definitions';
import { type Player } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useGameClock, useStints } from './api';
import {
  PAUSED_CLOCK,
  formatClock,
  formatMinutes,
  isFullTime,
  isRunning,
  minutesBalance,
  playerTimes,
} from './clock';
import { useServerNow } from './useNow';

/**
 * Team → Rotation for a clock-mode team (D72): one row per player with minutes this game as a
 * bar, the number of shifts and an on-field dot, updating live; a minutes balance summary,
 * informational only. Shows the live game, else the most recent completed one.
 */
export function ClockRotationView({
  players,
  canEdit,
  highlight,
}: {
  players: Player[];
  canEdit: boolean;
  highlight: ReadonlySet<string>;
}) {
  const { teamId, team, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const N = team.clock_periods;
  const toast = useToast();
  const live = useLiveGame(teamId);
  const games = useGames(teamId);
  const setAvailable = useSetAvailable(teamId);
  const everyoneBack = useEveryoneBack(teamId);
  const planned = usePlannedGame(teamId);
  const setRsvp = useSetRsvp(teamId);
  const parentOut = planned.parentOut;
  const game = live.data ?? completedGames(games.data ?? [])[0] ?? null;
  const isLive = !!live.data;
  const clockQ = useGameClock(game?.id, !!game);
  const stintsQ = useStints(game?.id, !!game);
  const clock = clockQ.data ?? PAUSED_CLOCK;
  const now = useServerNow(isLive && isRunning(clock));

  // a parent's "can't make it" for the planned game counts as out here too (D107)
  const active = players.filter((p) => p.is_available && !parentOut.has(p.id));
  const outs = players.filter((p) => !p.is_available || parentOut.has(p.id));
  const times = useMemo(
    () =>
      playerTimes(
        stintsQ.data ?? [],
        clock,
        now,
        players.map((p) => p.id),
      ),
    [stintsQ.data, clock, now, players],
  );
  const max = Math.max(1, ...active.map((p) => times.get(p.id)?.seconds ?? 0));
  const bal = minutesBalance(active.map((p) => times.get(p.id)?.seconds ?? 0));
  const ordered = highlight.size ? pinFirst(active, (p) => highlight.has(p.id)) : active;

  const toggle = (p: Player, on: boolean) => {
    if (on && parentOut.has(p.id) && planned.game) {
      // the coach overrides the parent's reply for that game (which also lifts the coach flag)
      setRsvp.mutate(
        { event: { kind: 'game', id: planned.game.id }, playerId: p.id, status: 'going' },
        { onError: (e) => toast(errorMessage(e)) },
      );
      toast(`${p.first_name} is back in · reply set to Going`);
      return;
    }
    setAvailable.mutate({ id: p.id, available: on }, { onError: (e) => toast(errorMessage(e)) });
    toast(on ? `${p.first_name} is back in` : `${p.first_name} out`);
  };

  const row = (p: Player, isOut: boolean) => {
    const t = times.get(p.id);
    const secs = t?.seconds ?? 0;
    return (
      <div
        key={p.id}
        className={cn(
          'prow minrow',
          isOut && 'out',
          t?.onField && !isOut && 'onfield',
          highlight.has(p.id) && 'mine',
        )}
      >
        {canEdit && (
          <Switch
            label={
              isOut
                ? `${p.first_name} is out — tap to make active`
                : `${p.first_name} is playing today — tap to mark out`
            }
            size="sm"
            checked={!isOut}
            onChange={(on) => toggle(p, on)}
          />
        )}
        <div className="pname">
          {p.first_name}
          {p.jersey_number && <small>#{p.jersey_number}</small>}
        </div>
        {isOut && parentOut.has(p.id) && (
          <span className="pnote">
            {planned.byParent.has(p.id) ? 'Parent: can’t make it' : 'Out for this game'}
          </span>
        )}
        {!isOut && (
          <div
            className="minutes"
            role="img"
            aria-label={`${p.first_name}: ${formatMinutes(secs)}, ${t?.shifts ?? 0} shift${t?.shifts === 1 ? '' : 's'}${t?.onField ? `, on the field at ${t.code}` : ''}`}
          >
            <div className="minbar">
              <i style={{ width: `${Math.round((100 * secs) / max)}%` }} />
            </div>
            <span className="mintext">
              <b>{formatMinutes(secs)}</b> · {t?.shifts ?? 0} shift{t?.shifts === 1 ? '' : 's'}
              {t?.onField ? ` · on at ${t.code}` : ''}
            </span>
          </div>
        )}
      </div>
    );
  };

  const title = !game
    ? 'Playing time'
    : isLive
      ? `Playing time · vs ${game.opponent} · ${isFullTime(clock, N) ? 'full time' : `${shortPeriod(S, N, Math.min(clock.periodIndex, N - 1))} ${formatClock(clock.clockSeconds + (isRunning(clock) ? Math.max(0, Math.floor((now - Date.parse(clock.runningSince ?? '')) / 1000)) : 0))}`}`
      : `Playing time · last game vs ${game.opponent}`;

  return (
    <>
      {canEdit && outs.length > 0 && (
        <Toolbar>
          <Button
            variant="gray"
            onClick={() =>
              everyoneBack.mutate(undefined, {
                onError: (e) => toast(errorMessage(e)),
                onSuccess: () => toast('Everyone is active'),
              })
            }
          >
            Everyone’s back
          </Button>
        </Toolbar>
      )}
      <Section>{title}</Section>
      <Group>
        {game ? (
          ordered.map((p) => row(p, false))
        ) : (
          <div className="prow">Minutes appear here once a game is on the clock.</div>
        )}
        {game && !active.length && <div className="prow">Add players on the Roster view.</div>}
      </Group>
      {outs.length > 0 && (
        <>
          <Section>Out this game</Section>
          <Group>{outs.map((p) => row(p, true))}</Group>
        </>
      )}
      {game && (
        <>
          <Section>Balance</Section>
          <Group>
            <div className="balance">
              {bal ? (
                <>
                  <p>
                    Range{' '}
                    <b>
                      {bal.min}–{bal.max}
                    </b>{' '}
                    min · average <b>{bal.average}</b>
                  </p>
                  <div
                    className="meter"
                    role="img"
                    aria-label={`Playing time spread: least ${bal.min}, most ${bal.max} minutes`}
                  >
                    <i className={bal.spread ? 'spread' : undefined} style={{ width: `${bal.percent}%` }} />
                  </div>
                  <p>
                    {bal.spread
                      ? 'Consider giving more time to the players with fewer minutes.'
                      : 'Playing time is reasonably balanced.'}
                  </p>
                </>
              ) : (
                <p>Add players to begin.</p>
              )}
            </div>
          </Group>
        </>
      )}
      <Footer>
        {isLive
          ? 'Minutes come from the game clock and update live. Substitutions are made on the Field tab.'
          : game
            ? 'Minutes from the most recent game. Staff can correct a player’s time on that game’s page.'
            : 'Start a game on the Field tab; the clock and substitutions there feed this view.'}
      </Footer>
    </>
  );
}
