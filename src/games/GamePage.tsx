import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { useOfferBoardPost } from '@/board/offer';
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
  useCurrentSeason,
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
import { DirectionsIcon } from '@/components/icons';
import { useGameClock } from '@/clock/api';
import { PlayingTimeSection } from '@/clock/PlayingTimeSection';
import { directionsUrl } from './directions';
import { EditScoreSheet } from './EditScoreSheet';
import { fmtDate, fmtTime, HOME_AWAY_LABEL, todayISO } from './format';
import { GameBadge } from './GameBadge';
import { downloadIcs } from './ics';
import { PlaceDatalist } from './PlaceDatalist';
import { addressFor, useTeamPlaces } from './places';
import { LineScore } from './LineScore';
import { eventTag, makeNameLookup, periodSuffix } from './names';
import { paResultLabel, paResultShort } from './batting';
import { PlateAppearanceSheet } from './PlateAppearanceSheet';
import { ScorePanel } from './ScorePanel';
import { describeEvent, scoreNoun } from './scoring';

export function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const game = useGame(gameId);
  if (game.isPending) return <LoadingScreen />;
  if (!game.data) {
    return (
      <Page title="Game" back={{ to: '/games', label: 'Schedule' }}>
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
  const currentSeason = useCurrentSeason(game.team_id); // the game's own team: it may be viewed from another
  // a game of a past season is viewable, never editable (D94)
  const pastSeason = !!currentSeason.data && game.season_id !== currentSeason.data.id;
  const canEdit = isStaff && !pastSeason;

  const players = usePlayers(teamId);
  const snapshots = useGamePlayers(game.id);
  const events = useScoreEvents(game.id);
  const lineups = useLineups(teamId, game.id);
  const live = useLiveGame(teamId);
  const isBaseball = S.scoring.panel === 'run';
  const pas = usePlateAppearances(game.id, isBaseball);
  const notes = useCoachNotes(game.id, isStaff);
  const places = useTeamPlaces(teamId, isStaff);
  const directions = directionsUrl(game.address, game.location);

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
  const offerPost = useOfferBoardPost();

  const [scoring, setScoring] = useState(false);
  const [editing, setEditing] = useState<ScoreEvent | null>(null);
  const [paEditing, setPaEditing] = useState<PlateAppearance | null>(null);
  const [paAdding, setPaAdding] = useState(false);

  const roster = players.data ?? [];
  const names = makeNameLookup(roster, snapshots.data ?? []);
  const log = events.data ?? [];
  const periods = lineups.data ?? [];
  const clockMode = team.time_mode === 'clock';
  const gameClock = useGameClock(game.id, clockMode && game.status === 'live');
  const periodCount = Math.max(
    periods.length,
    clockMode ? team.clock_periods : team.periods_count,
    ...log.map((e) => e.period_index + 1),
    1,
  );
  const periodName = S.periodName(periodCount);
  const isLive = game.status === 'live';
  const isDone = game.status === 'done';
  const isUpcoming = game.status === 'upcoming';
  const anotherLive = !!live.data && live.data.id !== game.id;
  const first = S.scoring.events[0];
  const noun = scoreNoun(S);
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
      message: clockMode
        ? `Final: US ${game.us} – ${game.them} THEM. The clock stops, playing time is saved with this game, and the starting lineup stays your plan for the next game.`
        : `Final: US ${game.us} – ${game.them} THEM. The lineups are saved with this game, and the final lineup becomes your plan for the next game.`,
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

  const patch = (p: Parameters<typeof update.mutate>[0]) =>
    update.mutate(p, {
      onError,
      onSuccess: () => {
        // a changed time or place is worth telling the team (D58)
        const changed = 'start_time' in p || 'game_date' in p || 'location' in p || 'address' in p;
        if (!changed || game.status === 'done') return;
        const next = { ...game, ...p };
        const when = `${fmtDate(next.game_date, true)}${next.start_time ? ` at ${fmtTime(next.start_time)}` : ''}`;
        const where = [next.location, next.address].filter(Boolean).join(', ');
        void offerPost(
          'Game details changed',
          `Game vs ${next.opponent}: ${when}${where ? ` at ${where}` : ''}.`,
        );
      },
    });

  const calendar = () =>
    downloadIcs(
      {
        id: game.id,
        teamName: game.team_name_snapshot ?? team.name,
        opponent: game.opponent,
        date: game.game_date,
        startTime: game.start_time,
        location: game.location,
        address: game.address,
        homeAway: game.home_away,
        notes: game.parent_notes,
      },
      team.timezone,
    );

  /* ---------- render ---------- */

  const meta = (
    <>
      {fmtDate(game.game_date, true)}
      {game.start_time ? ` · ${fmtTime(game.start_time)}` : ''} · {game.team_name_snapshot ?? team.name} ·{' '}
      <GameBadge game={game} today={todayISO()} />
    </>
  );

  return (
    <Page
      title={`vs ${game.opponent}`}
      documentTitle={`vs ${game.opponent}`}
      sub={meta}
      back={{ to: '/games', label: 'Schedule' }}
    >
      {!isUpcoming && <Scoreline big us={game.us} them={game.them} />}
      {isStaff && pastSeason && (
        <Footer className="noprint">
          Past season · read-only. A platform admin can switch the current season back.
        </Footer>
      )}
      {canEdit && (
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
        {canEdit ? (
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
                list="game-places"
                onBlur={(e) => {
                  const v = e.target.value.trim() || null;
                  if (v === game.location) return;
                  const known = v && !game.address ? addressFor(places.data, v) : null;
                  patch(known ? { location: v, address: known } : { location: v });
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </Row>
            <PlaceDatalist id="game-places" places={places.data} />
            <Row label="Address">
              <input
                key={game.address ?? ''}
                className="inline"
                aria-label="Address"
                placeholder="Street address"
                defaultValue={game.address ?? ''}
                maxLength={200}
                autoComplete="street-address"
                onBlur={(e) => {
                  const v = e.target.value.trim() || null;
                  if (v !== game.address) patch({ address: v });
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
            <Row
              className="detail"
              label="When"
              value={`${fmtDate(game.game_date, true)}${game.start_time ? ` · ${fmtTime(game.start_time)}` : ''}`}
            />
            {game.location && <Row className="detail" label="Where" value={game.location} />}
            {game.address && <Row className="detail" label="Address" value={game.address} />}
            {game.home_away && (
              <Row className="detail" label="Home / away" value={HOME_AWAY_LABEL[game.home_away]} />
            )}
          </>
        )}
        {directions && (
          <a className="row link" href={directions} target="_blank" rel="noopener noreferrer">
            <span className="icon" style={{ background: 'var(--tint)' }} aria-hidden="true">
              <DirectionsIcon />
            </span>
            <span className="lbl">
              Directions
              <small>Opens Google Maps to {game.address ?? game.location}</small>
            </span>
          </a>
        )}
        <Row link onClick={calendar} label="Add to calendar" detail="Saves this game as a calendar event" />
      </Group>
      <Section>Note for parents</Section>
      <Group>
        {canEdit ? (
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

      {!isUpcoming && S.scoring.panel !== 'goal' && log.length > 0 && periodCount > 1 && (
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
              const kind = S.scoring.events.find((k) => k.type === ev.event_type);
              const kindName = kind?.noun ?? noun;
              const who =
                ev.side === 'them'
                  ? `${game.opponent} ${kindName}`
                  : ev.hidden
                    ? (kindName[0]?.toUpperCase() ?? '') + kindName.slice(1) // another family's child: name withheld (D56)
                    : names.name(ev.scorer_player_id) || 'Unknown scorer';
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
                  onClick={canEdit ? () => setEditing(ev) : undefined}
                  label={
                    <>
                      {eventTag(periodName, ev) && <PeriodTag>{eventTag(periodName, ev)}</PeriodTag>}
                      {who}
                    </>
                  }
                  detail={detail}
                  value={S.scoring.panel === 'points' ? `+${ev.points}` : undefined}
                  chevron={canEdit}
                />
              );
            })}
            {sortedLog.length === 0 && <Row label={`No ${unit.toLowerCase()} recorded.`} />}
            {canEdit && lastEvent && (
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
                onClick={
                  canEdit && pa.player_id
                    ? () => setPaEditing({ ...pa, player_id: pa.player_id as string })
                    : undefined
                }
                label={
                  <>
                    <PeriodTag>Inn {pa.inning}</PeriodTag>
                    {pa.hidden ? 'At-bat' : names.name(pa.player_id) || 'Removed player'}
                  </>
                }
                detail={`${paResultLabel(pa.result)}${pa.rbi ? ` · ${pa.rbi} RBI` : ''}`}
                value={paResultShort(pa.result)}
                chevron={canEdit}
              />
            ))}
            {paList.length === 0 && (
              <Row label="No at-bats recorded. Tap a batter on the Lineup tab during the game." />
            )}
            {canEdit && <Row link onClick={() => setPaAdding(true)} label="Add at-bat" />}
          </Group>
        </>
      )}

      {clockMode && !isUpcoming ? (
        <PlayingTimeSection
          gameId={game.id}
          status={isLive ? 'live' : 'done'}
          players={roster}
          names={names}
          periods={periods}
          canEdit={canEdit}
        />
      ) : (
        <>
          <Section>{isLive ? 'Lineups · live' : 'Lineups'}</Section>
          <Group>
            {periods.map((q, qi) => (
              <Row
                key={q.lineupId}
                className="lineuprow"
                label={
                  <>
                    <b>
                      {shortPeriod(S, periods.length, qi)}
                      {forms.length > 1 ? ` · ${q.formation}` : ''}
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
            {isLive && canEdit && (
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
        </>
      )}

      {canEdit && (
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

      {canEdit && (
        <>
          <ScorePanel
            open={scoring}
            onClose={() => setScoring(false)}
            S={S}
            opponent={game.opponent}
            periodCount={periodCount}
            initialPeriod={
              clockMode && isLive
                ? Math.min(gameClock.data?.periodIndex ?? 0, periodCount - 1)
                : Math.max(0, periodCount - 1)
            }
            lockPeriod={clockMode && isLive}
            players={roster.filter((p) => p.is_available)}
            onField={
              isLive
                ? (
                    periods[
                      clockMode
                        ? Math.min(gameClock.data?.periodIndex ?? 0, periodCount - 1)
                        : Math.max(0, periodCount - 1)
                    ]?.slots ?? []
                  ).filter(Boolean)
                : []
            }
            names={names}
            events={log}
            onAdd={(ev) => {
              addEvent.mutate(ev, { onError });
              toast(
                ev.side === 'them'
                  ? `${game.opponent} scored${periodSuffix(periodName, ev.period_index)}`
                  : `${first?.label === 'Goal' ? 'Goal!' : 'Scored!'} ${names.name(ev.scorer_player_id) || 'Unknown'}${periodSuffix(periodName, ev.period_index)}`,
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
            clockMode={clockMode}
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
