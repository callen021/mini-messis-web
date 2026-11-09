import { useState } from 'react';
import { Button } from '@/components/Button';
import { Field, FieldGroup, Select } from '@/components/Form';
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
}: EditScoreSheetProps) {
  const [side, setSide] = useState<'us' | 'them'>('us');
  const [period, setPeriod] = useState(0);
  const [type, setType] = useState('');
  const [scorer, setScorer] = useState('');
  const [assist, setAssist] = useState('');
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
    }
  }

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
