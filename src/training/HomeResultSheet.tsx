import { useState } from 'react';
import { Button } from '@/components/Button';
import { Field, TextInput } from '@/components/Form';
import { FormSheet } from '@/components/Sheet';
import { type SkillResultInput, type SkillResultPatch } from '@/skills/api';
import { type SkillResult, type SkillTest } from '@/skills/defaults';

export interface HomeResultSheetProps {
  open: boolean;
  onClose: () => void;
  playerId: string;
  playerName: string;
  test: SkillTest | null;
  /** The parent's own Home result being edited; absent when recording a new one. */
  existing?: SkillResult | null;
  /** Today where the team plays: the default date, and the latest one allowed. */
  today: string;
  onSave: (rows: SkillResultInput[]) => void;
  onUpdate: (patch: SkillResultPatch) => void;
  onDelete: () => void;
}

type SideKey = '' | 'left' | 'right';
const SIDE_LABEL: Record<SideKey, string> = { '': 'Made', right: 'Right side', left: 'Left side' };

/**
 * Record a skill test result at home, or edit one (D132): the date, the result and the test
 * conditions. It is always saved as a Home result. A two-sided test takes right and left in one
 * go when recording; editing touches one row.
 */
export function HomeResultSheet({
  open,
  onClose,
  playerId,
  playerName,
  test: t,
  existing,
  today,
  onSave,
  onUpdate,
  onDelete,
}: HomeResultSheetProps) {
  const [date, setDate] = useState(today);
  const [conditions, setConditions] = useState('');
  const [values, setValues] = useState<Record<SideKey, string>>({ '': '', left: '', right: '' });
  const [attempts, setAttempts] = useState<Record<SideKey, string>>({ '': '5', left: '5', right: '5' });
  const [prevKey, setPrevKey] = useState('');

  const key = open ? `${existing?.id ?? 'new'}:${t?.id ?? ''}` : '';
  if (key !== prevKey) {
    setPrevKey(key);
    if (open) {
      const v = existing ? String(existing.value) : '';
      const att = String(existing?.attempts ?? t?.attempts ?? 5);
      setDate(existing?.tested_on ?? today);
      setConditions(existing?.conditions ?? '');
      setValues({
        '': v,
        left: existing?.side === 'left' ? v : '',
        right: existing?.side === 'right' ? v : '',
      });
      setAttempts({ '': att, left: att, right: att });
    }
  }
  if (!t) return null;

  const made = t.metric === 'made_of_attempted';
  const sides: SideKey[] = made && t.has_sides && !existing ? ['right', 'left'] : [existing?.side ?? ''];
  const label = (side: SideKey) =>
    made
      ? SIDE_LABEL[side]
      : t.metric === 'time_seconds'
        ? 'Time'
        : t.metric === 'distance'
          ? 'Distance'
          : 'Count';

  const rows = (): SkillResultInput[] => {
    const on = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today ? date : today;
    return sides.flatMap((side) => {
      const v = parseFloat(values[side]);
      if (Number.isNaN(v) || v < 0) return [];
      return [
        {
          player_id: playerId,
          skill_test_id: t.id,
          tested_on: on,
          value: v,
          attempts: made ? Number(attempts[side]) || t.attempts : null,
          side: side || null,
          note: null,
          source: 'home' as const,
          conditions: conditions.trim() || null,
        },
      ];
    });
  };
  const ready = rows().length > 0;

  const save = () => {
    const list = rows();
    const first = list[0];
    if (!first) return;
    if (existing)
      onUpdate({
        tested_on: first.tested_on,
        value: first.value,
        attempts: first.attempts,
        conditions: first.conditions,
      });
    else onSave(list);
    onClose();
  };

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={existing ? `Edit home result · ${t.name}` : `${t.name} at home · ${playerName}`}
    >
      <Field label="Date">
        <TextInput type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {sides.map((side) => (
        <Field key={side || 'one'} label={label(side)}>
          <div className="inrow">
            <TextInput
              type="number"
              inputMode={t.metric === 'time_seconds' ? 'decimal' : 'numeric'}
              step={t.metric === 'time_seconds' ? '0.1' : '1'}
              min={0}
              value={values[side]}
              onChange={(e) => setValues((v) => ({ ...v, [side]: e.target.value }))}
              aria-label={`${label(side)} value`}
              data-autofocus={side === sides[0] ? '' : undefined}
            />
            {made ? (
              <>
                <span>of</span>
                <TextInput
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={attempts[side]}
                  onChange={(e) => setAttempts((a) => ({ ...a, [side]: e.target.value }))}
                  aria-label={`${label(side)} attempts`}
                />
              </>
            ) : (
              t.metric !== 'count' && <span>{t.metric === 'time_seconds' ? 'seconds' : t.unit}</span>
            )}
          </div>
        </Field>
      ))}
      <Field label="Test conditions (optional)">
        <TextInput
          value={conditions}
          onChange={(e) => setConditions(e.target.value)}
          maxLength={200}
          placeholder="e.g. backyard, size 3 ball"
        />
      </Field>
      <p className="sub">Saved as a Home result, shown apart from the coach’s.</p>
      <Button onClick={save} disabled={!ready}>
        {existing ? 'Save changes' : 'Save home result'}
      </Button>
      {existing && (
        <Button variant="gray" className="undo" onClick={onDelete}>
          Delete this result
        </Button>
      )}
    </FormSheet>
  );
}
