import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { PeriodTag, Scoreline } from '@/components/Badge';
import { Button, Toolbar } from '@/components/Button';
import { Textarea } from '@/components/Form';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { Segmented } from '@/components/Segmented';
import { useActionSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { useFormations, useLineups, useLiveGame, useSavePlan } from '@/lineups/api';
import { toEnginePeriods } from '@/lineups/convert';
import { SPORTS, shortPeriod } from '@/sports/definitions';
import { emptyPeriod } from '@/sports/lineup';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import {
  type GameWithScore,
  type HomeAway,
  type PlateAppearance,
  type ScoreEvent,
  useAddPlateAppearance,
  useAddScoreEvent,
  useCoachNotes,
  useDeleteGame,
  useDeletePlateAppearance,
  useDeleteScoreEvent,
  useFinishGame,
  useGame,
  useGamePlayers,
  usePlateAppearances,
  useSaveCoachNotes,
  useScoreEvents,
  useStartGame,
  useUpdateGame,
  useUpdatePlateAppearance,
  useUpdateScoreEvent,
} from './api';
import { EditScoreSheet } from './EditScoreSheet';
import { fmtDate, fmtTime, HOME_AWAY_LABEL, scheduleLine } from './format';
import { GameBadge } from './GamesPage';
import { downloadIcs } from './ics';
import { LineScore } from './LineScore';
import { makeNameLookup, periodTag } from './names';
import { paResultLabel, paResultShort } from './batting';
import { PlateAppearanceSheet } from './PlateAppearanceSheet';
import { ScorePanel } from './ScorePanel';
import { describeEvent } from './scoring';

export function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const game = useGame(gameId);
  if (game.isPending) return <LoadingScreen />;
  if (!game.data) {
    return (
      <Page title="Game" back={{ to: '/games', label: 'Games' }}>
        <p className="sub">This game is no longer available.</p>
      </Page>
    );
  }
  return <GameDetail game={game.data} />;
}

type HomeAwayChoice = HomeAway | 'unset';

function GameDetail({ game }: { game: GameWithScore }) {
  const { teamId, team, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const isStaff = useIsStaff();
  const toast = useToast();
  const sheet = useActionSheet();
  const navigate = useNavigate();
  const { formationFor, forms } = useFormations();

  const players = usePlayers(teamId);
  const snapshots = useGamePlayers(game.id);
  const events = useScoreEvents(game.id);
  const lineups = useLineups(teamId, game.id);
  const live = useLiveGame(teamId);
  const isBaseball = S.scoring.panel === 'run';
  const pas = usePlateAppearances(game.id, isBaseball);
  const notes = useCoachNotes(game.id, isStaff);

  const update = useUpdateGame(teamId, game.id);
  const start = useStartGame(teamId);
  const finish = useFinishGame(teamId);
  const remove = useDeleteGame(teamId);
  const addEvent = useAddScoreEvent(teamId, game.id);
  const updateEvent = useUpdateScoreEvent(teamId, game.id);
  const deleteEvent = useDeleteScoreEvent(teamId, game.id);
  const addPa = useAddPlateAppearance(teamId, game.id);
  const updatePa = useUpdatePlateAppearance(teamId, game.id);
  const deletePa = useDeletePlateAppearance(teamId, game.id);
  const saveNotes = useSaveCoachNotes(game.id);
  const savePlan = useSavePlan(teamId, game.id);

  const [scoring, setScoring] = useState(false);
  const [editing, setEditing] = useState<ScoreEvent | null>(null);
  const [paEditing, setPaEditing] = useState<PlateAppearance | null>(null);
  const [paAdding, setPaAdding] = useState(false);

  const roster = players.data ?? [];
  const names = makeNameLookup(roster, snapshots.data ?? []);
  const log = events.data ?? [];
  const periods = lineups.data ?? [];
  const periodCount = Math.max(periods.length, team.periods_count, ...log.map((e) => e.period_index + 1), 1);
  const periodName = S.periodName(periodCount);
  const isLive = game.status === 'live';
  const isDone = game.status === 'done';
  const isUpcoming = game.status === 'upcoming';
  const anotherLive = !!live.data && live.data.id !== game.id;
  const first = S.scoring.events[0];
  const noun = first?.noun ?? 'score';
  const unit = S.scoring.unitPlural;
  const onError = (e: unknown) => toast(errorMessage(e));

  const sortedLog = [...log].sort(
    (a, b) => a.period_index - b.period_index || a.occurred_at.localeCompare(b.occurred_at),
  );
  const lastEvent = log[log.length - 1];
  const paList = [...(pas.data ?? [])].sort((a, b) => a.inning - b.inning || a.sequence - b.sequence);
  const currentInning = Math.max(1, ...paList.map((p) => p.inning), ...log.map((e) => e.period_index + 1));

  /* ---------- actions ---------- */

  const startFlow = () =>
    start.mutate(game.id, { onSuccess: () => toast(`Game on · vs ${game.opponent}`), onError });

  const finishFlow = async () => {
    const ok = await sheet({
      title: `Finish game vs ${game.opponent}?`,
      message: `Final: US ${game.us} – ${game.them} THEM. The lineups are saved with this game, and the final lineup becomes your plan for the next game.`,
      actions: [{ label: 'Finish game', value: true }],
    });
    if (ok)
      finish.mutate(game.id, {
        onSuccess: () => toast(`Final · US ${game.us} – ${game.them} THEM`),
        onError,
      });
  };

  const undoLast = async () => {
    if (!lastEvent) return;
    const desc = describeEvent(S, periodCount, game.opponent, lastEvent, names);
    const ok = await sheet({
      title: `Undo last ${noun}?`,
      message: desc,
      actions: [{ label: `Undo ${noun}`, value: true, destructive: true }],
    });
    if (ok) {
      deleteEvent.mutate(lastEvent.id, { onError });
      toast(`${noun[0]?.toUpperCase()}${noun.slice(1)} removed`);
    }
  };

  const deleteEditing = async () => {
    const ev = editing;
    if (!ev) return;
    setEditing(null);
    const ok = await sheet({
      title: `Delete ${noun}?`,
      message: describeEvent(S, periodCount, game.opponent, ev, names),
      actions: [{ label: `Delete ${noun}`, value: true, destructive: true }],
    });
    if (ok) {
      deleteEvent.mutate(ev.id, { onError });
      toast(`${noun[0]?.toUpperCase()}${noun.slice(1)} deleted`);
    }
  };

  const deletePaEditing = async () => {
    const pa = paEditing;
    if (!pa) return;
    setPaEditing(null);
    const ok = await sheet({
      title: 'Delete at-bat?',
      message: `Inning ${pa.inning} · ${names.name(pa.player_id)} · ${paResultLabel(pa.result)}`,
      actions: [{ label: 'Delete at-bat', value: true, destructive: true }],
    });
    if (ok) {
      deletePa.mutate(pa.id, { onError });
      toast('At-bat deleted');
    }
  };

  const addInning = () => {
    const engine = toEnginePeriods(periods);
    const last = engine[engine.length - 1];
    const f = last ? formationFor(last.formation) : forms[0];
    if (!f) return;
    savePlan.mutate([...engine, emptyPeriod(f)], {
      onSuccess: () => toast(`Inning ${engine.length + 1} added`),
      onError,
    });
  };

  const deleteFlow = async () => {
    const ok = await sheet({
      title: `Delete game vs ${game.opponent}?`,
      message: isDone
        ? `This is a completed game. Its ${unit.toLowerCase()} and lineups will be removed from the season record and stats. This cannot be undone.`
        : `This game and any ${unit.toLowerCase()} recorded in it will be removed.`,
      actions: [{ label: isDone ? 'Delete completed game' : 'Delete game', value: true, destructive: true }],
    });
    if (!ok) return;
    if (isDone) {
      const ok2 = await sheet({
        title: 'Are you sure?',
        message: `Final score US ${game.us} – ${game.them} THEM will be erased from your record.`,
        actions: [{ label: 'Yes, delete it', value: true, destructive: true }],
      });
      if (!ok2) return;
    }
    remove.mutate(game.id, {
      onSuccess: () => {
        toast('Game deleted');
        void navigate('/games', { replace: true });
      },
      onError,
    });
  };

  const patch = (p: Parameters<typeof update.mutate>[0]) => update.mutate(p, { onError });

  const calendar = () =>
    downloadIcs({
      id: game.id,
      teamName: game.team_name_snapshot ?? team.name,
      opponent: game.opponent,
      date: game.game_date,
      startTime: game.start_time,
      location: game.location,
      homeAway: game.home_away,
      notes: game.parent_notes,
    });

  /* ---------- render ---------- */

  const meta = (
    <>
      {fmtDate(game.game_date, true)}
      {game.start_time ? ` · ${fmtTime(game.start_time)}` : ''} · {game.team_name_snapshot ?? team.name} ·{' '}
      <GameBadge game={game} />
    </>
  );

  return (
    <Page
      title={`vs ${game.opponent}`}
      documentTitle={`vs ${game.opponent}`}
      sub={meta}
      back={{ to: '/games', label: 'Games' }}
    >
      {!isUpcoming && <Scoreline big us={game.us} them={game.them} />}
      {isStaff && (
        <Toolbar className="noprint">
          {isUpcoming && (
            <Button onClick={startFlow} disabled={anotherLive || start.isPending}>
              {anotherLive ? 'Finish the current game first' : 'Start game'}
            </Button>
          )}
          {(isLive || isDone) && (
            <Button variant="tinted" onClick={() => setScoring(true)}>
              Add {S.scoring.panel === 'points' ? 'score' : noun}
            </Button>
          )}
          {isLive && isBaseball && (
            <Button variant="gray" onClick={addInning} disabled={savePlan.isPending}>
              + Inning
            </Button>
          )}
          {isLive && (
            <Button onClick={() => void finishFlow()} disabled={finish.isPending}>
              Finish game
            </Button>
          )}
        </Toolbar>
      )}

      <Section>Details</Section>
      <Group>
        {isStaff ? (
          <>
            <Row label="Opponent">
              <input
                className="inline"
                aria-label="Opponent"
                defaultValue={game.opponent}
                maxLength={40}
                onBlur={(e) => {
                  const v = e.target.value.trim().slice(0, 40) || 'Opponent';
                  if (v !== game.opponent) patch({ opponent: v });
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </Row>
            <Row label="Date">
              <input
                className="inline"
                type="date"
                aria-label="Date"
                value={game.game_date}
                onChange={(e) =>
                  /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && patch({ game_date: e.target.value })
                }
              />
            </Row>
            <Row label="Start time">
              <input
                className="inline"
                type="time"
                aria-label="Start time"
                value={game.start_time?.slice(0, 5) ?? ''}
                onChange={(e) => patch({ start_time: e.target.value || null })}
              />
            </Row>
            <Row label="Location">
              <input
                className="inline"
                aria-label="Location"
                placeholder="Field / park"
                defaultValue={game.location ?? ''}
                maxLength={80}
                onBlur={(e) => {
                  const v = e.target.value.trim() || null;
                  if (v !== game.location) patch({ location: v });
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </Row>
            <Row label="Home / away">
              <Segmented<HomeAwayChoice>
                label="Home or away"
                value={game.home_away ?? 'unset'}
                onChange={(v) => patch({ home_away: v === 'unset' ? null : v })}
                options={[
                  { value: 'unset', label: '—', ariaLabel: 'Not set' },
                  { value: 'home', label: 'Home' },
                  { value: 'away', label: 'Away' },
                  { value: 'neutral', label: 'Neutral' },
                ]}
              />
            </Row>
          </>
        ) : (
          <>
            <Row label="When" value={scheduleLine(game, true)} />
            {game.location && <Row label="Where" value={game.location} />}
            {game.home_away && <Row label="Home / away" value={HOME_AWAY_LABEL[game.home_away]} />}
          </>
        )}
        <Row link onClick={calendar} label="Add to calendar" detail="Downloads an .ics file for this game" />
      </Group>
      <Section>Note for parents</Section>
      <Group>
        {isStaff ? (
          <Textarea
            className="notes"
            aria-label="Note for parents"
            defaultValue={game.parent_notes ?? ''}
            placeholder="Wear white · arrive 20 minutes early"
            rows={2}
            maxLength={500}
            onBlur={(e) => {
              const v = e.target.value.trim() || null;
              if (v !== game.parent_notes) {
                patch({ parent_notes: v });
                toast('Note saved');
              }
            }}
          />
        ) : (
          <Row label={game.parent_notes ?? 'No notes from the coach.'} />
        )}
      </Group>

      {!isUpcoming && S.scoring.panel !== 'goal' && log.length > 0 && (
        <>
          <Section>{isBaseball ? 'Line score' : `By ${periodName.toLowerCase()}`}</Section>
          <Group>
            <LineScore S={S} events={log} periodCount={periodCount} opponent={game.opponent} />
          </Group>
        </>
      )}

      {!isUpcoming && (
        <>
          <Section>
            {unit} · {game.us + game.them}
          </Section>
          <Group>
            {sortedLog.map((ev) => {
              const who =
                ev.side === 'them'
                  ? `${game.opponent} ${S.scoring.events.find((k) => k.type === ev.event_type)?.noun ?? noun}`
                  : names.name(ev.scorer_player_id) || 'Unknown scorer';
              const kind = S.scoring.events.find((k) => k.type === ev.event_type);
              const detail = [
                ev.side === 'them' ? 'Opponent' : 'Us',
                ev.side === 'us' && S.scoring.events.length > 1 ? kind?.noun : '',
                ev.side === 'us' && ev.assist_player_id
                  ? `assist ${names.name(ev.assist_player_id) || 'Unknown'}`
                  : '',
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <Row
                  key={ev.id}
                  onClick={isStaff ? () => setEditing(ev) : undefined}
                  label={
                    <>
                      <PeriodTag>{periodTag(periodName, ev.period_index)}</PeriodTag>
                      {who}
                    </>
                  }
                  detail={detail}
                  value={S.scoring.panel === 'points' ? `+${ev.points}` : undefined}
                  chevron={isStaff}
                />
              );
            })}
            {sortedLog.length === 0 && <Row label={`No ${unit.toLowerCase()} recorded.`} />}
            {isStaff && lastEvent && (
              <Row
                link
                onClick={() => void undoLast()}
                label={`Undo last ${noun}`}
                detail={describeEvent(S, periodCount, game.opponent, lastEvent, names)}
              />
            )}
          </Group>
        </>
      )}

      {isBaseball && !isUpcoming && (
        <>
          <Section>At-bats · {paList.length}</Section>
          <Group>
            {paList.map((pa) => (
              <Row
                key={pa.id}
                onClick={isStaff ? () => setPaEditing(pa) : undefined}
                label={
                  <>
                    <PeriodTag>Inn {pa.inning}</PeriodTag>
                    {names.name(pa.player_id) || 'Removed player'}
                  </>
                }
                detail={`${paResultLabel(pa.result)}${pa.rbi ? ` · ${pa.rbi} RBI` : ''}`}
                value={paResultShort(pa.result)}
                chevron={isStaff}
              />
            ))}
            {paList.length === 0 && (
              <Row label="No at-bats recorded. Tap a batter on the Lineup tab during the game." />
            )}
            {isStaff && <Row link onClick={() => setPaAdding(true)} label="Add at-bat" />}
          </Group>
        </>
      )}

      <Section>{isLive ? 'Lineups · live' : 'Lineups'}</Section>
      <Group>
        {periods.map((q, qi) => (
          <Row
            key={q.lineupId}
            className="lineuprow"
            label={
              <>
                <b>
                  {shortPeriod(S, periods.length, qi)} · {q.formation}
                </b>
                <div className="lulist">
                  {q.slots.map((id, i) => (
                    <span key={i} className="lu">
                      <b>{q.codes[i] ?? ''}</b> {id ? names.name(id) || '?' : <i>open</i>}
                    </span>
                  ))}
                  {q.slots.length === 0 && <i>no positions</i>}
                </div>
              </>
            }
          />
        ))}
        {periods.length === 0 && !lineups.isPending && (
          <Row
            label={
              isUpcoming
                ? `The ${S.field} plan is copied into this game when it starts.`
                : 'No lineups were saved with this game.'
            }
          />
        )}
        {isLive && isStaff && (
          <Row
            label={
              <span style={{ color: 'var(--text2)', fontSize: 14 }}>
                Edit this game’s lineup on the {S.field} or Team tab — it’s saved with the game when you
                finish.
              </span>
            }
          />
        )}
      </Group>

      {isStaff && (
        <>
          <Section>Coaching notes</Section>
          <Group>
            <Textarea
              key={notes.data ?? ''}
              className="notes"
              aria-label="Coaching notes"
              defaultValue={notes.data ?? ''}
              placeholder="What worked, what to practice, who stepped up…"
              rows={3}
              maxLength={4000}
              onBlur={(e) => {
                const v = e.target.value.slice(0, 4000);
                if (v !== (notes.data ?? '')) {
                  saveNotes.mutate(v, { onSuccess: () => toast('Notes saved'), onError });
                }
              }}
            />
          </Group>
          <Footer>Only coaches and assistant coaches can see these notes.</Footer>
          <Group style={{ marginTop: 18 }}>
            <Row destructive onClick={() => void deleteFlow()} label="Delete game" />
          </Group>
        </>
      )}

      {isStaff && (
        <>
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
              addEvent.mutate(ev, { onError });
              toast(
                ev.side === 'them'
                  ? `${game.opponent} scored · ${periodName} ${ev.period_index + 1}`
                  : `${first?.label === 'Goal' ? 'Goal!' : 'Scored!'} ${names.name(ev.scorer_player_id) || 'Unknown'} · ${periodName} ${ev.period_index + 1}`,
              );
            }}
            onUndo={(ev) => {
              deleteEvent.mutate(ev.id, { onError });
              toast(`Removed · ${describeEvent(S, periodCount, game.opponent, ev, names)}`);
            }}
          />
          <EditScoreSheet
            event={editing}
            onClose={() => setEditing(null)}
            S={S}
            opponent={game.opponent}
            periodCount={periodCount}
            players={roster}
            names={names}
            onSave={(p) => {
              if (editing) updateEvent.mutate({ id: editing.id, ...p }, { onError });
              toast(`${noun[0]?.toUpperCase()}${noun.slice(1)} updated`);
            }}
            onDelete={() => void deleteEditing()}
          />
          {isBaseball && (
            <PlateAppearanceSheet
              open={paAdding || !!paEditing}
              onClose={() => {
                setPaAdding(false);
                setPaEditing(null);
              }}
              existing={paEditing}
              batterId={null}
              players={roster}
              names={names}
              inning={currentInning}
              inningCount={periodCount}
              onSave={(v) => {
                if (paEditing) updatePa.mutate({ id: paEditing.id, ...v }, { onError });
                else addPa.mutate(v, { onError });
                toast(
                  paEditing ? 'At-bat updated' : `${names.name(v.player_id)} · ${paResultLabel(v.result)}`,
                );
              }}
              onDelete={() => void deletePaEditing()}
            />
          )}
        </>
      )}
    </Page>
  );
}
