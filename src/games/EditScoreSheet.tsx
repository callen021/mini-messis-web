import { useState } from 'react';
import { Button } from '@/components/Button';
import { Field, FieldGroup, Select, TextInput } from '@/components/Form';
import { Segmented } from '@/components/Segmented';
import { FormSheet } from '@/components/Sheet';
import { type SportDefinition } from '@/sports/types';
import { type Player } from '@/teams/api';
import { type ScoreEvent, type ScoreEventPatch } from './api';
import { type NameLookup } from './names';
import { PeriodPicker } from './PeriodPicker';

export interface EditScoreSheetProps {
  event: ScoreEvent | null;
  onClose: () => void;
  S: SportDefinition;
  opponent: string;
  periodCount: number;
  players: readonly Player[];
  names: NameLookup;
  onSave: (patch: ScoreEventPatch) => void;
  onDelete: () => void;
  /** Clock mode (D74): the event carries a clock minute that can be corrected too. */
  clockMode?: boolean;
}

/** Edit any field of a logged score, or delete it (legacy `editGoalSheet`, extended to every sport). */
export function EditScoreSheet({
  event,
  onClose,
  S,
  opponent,
  periodCount,
  players,
  names,
  onSave,
  onDelete,
  clockMode = false,
}: EditScoreSheetProps) {
  const [side, setSide] = useState<'us' | 'them'>('us');
  const [period, setPeriod] = useState(0);
  const [type, setType] = useState('');
  const [scorer, setScorer] = useState('');
  const [assist, setAssist] = useState('');
  // the running minute (1-based, football style); '' when the event has no clock stamp
  const [minute, setMinute] = useState('');
  const [prevEvent, setPrevEvent] = useState<ScoreEvent | null>(null);

  // Seed the form from the event being edited (state derived from the previous render).
  if (event !== prevEvent) {
    setPrevEvent(event);
    if (event) {
      setSide(event.side);
      setPeriod(event.period_index);
      setType(event.event_type);
      setScorer(event.scorer_player_id ?? '');
      setAssist(event.assist_player_id ?? '');
      setMinute(
        event.clock_seconds === null || event.clock_seconds === undefined
          ? ''
          : String(Math.floor(event.clock_seconds / 60) + 1),
      );
    }
  }
  /** Seconds for the patch: unchanged minute keeps the exact second, a new minute starts at :00. */
  const clockSeconds = (): number | null => {
    if (!clockMode) return undefined as unknown as null;
    const m = Math.round(Number(minute));
    if (!minute.trim() || !Number.isFinite(m) || m < 1) return null;
    const prev = event?.clock_seconds ?? null;
    if (prev !== null && Math.floor(prev / 60) + 1 === m) return prev;
    return (m - 1) * 60;
  };

  const kinds = S.scoring.events;
  const kind = kinds.find((k) => k.type === type) ?? kinds[0];
  const first = kinds[0];
  const noun = first?.noun ?? 'score';
  // Keep a removed player selectable so the row can be saved untouched.
  const extra = [scorer, assist].filter((id) => id && !players.some((p) => p.id === id));
  const options = (
    <>
      {players.map((p) => (
        <option key={p.id} value={p.id}>
          {p.jersey_number ? `#${p.jersey_number} ` : ''}
          {names.name(p.id)}
        </option>
      ))}
      {extra.map((id) => (
        <option key={id} value={id}>
          {names.name(id) || 'Removed player'} (removed)
        </option>
      ))}
    </>
  );

  return (
    <FormSheet open={!!event} onClose={onClose} title={`Edit ${noun}`}>
      <FieldGroup label="Team">
        <Segmented<'us' | 'them'>
          label="Team"
          value={side}
          onChange={setSide}
          options={[
            { value: 'us', label: `Our ${noun}` },
            { value: 'them', label: `${opponent} ${noun}` },
          ]}
        />
      </FieldGroup>
      <PeriodPicker S={S} count={periodCount} value={period} onChange={setPeriod} />
      {clockMode && (
        <Field label="Minute">
          <TextInput
            type="number"
            inputMode="numeric"
            min={1}
            max={120}
            placeholder="Not recorded"
            value={minute}
            onChange={(e) => setMinute(e.target.value)}
          />
        </Field>
      )}
      {kinds.length > 1 && (
        <FieldGroup label="Type">
          <Segmented<string>
            label="Type"
            value={kind?.type ?? ''}
            onChange={setType}
            options={kinds.map((k) => ({ value: k.type, label: k.label, ariaLabel: k.noun }))}
          />
        </FieldGroup>
      )}
      <Field label={S.scoring.panel === 'run' ? 'Who crossed the plate' : 'Scorer'}>
        <Select value={scorer} onChange={(e) => setScorer(e.target.value)} disabled={side === 'them'}>
          <option value="">Unknown / not recorded</option>
          {options}
        </Select>
      </Field>
      {S.scoring.assists && (
        <Field label="Assist">
          <Select value={assist} onChange={(e) => setAssist(e.target.value)} disabled={side === 'them'}>
            <option value="">No assist</option>
            {options}
          </Select>
        </Field>
      )}
      <Button
        onClick={() => {
          onSave({
            side,
            period_index: period,
            event_type: kind?.type ?? type,
            points: kind?.points ?? 1,
            scorer_player_id: side === 'us' ? scorer || null : null,
            assist_player_id: side === 'us' && assist && assist !== scorer ? assist : null,
            ...(clockMode ? { clock_seconds: clockSeconds() } : {}),
          });
          onClose();
        }}
      >
        Save changes
      </Button>
      <Button variant="gray" className="undo" onClick={onDelete}>
        Delete this {noun}
      </Button>
    </FormSheet>
  );
}
