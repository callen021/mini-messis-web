import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { AnnouncementBanner } from '@/board/AnnouncementBanner';
import { Scoreline } from '@/components/Badge';
import { Button, Toolbar } from '@/components/Button';
import { DirectionsIcon } from '@/components/icons';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { Segmented } from '@/components/Segmented';
import { useActionSheet } from '@/components/Sheet';
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
import { useGameClock } from '@/clock/api';
import { directionsUrl } from './directions';
import { fmtDate, fmtTime, HOME_AWAY_LABEL, todayISO } from './format';
import { GameBadge } from './GameBadge';
import { downloadScheduleIcs } from './ics';
import { makeNameLookup, periodSuffix } from './names';
import { NewGameSheet } from './NewGameSheet';
import { PracticeBadge } from './PracticeBadge';
import { type Practice, useCreatePractices, usePractices } from './practices';
import { PracticeSheet } from './PracticeSheet';
import { filterSchedule, mergeSchedule } from './recurrence';
import { scheduleEvents } from './schedule-ics';
import { ScorePanel } from './ScorePanel';
import { describeEvent, scoreNoun } from './scoring';

/** A schedule row's two detail lines: bold date and time, then the quieter place / notes. */
function When({ date, time, end }: { date: string; time: string | null; end?: string | null }) {
  const t = fmtTime(time);
  const e = fmtTime(end);
  return (
    <b className="when">
      {fmtDate(date, true)}
      {t ? ` · ${t}` : ''}
      {t && e ? ` – ${e}` : ''}
    </b>
  );
}

/** Small Directions icon at the right of a row (outside the row link: links can't nest). */
function DirectionsLink({ href, place }: { href: string | null; place: string | null }) {
  if (!href) return null;
  return (
    <a
      className="dirbtn"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Directions to ${place ?? 'the field'}`}
      title="Directions"
    >
      <DirectionsIcon />
    </a>
  );
}

/** One practice line on the schedule: quieter than a game, struck through when cancelled. */
export function PracticeRow({ practice: p, today }: { practice: Practice; today: string }) {
  const cancelled = p.status === 'cancelled';
  const directions = cancelled ? null : directionsUrl(p.address, p.location);
  return (
    <div className="rowwrap">
      <Row
        to={`/practices/${p.id}`}
        className={`${cancelled ? 'practice cancelled' : 'practice'}${directions ? ' hasdir' : ''}`}
        label={<span className={cancelled ? 'strike' : undefined}>Practice</span>}
        detail={
          <>
            <When date={p.practice_date} time={p.start_time} end={p.end_time} />
            {(p.location || (p.notes && !cancelled)) && (
              <>
                <br />
                {[p.location, cancelled ? '' : p.notes].filter(Boolean).join(' · ')}
              </>
            )}
          </>
        }
        chevron
      >
        <PracticeBadge practice={p} today={today} />
      </Row>
      <DirectionsLink href={directions} place={p.address ?? p.location} />
    </div>
  );
}

function GameRow({ game: g, today }: { game: GameWithScore; today: string }) {
  const directions = directionsUrl(g.address, g.location);
  const place = [g.location, g.home_away ? HOME_AWAY_LABEL[g.home_away] : ''].filter(Boolean).join(' · ');
  return (
    <div className="rowwrap">
      <Row
        to={`/games/${g.id}`}
        className={directions ? 'hasdir' : undefined}
        label={`vs ${g.opponent}`}
        detail={
          <>
            <When date={g.game_date} time={g.start_time} />
            {(place || g.parent_notes) && (
              <>
                <br />
                {[place, g.parent_notes].filter(Boolean).join(' · ')}
              </>
            )}
          </>
        }
        chevron
      >
        <GameBadge game={g} today={today} />
      </Row>
      <DirectionsLink href={directions} place={g.address ?? g.location} />
    </div>
  );
}

type AddChoice = 'game' | 'practice';

/**
 * The Schedule tab (/games): what is coming up, games and practices merged by date, with the live
 * game pinned on top. Completed games live under Stats → Season.
 */
export function GamesPage() {
  const { teamId, team } = useCurrentTeam();
  const isStaff = useIsStaff();
  const toast = useToast();
  const sheet = useActionSheet();
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
  const upcoming = mergeSchedule(list, practices.data ?? [], today);
  const shown = filterSchedule(upcoming, view);
  const gameCount = upcoming.filter((i) => i.kind === 'game').length;
  const practiceCount = upcoming.length - gameCount;
  const events = scheduleEvents(upcoming, team.name);

  const addFlow = async () => {
    const choice = await sheet<AddChoice>({
      title: 'Add to the schedule',
      actions: [
        { label: live ? 'Schedule another game' : 'New game', value: 'game' },
        { label: 'New practice', value: 'practice' },
      ],
    });
    if (choice === 'game') setCreating(true);
    else if (choice === 'practice') setAddingPractice(true);
  };

  const addAll = () => {
    downloadScheduleIcs(team.name, events, team.timezone);
    toast(`${events.length} event${events.length === 1 ? '' : 's'} ready for your calendar`);
  };

  const onCreate = (input: Parameters<typeof create.mutate>[0]) => {
    create.mutate(input, {
      onSuccess: (g) => {
        setCreating(false);
        toast(input.start ? `Game on · vs ${g.opponent}` : 'Game scheduled');
        if (input.start) void navigate(`/games/${g.id}`);
        else if (view === 'practices') setView('all');
      },
      onError: (e) => toast(errorMessage(e)),
    });
  };
  const onCreatePractices = (input: Parameters<typeof createPractices.mutate>[0]) => {
    createPractices.mutate(input, {
      onSuccess: (n) => {
        setAddingPractice(false);
        toast(n === 1 ? 'Practice added' : `${n} practices added`);
        if (view === 'games') setView('all');
      },
      onError: (e) => toast(errorMessage(e)),
    });
  };

  const counts = [
    gameCount ? `${gameCount} game${gameCount === 1 ? '' : 's'}` : '',
    practiceCount ? `${practiceCount} practice${practiceCount === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const empty =
    view === 'games'
      ? 'No upcoming games.'
      : view === 'practices'
        ? 'No upcoming practices.'
        : isStaff
          ? 'Nothing scheduled. Tap + Add for a game or a practice.'
          : 'Nothing scheduled yet. The coach adds games and practices here.';

  return (
    <Page
      title="Schedule"
      sub={counts ? `${team.name} · ${counts} coming up` : `${team.name} · nothing coming up`}
      action={
        isStaff ? (
          // a labelled capsule in the accent colour, readable in light and dark (D104); on the Games
          // or Practices tab it opens that form directly
          <Button
            size="sm"
            className="noprint"
            aria-label="Add"
            onClick={() => {
              if (view === 'games') setCreating(true);
              else if (view === 'practices') setAddingPractice(true);
              else void addFlow();
            }}
          >
            + Add
          </Button>
        ) : undefined
      }
    >
      <AnnouncementBanner />
      {live && <LiveGameCard game={live} />}
      {events.length > 0 && (
        <Toolbar className={`noprint${live ? ' mt-3' : ''}`}>
          <Button variant="tinted" onClick={addAll}>
            Add all to calendar
          </Button>
        </Toolbar>
      )}
      <Segmented<GamesView>
        wide
        label="Schedule view"
        value={view}
        onChange={setView}
        options={[
          { value: 'all', label: 'All' },
          { value: 'games', label: 'Games' },
          { value: 'practices', label: 'Practices' },
        ]}
        className={live || events.length ? 'mt-3' : undefined}
      />
      <Section>Coming up</Section>
      <Group>
        {shown.map((item) =>
          item.kind === 'game' ? (
            <GameRow key={item.game.id} game={item.game} today={today} />
          ) : (
            <PracticeRow key={item.practice.id} practice={item.practice} today={today} />
          ),
        )}
        {shown.length === 0 && <Row label={empty} />}
      </Group>
      <Footer>
        Games and practices are listed together by date. A cancelled practice stays crossed out so nobody
        shows up to an empty field. Past games and the season record are under Stats → Season. Add all to
        calendar saves every upcoming event in one go; the arrow on a row opens directions.
      </Footer>
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
  const { teamId, team, sport } = useCurrentTeam();
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
  const clockMode = team.time_mode === 'clock';
  const gameClock = useGameClock(game.id, clockMode);
  const periodCount = clockMode ? team.clock_periods : plan.periods.length || 1;
  const first = S.scoring.events[0];
  const noun = scoreNoun(S);
  const recorded =
    S.scoring.panel === 'points'
      ? `${game.us + game.them} point${game.us + game.them === 1 ? '' : 's'} recorded`
      : `${log.length} ${noun}${log.length === 1 ? '' : 's'} recorded`;

  const finishFlow = async () => {
    const ok = await sheet({
      title: `Finish game vs ${game.opponent}?`,
      message: clockMode
        ? `Final: US ${game.us} – ${game.them} THEM. The clock stops, playing time is saved with this game, and the starting lineup stays your plan for the next game.`
        : `Final: US ${game.us} – ${game.them} THEM. The lineups are saved with this game, and the final lineup becomes your plan for the next game.`,
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
            initialPeriod={
              clockMode
                ? Math.min(gameClock.data?.periodIndex ?? 0, periodCount - 1)
                : Math.max(0, periodCount - 1)
            }
            lockPeriod={clockMode}
            players={roster.filter((p) => p.is_available)}
            names={names}
            events={log}
            onAdd={(ev) => {
              add.mutate(ev, { onError: (e) => toast(errorMessage(e)) });
              toast(
                ev.side === 'them'
                  ? `${game.opponent} scored${periodSuffix(S.periodName(periodCount), ev.period_index)}`
                  : `${first?.label === 'Goal' ? 'Goal!' : 'Scored!'} ${names.name(ev.scorer_player_id) || 'Unknown'}${periodSuffix(S.periodName(periodCount), ev.period_index)}`,
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
