import { useState } from 'react';
import { Button } from '@/components/Button';
import { Field, Select, Textarea, TextInput } from '@/components/Form';
import { FormSheet } from '@/components/Sheet';
import { type SkillTestInput } from './api';
import { customKey, type SkillMetric, type SkillTest, type SkillUnit } from './defaults';

export interface EditTestSheetProps {
  open: boolean;
  onClose: () => void;
  /** Editing an existing test; null adds a custom one. */
  test: SkillTest | null;
  /** The test has results: metric settings are locked. */
  locked: boolean;
  onSave: (input: SkillTestInput) => void;
  onDelete?: () => void;
}

/** Add a custom test or edit one (name and how-to always; metric settings until results exist). */
export function EditTestSheet({ open, onClose, test, locked, onSave, onDelete }: EditTestSheetProps) {
  const [name, setName] = useState('');
  const [how, setHow] = useState('');
  const [metric, setMetric] = useState<SkillMetric>('count');
  const [higher, setHigher] = useState(true);
  const [unit, setUnit] = useState<SkillUnit>('yd');
  const [attempts, setAttempts] = useState('5');
  const [sides, setSides] = useState(false);
  const [prevKey, setPrevKey] = useState('');

  const key = open ? (test?.id ?? 'new') : '';
  if (key !== prevKey) {
    setPrevKey(key);
    if (open) {
      setName(test?.name ?? '');
      setHow(test?.instructions ?? '');
      setMetric(test?.metric ?? 'count');
      setHigher(test?.higher_is_better ?? true);
      setUnit((test?.unit as SkillUnit | null) ?? 'yd');
      setAttempts(String(test?.attempts ?? 5));
      setSides(test?.has_sides ?? false);
    }
  }

  const changeMetric = (m: SkillMetric) => {
    setMetric(m);
    if (!test) setHigher(m !== 'time_seconds');
  };

  const save = () => {
    const n = name.trim().slice(0, 60);
    if (!n) return;
    onSave({
      key: test?.key ?? customKey(),
      name: n,
      instructions: how.trim() || 'Custom test.',
      metric,
      unit: metric === 'distance' ? unit : null,
      has_sides: metric === 'made_of_attempted' ? sides : false,
      higher_is_better: higher,
      attempts: metric === 'made_of_attempted' ? Math.max(1, Math.min(100, Number(attempts) || 5)) : 5,
    });
    onClose();
  };

  return (
    <FormSheet open={open} onClose={onClose} title={test ? 'Edit test' : 'Add a custom test'}>
      {locked && (
        <p className="hint">
          This test has results on record, so the metric and the higher/lower rule are locked. Hide it and add
          a new test if you need a different version.
        </p>
      )}
      <Field label="Name">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="e.g. Throw-ins"
          data-autofocus=""
        />
      </Field>
      <Field label="How to run it">
        <Textarea
          value={how}
          onChange={(e) => setHow(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder="Same setup every time so results compare."
        />
      </Field>
      <Field label={locked ? 'Metric · locked' : 'Metric'}>
        <Select
          value={metric}
          onChange={(e) => changeMetric(e.target.value as SkillMetric)}
          disabled={locked}
        >
          <option value="count">Count</option>
          <option value="time_seconds">Time in seconds</option>
          <option value="distance">Distance</option>
          <option value="made_of_attempted">Made of attempted</option>
        </Select>
      </Field>
      <Field label={locked ? 'Which is better · locked' : 'Which is better'}>
        <Select
          value={higher ? 'yes' : 'no'}
          onChange={(e) => setHigher(e.target.value === 'yes')}
          disabled={locked}
        >
          <option value="yes">Higher</option>
          <option value="no">Lower</option>
        </Select>
      </Field>
      {metric === 'distance' && (
        <Field label="Unit">
          <Select value={unit} onChange={(e) => setUnit(e.target.value as SkillUnit)} disabled={locked}>
            <option value="yd">Yards</option>
            <option value="ft">Feet</option>
            <option value="m">Meters</option>
          </Select>
        </Field>
      )}
      {metric === 'made_of_attempted' && (
        <>
          <Field label="Attempts">
            <TextInput
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={attempts}
              onChange={(e) => setAttempts(e.target.value)}
              disabled={locked}
            />
          </Field>
          <Field label="Per side">
            <Select
              value={sides ? 'yes' : 'no'}
              onChange={(e) => setSides(e.target.value === 'yes')}
              disabled={locked}
            >
              <option value="no">One result</option>
              <option value="yes">Left and right</option>
            </Select>
          </Field>
        </>
      )}
      <Button onClick={save} disabled={!name.trim()}>
        {test ? 'Save changes' : 'Add test'}
      </Button>
      {test && onDelete && (
        <Button variant="gray" className="undo" onClick={onDelete} disabled={locked}>
          {locked ? 'Can’t delete · has results' : 'Delete test'}
        </Button>
      )}
    </FormSheet>
  );
}
