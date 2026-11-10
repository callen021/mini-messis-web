import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { Badge, Scoreline } from '@/components/Badge';
import { Button, Toolbar } from '@/components/Button';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { Segmented } from '@/components/Segmented';
import { useActionSheet } from '@/components/Sheet';
import { Tile, Tiles } from '@/components/Tile';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { type GamesView, useUIStore } from '@/lib/ui-store';
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
import { fmtDate, scheduleLine, todayISO } from './format';
import { makeNameLookup } from './names';
import { NewGameSheet } from './NewGameSheet';
import { PracticeBadge } from './PracticePage';
import { type Practice, useCreatePractices, usePractices } from './practices';
import { PracticeSheet } from './PracticeSheet';
import { mergeSchedule, pastPractices, practiceLine } from './recurrence';
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

/** One practice line on the schedule: quieter than a game, struck through when cancelled. */
export function PracticeRow({ practice: p, past }: { practice: Practice; past?: boolean }) {
  const cancelled = p.status === 'cancelled';
  return (
    <Row
      to={`/practices/${p.id}`}
      className={cancelled ? 'practice cancelled' : 'practice'}
      label={<span className={cancelled ? 'strike' : undefined}>Practice</span>}
      detail={
        <>
          {practiceLine(p, !past)}
          {p.notes && !cancelled && (
            <>
              <br />
              {p.notes}
            </>
          )}
        </>
      }
      chevron
    >
      <PracticeBadge practice={p} />
    </Row>
  );
}

export function GamesPage() {
  const { teamId, team, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const isStaff = useIsStaff();
  const toast = useToast();
  const navigate = useNavigate();
  const view = useUIStore((s) => s.gamesView);
  const setView = useUIStore((s) => s.setGamesView);
  const games = useGames(teamId);
  const practices = usePractices(teamId);
  const create = useCreateGame(teamId);
  const createPractices = useCreatePractices(teamId);
  const [creating, setCreating] = useState(false);
  const [addingPractice, setAddingPractice] = useState(false);

  if (games.isPending || practices.isPending) return <LoadingScreen />;
  const list = games.data ?? [];
  const live = list.find((g) => g.status === 'live') ?? null;
  const today = todayISO();
  const schedule = mergeSchedule(list, practices.data ?? [], today);
  const earlier = pastPractices(practices.data ?? [], today);
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
        else setView('schedule');
      },
      onError: (e) => toast(errorMessage(e)),
    });
  };
  const onCreatePractices = (input: Parameters<typeof createPractices.mutate>[0]) => {
    createPractices.mutate(input, {
      onSuccess: (n) => {
        setAddingPractice(false);
        toast(n === 1 ? 'Practice added' : `${n} practices added`);
        setView('schedule');
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
      {live && <LiveGameCard game={live} />}
      {isStaff && (
        <Toolbar className="mt-3">
          <Button onClick={() => setCreating(true)}>{live ? 'Schedule another game' : 'New game'}</Button>
          <Button variant="gray" onClick={() => setAddingPractice(true)}>
            New practice
          </Button>
        </Toolbar>
      )}
      <Segmented<GamesView>
        wide
        label="Games view"
        value={view}
        onChange={setView}
        options={[
          { value: 'schedule', label: 'Schedule' },
          { value: 'results', label: 'Results' },
        ]}
      />
      {view === 'schedule' ? (
        <>
          <Section>Coming up</Section>
          <Group>
            {schedule.map((item) =>
              item.kind === 'game' ? (
                <Row
                  key={item.game.id}
                  to={`/games/${item.game.id}`}
                  label={`vs ${item.game.opponent}`}
                  detail={
                    <>
                      {scheduleLine(item.game, true)}
                      {item.game.parent_notes && (
                        <>
                          <br />
                          {item.game.parent_notes}
                        </>
                      )}
                    </>
                  }
                  chevron
                >
                  <GameBadge game={item.game} />
                </Row>
              ) : (
                <PracticeRow key={item.practice.id} practice={item.practice} />
              ),
            )}
            {schedule.length === 0 && (
              <Row
                label={
                  isStaff
                    ? 'Nothing scheduled. Add a game or a practice above.'
                    : 'Nothing scheduled yet. The coach adds games and practices here.'
                }
              />
            )}
          </Group>
          {earlier.length > 0 && (
            <>
              <Section>Past practices</Section>
              <Group>
                {earlier.map((p) => (
                  <PracticeRow key={p.id} practice={p} past />
                ))}
              </Group>
            </>
          )}
          <Footer>
            Games and practices are listed together by date. A cancelled practice stays crossed out so nobody
            shows up to an empty field. Each game and practice has an Add to calendar link.
          </Footer>
        </>
      ) : (
        <>
          <Tiles>
            <Tile label="Played" value={rec.gp} />
            <Tile label="Wins" value={rec.w} />
            <Tile label="Losses" value={rec.l} />
            <Tile label="Draws" value={rec.d} />
            <Tile label={`${unit} for`} value={rec.gf} />
            <Tile label="Against" value={rec.ga} />
          </Tiles>
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
                    ? 'No games played yet. Tap New game when you’re ready to play.'
                    : 'No games played yet. Results appear here after the first game.'
                }
              />
            )}
          </Group>
          <Footer>
            Record is counted from completed games only. Each game keeps its own copy of the{' '}
            {S.periodName(team.periods_count).toLowerCase()} lineups, so later changes to your rotation never
            alter a finished game.
          </Footer>
        </>
      )}
      {isStaff && (
        <>
          <NewGameSheet
            open={creating}
            onClose={() => setCreating(false)}
            liveExists={!!live}
            busy={create.isPending}
            onSubmit={onCreate}
          />
          <PracticeSheet
            open={addingPractice}
            onClose={() => setAddingPractice(false)}
            busy={createPractices.isPending}
            onSubmit={onCreatePractices}
          />
        </>
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
