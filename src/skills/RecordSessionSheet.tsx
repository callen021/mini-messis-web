import { type KeyboardEvent, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { Field, Select, TextInput } from '@/components/Form';
import { FormSheet } from '@/components/Sheet';
import { todayISO } from '@/games/format';
import { type Player } from '@/teams/api';
import { type SkillResultInput } from './api';
import { type SkillTest } from './defaults';

export interface RecordSessionSheetProps {
  open: boolean;
  onClose: () => void;
  tests: readonly SkillTest[];
  players: readonly Player[];
  /** Preselected test. */
  testId?: string;
  busy?: boolean;
  onSave: (rows: SkillResultInput[]) => void;
}

type SideKey = '' | 'left' | 'right';
type Cell = { value: string; attempts: string };
const cellKey = (playerId: string, side: SideKey) => `${playerId}:${side}`;

/**
 * Record a whole session (D62): one test, one date, every active player in a scrolling list with
 * the inputs the test's metric needs. Blank rows are skipped; one Save writes all the rows.
 * Enter / Next moves to the following player's input.
 */
export function RecordSessionSheet({
  open,
  onClose,
  tests,
  players,
  testId,
  busy,
  onSave,
}: RecordSessionSheetProps) {
  const [test, setTest] = useState(testId ?? tests[0]?.id ?? '');
  const [date, setDate] = useState(todayISO());
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [prevOpen, setPrevOpen] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTest(testId ?? tests[0]?.id ?? '');
      setDate(todayISO());
      setCells({});
    }
  }

  const t = tests.find((x) => x.id === test);
  const made = t?.metric === 'made_of_attempted';
  const sides: SideKey[] = made && t.has_sides ? ['right', 'left'] : [''];
  const defaultAttempts = String(t?.attempts ?? 5);
  const cell = (playerId: string, side: SideKey): Cell =>
    cells[cellKey(playerId, side)] ?? { value: '', attempts: defaultAttempts };
  const setCell = (playerId: string, side: SideKey, patch: Partial<Cell>) =>
    setCells((c) => ({ ...c, [cellKey(playerId, side)]: { ...cell(playerId, side), ...patch } }));

  const rows = (): SkillResultInput[] => {
    if (!t) return [];
    const on = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO();
    const out: SkillResultInput[] = [];
    for (const p of players) {
      for (const side of sides) {
        const c = cell(p.id, side);
        const v = parseFloat(c.value);
        if (Number.isNaN(v)) continue;
        out.push({
          player_id: p.id,
          skill_test_id: t.id,
          tested_on: on,
          value: v,
          attempts: made ? Number(c.attempts) || t.attempts : null,
          side: side || null,
          note: null,
        });
      }
    }
    return out;
  };
  const count = rows().length;

  // Enter / the keyboard's Next jumps to the next value input (the next player)
  let slot = 0;
  const onKeyDown = (idx: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    inputs.current[idx + 1]?.focus();
  };

  const unitHint = made
    ? 'made of attempts'
    : t?.metric === 'time_seconds'
      ? 'seconds'
      : t?.metric === 'distance'
        ? (t.unit ?? 'yd')
        : 'count';

  return (
    <FormSheet open={open} onClose={onClose} title="Record results" cancel="Cancel">
      <Field label="Test">
        <Select
          value={test}
          onChange={(e) => {
            setTest(e.target.value);
            setCells({});
          }}
        >
          {tests.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Date">
        <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="session" role="group" aria-label={`Results per player (${unitHint})`}>
        {players.map((p) => (
          <div key={p.id} className="srow">
            <div className="pname">
              {p.first_name}
              {p.jersey_number && <small>#{p.jersey_number}</small>}
            </div>
            <div className="sinputs">
              {sides.map((side) => {
                const idx = slot++;
                const c = cell(p.id, side);
                const label = `${p.first_name}${side ? ` ${side}` : ''}`;
                return (
                  <div key={side || 'one'} className="inrow">
                    {side && <span className="sidelab">{side === 'right' ? 'R' : 'L'}</span>}
                    <TextInput
                      ref={(el) => {
                        inputs.current[idx] = el;
                      }}
                      type="number"
                      inputMode={t?.metric === 'time_seconds' ? 'decimal' : 'numeric'}
                      step={t?.metric === 'time_seconds' ? '0.1' : '1'}
                      min={0}
                      enterKeyHint="next"
                      placeholder={made ? 'made' : t?.metric === 'time_seconds' ? '0.0' : '0'}
                      value={c.value}
                      onChange={(e) => setCell(p.id, side, { value: e.target.value })}
                      onKeyDown={onKeyDown(idx)}
                      aria-label={`${label} value`}
                      data-autofocus={idx === 0 ? '' : undefined}
                    />
                    {made && (
                      <>
                        <span>of</span>
                        <TextInput
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={c.attempts}
                          onChange={(e) => setCell(p.id, side, { attempts: e.target.value })}
                          aria-label={`${label} attempts`}
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {players.length === 0 && <p className="sub">No active players.</p>}
      </div>
      <Button onClick={() => onSave(rows())} disabled={busy || !t || count === 0}>
        {busy ? 'Saving…' : count ? `Save ${count} result${count === 1 ? '' : 's'}` : 'Save'}
      </Button>
    </FormSheet>
  );
}
