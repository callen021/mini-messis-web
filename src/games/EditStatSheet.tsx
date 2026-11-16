import { useState } from 'react';
import { Button } from '@/components/Button';
import { FieldGroup } from '@/components/Form';
import { Segmented } from '@/components/Segmented';
import { FormSheet } from '@/components/Sheet';
import { type SportDefinition, type StatType } from '@/sports/types';
import { type Player } from '@/teams/api';
import { type StatEvent, type StatEventPatch } from './api';
import { type NameLookup } from './names';
import { PeriodPicker } from './PeriodPicker';
import { PlayerPicker } from './PlayerPicker';

export interface EditStatSheetProps {
  event: StatEvent | null;
  onClose: () => void;
  S: SportDefinition;
  periodCount: number;
  players: readonly Player[];
  names: NameLookup;
  /** The stats the team tracks; the entry's own type is always offered so an old entry can be saved as is. */
  tracked: readonly StatType[];
  onSave: (patch: StatEventPatch) => void;
  onDelete: () => void;
}

/** Edit a stat entry after the fact (D118): the player, the period and the kind, or delete it. */
export function EditStatSheet({
  event,
  onClose,
  S,
  periodCount,
  players,
  names,
  tracked,
  onSave,
  onDelete,
}: EditStatSheetProps) {
  const [player, setPlayer] = useState('');
  const [period, setPeriod] = useState(0);
  const [type, setType] = useState<StatType>('rebound');
  const [prevEvent, setPrevEvent] = useState<StatEvent | null>(null);

  // Seed the form from the entry being edited (state derived from the previous render).
  if (event !== prevEvent) {
    setPrevEvent(event);
    if (event) {
      setPlayer(event.player_id);
      setPeriod(event.period_index);
      setType(event.stat_type);
    }
  }

  const kinds = (S.scoring.stats ?? []).filter(
    (k) => tracked.includes(k.type) || k.type === event?.stat_type,
  );
  const kind = kinds.find((k) => k.type === type) ?? kinds[0];
  const extra = player && !players.some((p) => p.id === player) ? [player] : [];

  return (
    <FormSheet open={!!event} onClose={onClose} title={`Edit ${kind?.noun ?? 'stat'}`}>
      <PeriodPicker S={S} count={periodCount} value={period} onChange={setPeriod} />
      {kinds.length > 1 && (
        <FieldGroup label="Stat">
          <Segmented<StatType>
            label="Stat"
            value={kind?.type ?? type}
            onChange={setType}
            options={kinds.map((k) => ({ value: k.type, label: k.label, ariaLabel: k.noun }))}
          />
        </FieldGroup>
      )}
      <PlayerPicker
        label="Player"
        value={player}
        onChange={setPlayer}
        onField={[]}
        bench={players}
        showBench
        extraIds={extra}
        noneLabel="Unknown"
        names={names}
      />
      <Button
        disabled={!player}
        onClick={() => {
          onSave({ player_id: player, period_index: period, stat_type: kind?.type ?? type });
          onClose();
        }}
      >
        Save changes
      </Button>
      <Button variant="gray" className="undo" onClick={onDelete}>
        Delete this {kind?.noun ?? 'stat'}
      </Button>
    </FormSheet>
  );
}
