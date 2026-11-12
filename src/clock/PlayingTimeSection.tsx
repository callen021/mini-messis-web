import { useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { Field, Select, TextInput } from '@/components/Form';
import { Group, Row, Section } from '@/components/List';
import { FormSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { type NameLookup } from '@/games/names';
import { errorMessage } from '@/lib/supabase';
import { type StoredPeriod } from '@/lineups/convert';
import { SPORTS, shortPeriod } from '@/sports/definitions';
import { type Player } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useGameClock, useStintCorrections, useStints } from './api';
import {
  PAUSED_CLOCK,
  type Stint,
  formatClock,
  formatMinutes,
  isRunning,
  playerTimes,
  starters,
} from './clock';
import { parseClock, stintProblem } from './stintEdit';
import { useServerNow } from './useNow';

/**
 * A clock-mode game's playing time on the game page (D67, D75): the starters, then minutes and
 * shifts per player. After the game, staff tap a player to correct their stints: edit start and
 * end, add or delete one, with the same checks the server makes. Who edited is recorded.
 */
export function PlayingTimeSection({
  gameId,
  status,
  players,
  names,
  periods,
  canEdit,
}: {
  gameId: string;
  status: 'live' | 'done';
  players: readonly Player[];
  names: NameLookup;
  /** The game's lineup rows (for the position codes a period offers). */
  periods: readonly StoredPeriod[];
  canEdit: boolean;
}) {
  const { teamId, team } = useCurrentTeam();
  const N = team.clock_periods;
  const clockQ = useGameClock(gameId);
  const stintsQ = useStints(gameId);
  const clock = clockQ.data ?? PAUSED_CLOCK;
  const now = useServerNow(status === 'live' && isRunning(clock));
  const stints = useMemo(() => stintsQ.data ?? [], [stintsQ.data]);
  const [editing, setEditing] = useState<string | null>(null);

  const ids = useMemo(() => {
    const seen = new Set(players.map((p) => p.id));
    for (const st of stints) seen.add(st.player_id);
    return [...seen];
  }, [players, stints]);
  const times = useMemo(() => playerTimes(stints, clock, now, ids), [stints, clock, now, ids]);
  const first = periods[0];
  const startMap = starters(stints);
  const rows = ids
    .map((id) => ({ id, t: times.get(id) }))
    .filter((r) => r.t && (r.t.seconds > 0 || r.t.onField || players.some((p) => p.id === r.id)))
    .sort(
      (a, b) => (b.t?.seconds ?? 0) - (a.t?.seconds ?? 0) || names.name(a.id).localeCompare(names.name(b.id)),
    );
  const editable = canEdit && status === 'done';

  return (
    <>
      <Section>{status === 'live' ? 'Playing time · live' : 'Playing time'}</Section>
      <Group>
        {first && (
          <Row
            className="lineuprow"
            label={
              <>
                <b>Starters{first.formation ? ` · ${first.formation}` : ''}</b>
                <div className="lulist">
                  {first.codes.map((code, i) => {
                    const id = startMap.get(i);
                    return (
                      <span key={i} className="lu">
                        <b>{code}</b> {id ? names.name(id) || '?' : <i>open</i>}
                      </span>
                    );
                  })}
                </div>
              </>
            }
          />
        )}
        {rows.map(({ id, t }) => (
          <Row
            key={id}
            onClick={editable ? () => setEditing(id) : undefined}
            label={names.name(id) || 'Removed player'}
            detail={`${t?.shifts ?? 0} shift${t?.shifts === 1 ? '' : 's'}${t?.onField ? ` · on the field at ${t.code}` : ''}`}
            value={formatMinutes(t?.seconds ?? 0)}
            chevron={editable}
          />
        ))}
        {rows.length === 0 && <Row label="No playing time recorded." />}
        {editable && (
          <Row
            label={
              <span style={{ color: 'var(--text2)', fontSize: 14 }}>
                Tap a player to correct their stints.
              </span>
            }
          />
        )}
      </Group>
      {editable && editing && (
        <StintsSheet
          gameId={gameId}
          teamId={teamId}
          playerId={editing}
          playerName={names.name(editing) || 'Removed player'}
          stints={stints}
          periods={periods}
          periodCount={N}
          periodLengths={clock.periodLengths}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function StintsSheet({
  gameId,
  teamId,
  playerId,
  playerName,
  stints,
  periods,
  periodCount,
  periodLengths,
  onClose,
}: {
  gameId: string;
  teamId: string;
  playerId: string;
  playerName: string;
  stints: readonly Stint[];
  periods: readonly StoredPeriod[];
  periodCount: number;
  periodLengths: readonly number[];
  onClose: () => void;
}) {
  const { sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const toast = useToast();
  const correct = useStintCorrections(teamId, gameId);
  const mine = stints
    .filter((s) => s.player_id === playerId)
    .sort((a, b) => a.period_index - b.period_index || a.clock_start - b.clock_start);
  const [adding, setAdding] = useState(false);
  const [period, setPeriod] = useState(0);
  const [code, setCode] = useState('');
  const [start, setStart] = useState('0:00');
  const [end, setEnd] = useState('');
  const codes = periods[period]?.codes ?? periods[0]?.codes ?? [];
  const onError = (e: unknown) => toast(errorMessage(e));

  const save = (s: Stint, startText: string, endText: string) => {
    const a = parseClock(startText);
    const b = parseClock(endText);
    if (a === null || b === null) {
      toast('Enter times as minutes:seconds, like 12:30');
      return;
    }
    const problem = stintProblem(
      { id: s.id, playerId, period: s.period_index, start: a, end: b },
      stints,
      periodLengths,
    );
    if (problem) {
      toast(problem);
      return;
    }
    correct.mutate(
      { kind: 'update', id: s.id, start: a, end: b },
      { onError, onSuccess: () => toast('Stint updated') },
    );
  };
  const add = () => {
    const a = parseClock(start);
    const b = parseClock(end);
    if (a === null || b === null) {
      toast('Enter times as minutes:seconds, like 12:30');
      return;
    }
    const problem = stintProblem({ id: null, playerId, period, start: a, end: b }, stints, periodLengths);
    if (problem) {
      toast(problem);
      return;
    }
    correct.mutate(
      { kind: 'add', playerId, period, code: code || codes[0] || '', start: a, end: b },
      {
        onError,
        onSuccess: () => {
          toast('Stint added');
          setAdding(false);
          setEnd('');
        },
      },
    );
  };

  return (
    <FormSheet open onClose={onClose} title={`${playerName} · playing time`}>
      {mine.map((s) => (
        <StintRow
          key={s.id}
          stint={s}
          S={S}
          periodCount={periodCount}
          onSave={(a, b) => save(s, a, b)}
          onDelete={() =>
            correct.mutate({ kind: 'delete', id: s.id }, { onError, onSuccess: () => toast('Stint deleted') })
          }
        />
      ))}
      {mine.length === 0 && <p className="hint">No stints yet.</p>}
      {adding ? (
        <>
          <Field label={S.periodName(periodCount)}>
            <Select value={String(period)} onChange={(e) => setPeriod(Number(e.target.value))}>
              {Array.from({ length: periodCount }, (_, i) => (
                <option key={i} value={i}>
                  {shortPeriod(S, periodCount, i)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Position">
            <Select value={code || codes[0] || ''} onChange={(e) => setCode(e.target.value)}>
              {codes.map((c, i) => (
                <option key={`${c}-${i}`} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From (m:ss)">
            <TextInput inputMode="numeric" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="To (m:ss)">
            <TextInput
              inputMode="numeric"
              placeholder="12:30"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
          <Button onClick={add} disabled={correct.isPending}>
            Save stint
          </Button>
        </>
      ) : (
        <Button variant="tinted" onClick={() => setAdding(true)}>
          Add a stint
        </Button>
      )}
    </FormSheet>
  );
}

function StintRow({
  stint,
  S,
  periodCount,
  onSave,
  onDelete,
}: {
  stint: Stint;
  S: (typeof SPORTS)[keyof typeof SPORTS];
  periodCount: number;
  onSave: (start: string, end: string) => void;
  onDelete: () => void;
}) {
  const [start, setStart] = useState(formatClock(stint.clock_start));
  const [end, setEnd] = useState(stint.clock_end === null ? '' : formatClock(stint.clock_end));
  const dirty =
    start !== formatClock(stint.clock_start) ||
    end !== (stint.clock_end === null ? '' : formatClock(stint.clock_end));
  const label = `${shortPeriod(S, periodCount, stint.period_index)} · ${stint.position_code}`;
  return (
    <div
      className="stintrow"
      role="group"
      aria-label={`${label} ${formatClock(stint.clock_start)} to ${stint.clock_end === null ? 'open' : formatClock(stint.clock_end)}`}
    >
      <b>{label}</b>
      <TextInput
        aria-label={`${label} from`}
        inputMode="numeric"
        value={start}
        onChange={(e) => setStart(e.target.value)}
      />
      <span aria-hidden="true">–</span>
      <TextInput
        aria-label={`${label} to`}
        inputMode="numeric"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
      />
      {dirty ? (
        <Button size="sm" onClick={() => onSave(start, end)}>
          Save
        </Button>
      ) : (
        <Button size="sm" variant="gray" onClick={onDelete} aria-label={`Delete ${label} stint`}>
          Delete
        </Button>
      )}
    </div>
  );
}
