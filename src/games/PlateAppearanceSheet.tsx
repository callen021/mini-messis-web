import { useState } from 'react';
import { Button } from '@/components/Button';
import { Field, FieldGroup, Select } from '@/components/Form';
import { FormSheet } from '@/components/Sheet';
import { Stepper } from '@/components/Stepper';
import { cn } from '@/lib/cn';
import { type Player } from '@/teams/api';
import { type PaResult, type PlateAppearance } from './api';
import { PA_RESULTS, paResultLabel } from './batting';
import { type NameLookup } from './names';

export interface PlateAppearanceSheetProps {
  open: boolean;
  onClose: () => void;
  /** Editing an existing row shows Delete and preselects its values. */
  existing?: PlateAppearance | null;
  /** Batter; when null a picker is shown (adding from the game page). */
  batterId: string | null;
  players: readonly Player[];
  names: NameLookup;
  inning: number;
  inningCount: number;
  onSave: (v: { player_id: string; inning: number; result: PaResult; rbi: number }) => void;
  onDelete?: () => void;
}

/**
 * Result entry for one plate appearance. Fast path: "Save · batted" with no result keeps the legacy
 * tap-when-batted speed; everything else is optional.
 */
export function PlateAppearanceSheet({
  open,
  onClose,
  existing,
  batterId,
  players,
  names,
  inning,
  inningCount,
  onSave,
  onDelete,
}: PlateAppearanceSheetProps) {
  const [player, setPlayer] = useState(batterId ?? '');
  const [inn, setInn] = useState(inning);
  const [result, setResult] = useState<PaResult>('none');
  const [rbi, setRbi] = useState(0);
  const [prevKey, setPrevKey] = useState('');

  // Seed the form whenever the sheet opens for a (different) row.
  const key = open ? `${existing?.id ?? 'new'}:${batterId ?? ''}` : '';
  if (key !== prevKey) {
    setPrevKey(key);
    if (open) {
      setPlayer(existing?.player_id ?? batterId ?? players[0]?.id ?? '');
      setInn(existing?.inning ?? inning);
      setResult(existing?.result ?? 'none');
      setRbi(existing?.rbi ?? 0);
    }
  }

  const title = existing ? 'Edit at-bat' : batterId ? `${names.name(batterId)} batted` : 'Add at-bat';
  const innings = Math.max(inningCount, inn, 1);

  return (
    <FormSheet open={open} onClose={onClose} title={title}>
      {(!batterId || existing) && (
        <Field label="Batter">
          <Select value={player} onChange={(e) => setPlayer(e.target.value)}>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.jersey_number ? `#${p.jersey_number} ` : ''}
                {names.name(p.id)}
              </option>
            ))}
            {player && !players.some((p) => p.id === player) && (
              <option value={player}>{names.name(player) || 'Removed player'} (removed)</option>
            )}
          </Select>
        </Field>
      )}
      <Field label="Inning">
        <Select value={String(inn)} onChange={(e) => setInn(Number(e.target.value))}>
          {Array.from({ length: innings }, (_, i) => (
            <option key={i} value={i + 1}>
              Inning {i + 1}
            </option>
          ))}
        </Select>
      </Field>
      <FieldGroup label="Result (optional)">
        <div className="pagrid" role="group" aria-label="Result">
          {PA_RESULTS.map((r) => (
            <button
              key={r.value}
              type="button"
              className={cn('pabtn', result === r.value && 'on')}
              aria-pressed={result === r.value}
              onClick={() => setResult(result === r.value ? 'none' : r.value)}
            >
              <b>{r.short}</b>
              <span>{r.label}</span>
            </button>
          ))}
        </div>
      </FieldGroup>
      <FieldGroup label="Runs batted in">
        <Stepper value={rbi} min={0} max={4} onChange={setRbi} label="Runs batted in" />
      </FieldGroup>
      <Button
        disabled={!player}
        onClick={() => {
          onSave({ player_id: player, inning: inn, result, rbi });
          onClose();
        }}
      >
        {result === 'none' ? 'Save · batted, no result' : `Save · ${paResultLabel(result)}`}
      </Button>
      {existing && onDelete && (
        <Button variant="gray" className="undo" onClick={onDelete}>
          Delete this at-bat
        </Button>
      )}
    </FormSheet>
  );
}
