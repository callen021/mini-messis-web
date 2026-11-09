import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { Badge, Scoreline } from '@/components/Badge';
import { Button, Toolbar } from '@/components/Button';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { useActionSheet } from '@/components/Sheet';
import { Tile, Tiles } from '@/components/Tile';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { useCurrentPlan } from '@/lineups/api';
import { SPORTS } from '@/sports/definitions';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import {
  type GameWithScore,
  useAddScoreEvent,
  useCreateGame,
  useDeleteScoreEvent,
  useFinishGame,
  useGames,
  useScoreEvents,
} from './api';
import { fmtDate, scheduleLine } from './format';
import { makeNameLookup } from './names';
import { NewGameSheet } from './NewGameSheet';
import { ScorePanel } from './ScorePanel';
import { describeEvent, scoreNoun } from './scoring';
import { gameResult, teamRecord } from './stats';

/** Win / Loss / Draw / In progress / Upcoming badge. */
export function GameBadge({ game }: { game: GameWithScore }) {
  if (game.status === 'live') return <Badge status="live">In progress</Badge>;
  if (game.status === 'upcoming') return <Badge status="upcoming">Upcoming</Badge>;
  const r = gameResult(game);
  return <Badge status="done">{r === 'W' ? 'Win' : r === 'L' ? 'Loss' : 'Draw'}</Badge>;
}

export function GamesPage() {
  const { teamId, team, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const isStaff = useIsStaff();
  const toast = useToast();
  const navigate = useNavigate();
  const games = useGames(teamId);
  const create = useCreateGame(teamId);
  const [creating, setCreating] = useState(false);

  if (games.isPending) return <LoadingScreen />;
  const list = games.data ?? [];
  const live = list.find((g) => g.status === 'live') ?? null;
  const upcoming = list
    .filter((g) => g.status === 'upcoming')
    .sort(
      (a, b) =>
        a.game_date.localeCompare(b.game_date) || (a.start_time ?? '').localeCompare(b.start_time ?? ''),
    );
  const season = list.filter((g) => g.status !== 'upcoming');
  const done = season.filter((g) => g.status === 'done');
  const rec = teamRecord(done);
  const unit = S.scoring.unitPlural;

  const onCreate = (input: Parameters<typeof create.mutate>[0]) => {
    create.mutate(input, {
      onSuccess: (g) => {
        setCreating(false);
        toast(input.start ? `Game on · vs ${g.opponent}` : 'Game scheduled');
        if (input.start) void navigate(`/games/${g.id}`);
      },
      onError: (e) => toast(errorMessage(e)),
    });
  };

  return (
    <Page
      title="Games"
      sub={
        done.length
          ? `${team.name} · ${rec.w}-${rec.l}-${rec.d} this season`
          : `${team.name} · no completed games yet`
      }
    >
      <Tiles>
        <Tile label="Played" value={rec.gp} />
        <Tile label="Wins" value={rec.w} />
        <Tile label="Losses" value={rec.l} />
        <Tile label="Draws" value={rec.d} />
        <Tile label={`${unit} for`} value={rec.gf} />
        <Tile label="Against" value={rec.ga} />
      </Tiles>
      {live && <LiveGameCard game={live} />}
      {isStaff && (
        <Toolbar className="mt-3">
          <Button onClick={() => setCreating(true)}>{live ? 'Schedule another game' : 'New game'}</Button>
        </Toolbar>
      )}
      {upcoming.length > 0 && (
        <>
          <Section>Upcoming</Section>
          <Group>
            {upcoming.map((g) => (
              <Row
                key={g.id}
                to={`/games/${g.id}`}
                label={`vs ${g.opponent}`}
                detail={
                  <>
                    {scheduleLine(g, true)}
                    {g.parent_notes && (
                      <>
                        <br />
                        {g.parent_notes}
                      </>
                    )}
                  </>
                }
                chevron
              >
                <GameBadge game={g} />
              </Row>
            ))}
          </Group>
        </>
      )}
      <Section>Season</Section>
      <Group>
        {season.map((g) => (
          <Row
            key={g.id}
            to={`/games/${g.id}`}
            className="gamerow"
            label={`vs ${g.opponent}`}
            detail={`${fmtDate(g.game_date)}${g.status === 'live' ? ' · in progress' : ''}`}
            chevron
          >
            <Scoreline us={g.us} them={g.them} />
            <GameBadge game={g} />
          </Row>
        ))}
        {season.length === 0 && (
          <Row
            label={
              isStaff
                ? 'No games yet. Tap New game when you’re ready to play.'
                : 'No games yet. The coach schedules games here.'
            }
          />
        )}
      </Group>
      <Footer>
        Record is counted from completed games only. Each game keeps its own copy of the{' '}
        {S.periodName(team.periods_count).toLowerCase()} lineups, so later changes to your rotation never
        alter a finished game.
      </Footer>
      {isStaff && (
        <NewGameSheet
          open={creating}
          onClose={() => setCreating(false)}
          liveExists={!!live}
          busy={create.isPending}
          onSubmit={onCreate}
        />
      )}
    </Page>
  );
}

/** The in-progress card: score, Add score, Finish. Hooks are scoped to the live game's id. */
function LiveGameCard({ game }: { game: GameWithScore }) {
  const { teamId, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const isStaff = useIsStaff();
  const toast = useToast();
  const sheet = useActionSheet();
  const navigate = useNavigate();
  const plan = useCurrentPlan(teamId);
  const players = usePlayers(teamId);
  const events = useScoreEvents(game.id);
  const add = useAddScoreEvent(teamId, game.id);
  const del = useDeleteScoreEvent(teamId, game.id);
  const finish = useFinishGame(teamId);
  const [scoring, setScoring] = useState(false);

  const roster = players.data ?? [];
  const names = makeNameLookup(roster);
  const log = events.data ?? [];
  const periodCount = plan.periods.length || 1;
  const first = S.scoring.events[0];
  const noun = scoreNoun(S);
  const recorded =
    S.scoring.panel === 'points'
      ? `${game.us + game.them} point${game.us + game.them === 1 ? '' : 's'} recorded`
      : `${log.length} ${noun}${log.length === 1 ? '' : 's'} recorded`;

  const finishFlow = async () => {
    const ok = await sheet({
      title: `Finish game vs ${game.opponent}?`,
      message: `Final: US ${game.us} – ${game.them} THEM. The lineups are saved with this game, and the final lineup becomes your plan for the next game.`,
      actions: [{ label: 'Finish game', value: true }],
    });
    if (!ok) return;
    finish.mutate(game.id, {
      onSuccess: () => toast(`Final · US ${game.us} – ${game.them} THEM`),
      onError: (e) => toast(errorMessage(e)),
    });
  };

  return (
    <Group className="livecard">
      <Row
        onClick={() => void navigate(`/games/${game.id}`)}
        label={<b>In progress · vs {game.opponent}</b>}
        detail={`${fmtDate(game.game_date)} · ${recorded} · tap for details`}
      >
        <Scoreline us={game.us} them={game.them} />
      </Row>
      {isStaff && (
        <>
          <Toolbar className="livebar">
            <Button variant="tinted" onClick={() => setScoring(true)}>
              Add score
            </Button>
            <Button onClick={() => void finishFlow()} disabled={finish.isPending}>
              Finish game
            </Button>
          </Toolbar>
          <ScorePanel
            open={scoring}
            onClose={() => setScoring(false)}
            S={S}
            opponent={game.opponent}
            periodCount={periodCount}
            initialPeriod={Math.max(0, periodCount - 1)}
            players={roster.filter((p) => p.is_available)}
            names={names}
            events={log}
            onAdd={(ev) => {
              add.mutate(ev, { onError: (e) => toast(errorMessage(e)) });
              toast(
                ev.side === 'them'
                  ? `${game.opponent} scored · ${S.periodName(periodCount)} ${ev.period_index + 1}`
                  : `${first?.label === 'Goal' ? 'Goal!' : 'Scored!'} ${names.name(ev.scorer_player_id) || 'Unknown'} · ${S.periodName(periodCount)} ${ev.period_index + 1}`,
              );
            }}
            onUndo={(ev) => {
              del.mutate(ev.id, { onError: (e) => toast(errorMessage(e)) });
              toast(`Removed · ${describeEvent(S, periodCount, game.opponent, ev, names)}`);
            }}
          />
        </>
      )}
    </Group>
  );
}
