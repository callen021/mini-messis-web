import { useState } from 'react';
import { Button } from '@/components/Button';
import { Field, Select, TextInput } from '@/components/Form';
import { FormSheet } from '@/components/Sheet';
import { todayISO } from '@/games/format';
import { type SkillResultInput } from './api';
import { type SkillResult, type SkillTest } from './defaults';

export interface RecordResultSheetProps {
  open: boolean;
  onClose: () => void;
  playerId: string;
  playerName: string;
  /** Shown tests to choose from. */
  tests: readonly SkillTest[];
  /** Preselected test (or the one being edited). */
  testId?: string;
  existing?: SkillResult | null;
  onSave: (rows: SkillResultInput[]) => void;
  onUpdate?: (
    patch: Partial<Pick<SkillResult, 'tested_on' | 'value' | 'attempts' | 'side' | 'note'>>,
  ) => void;
  onDelete?: () => void;
}

type SideKey = '' | 'left' | 'right';
interface Draft {
  value: string;
  attempts: string;
}

/**
 * Record (or edit) a result: pick the test, the date, the value(s) and an optional note.
 * Two-sided tests take right and left in one go when recording; editing touches one row.
 */
export function RecordResultSheet({
  open,
  onClose,
  playerId,
  playerName,
  tests,
  testId,
  existing,
  onSave,
  onUpdate,
  onDelete,
}: RecordResultSheetProps) {
  const [test, setTest] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [fields, setFields] = useState<Record<SideKey, Draft>>({
    '': { value: '', attempts: '' },
    left: { value: '', attempts: '' },
    right: { value: '', attempts: '' },
  });
  const [prevKey, setPrevKey] = useState('');

  const key = open ? `${existing?.id ?? 'new'}:${testId ?? ''}:${playerId}` : '';
  if (key !== prevKey) {
    setPrevKey(key);
    if (open) {
      const t = tests.find((x) => x.id === (existing?.skill_test_id ?? testId)) ?? tests[0];
      setTest(t?.id ?? '');
      setDate(existing?.tested_on ?? todayISO());
      setNote(existing?.note ?? '');
      const att = String(existing?.attempts ?? t?.attempts ?? 5);
      const v = existing ? String(existing.value) : '';
      setFields({
        '': { value: v, attempts: att },
        left: { value: existing?.side === 'left' ? v : '', attempts: att },
        right: { value: existing?.side === 'right' ? v : '', attempts: att },
      });
    }
  }

  const t = tests.find((x) => x.id === test);
  const made = t?.metric === 'made_of_attempted';
  const sides: SideKey[] = made && t.has_sides && !existing ? ['right', 'left'] : [existing?.side ?? ''];
  const setField = (side: SideKey, patch: Partial<Draft>) =>
    setFields((f) => ({ ...f, [side]: { ...f[side], ...patch } }));

  const valueLabel = (side: SideKey) =>
    made
      ? side
        ? `${side[0]?.toUpperCase()}${side.slice(1)} side`
        : 'Made'
      : ({ count: 'Longest streak', time_seconds: 'Time', distance: 'Distance' } as Record<string, string>)[
          t?.metric ?? 'count'
        ];

  const save = () => {
    if (!t) return;
    const on = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO();
    const rows: SkillResultInput[] = [];
    for (const side of sides) {
      const v = parseFloat(fields[side].value);
      if (Number.isNaN(v)) continue;
      rows.push({
        player_id: playerId,
        skill_test_id: t.id,
        tested_on: on,
        value: v,
        attempts: made ? Number(fields[side].attempts) || t.attempts : null,
        side: side || null,
        note: note.trim() || null,
      });
    }
    if (!rows.length) return;
    if (existing && onUpdate) {
      const r = rows[0] as SkillResultInput;
      onUpdate({ tested_on: r.tested_on, value: r.value, attempts: r.attempts, side: r.side, note: r.note });
    } else onSave(rows);
    onClose();
  };

  const anyValue = sides.some((s) => !Number.isNaN(parseFloat(fields[s].value)));

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={existing ? 'Edit result' : `Record a result · ${playerName}`}
    >
      <Field label="Test">
        <Select value={test} onChange={(e) => setTest(e.target.value)} disabled={!!existing}>
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
      {sides.map((side) => (
        <Field key={side || 'one'} label={valueLabel(side)}>
          <div className="inrow">
            <TextInput
              type="number"
              inputMode={t?.metric === 'time_seconds' ? 'decimal' : 'numeric'}
              step={t?.metric === 'time_seconds' ? '0.1' : '1'}
              min={0}
              placeholder={t?.metric === 'time_seconds' ? '12.4' : made ? 'made' : '0'}
              value={fields[side].value}
              onChange={(e) => setField(side, { value: e.target.value })}
              aria-label={`${valueLabel(side)} value`}
              data-autofocus={side === sides[0] ? '' : undefined}
            />
            {made ? (
              <>
                <span>of</span>
                <TextInput
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={fields[side].attempts}
                  onChange={(e) => setField(side, { attempts: e.target.value })}
                  aria-label={`${valueLabel(side)} attempts`}
                />
              </>
            ) : (
              t && t.metric !== 'count' && <span>{t.metric === 'time_seconds' ? 'seconds' : t.unit}</span>
            )}
          </div>
        </Field>
      ))}
      <Field label="Note (optional)">
        <TextInput
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder="e.g. windy, size 4 ball"
        />
      </Field>
      <Button onClick={save} disabled={!t || !anyValue}>
        {existing ? 'Save changes' : 'Save result'}
      </Button>
      {existing && onDelete && (
        <Button variant="gray" className="undo" onClick={onDelete}>
          Delete this result
        </Button>
      )}
    </FormSheet>
  );
}
