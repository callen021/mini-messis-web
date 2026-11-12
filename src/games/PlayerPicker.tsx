import { cn } from '@/lib/cn';
import { type Player } from '@/teams/api';
import { type NameLookup } from './names';

export interface PlayerPickerProps {
  /** "Scorer", "Assist" */
  label: string;
  /** Selected player id; '' = the none option. */
  value: string;
  onChange: (id: string) => void;
  /** The players shown first (on the field right now, in field order). Empty = everyone in `bench`. */
  onField: readonly Player[];
  /** Everyone else, in bench order; shown when `showBench` (or when there is nobody on the field). */
  bench: readonly Player[];
  showBench: boolean;
  /** Ids no longer on the roster that must stay selectable (editing an old goal). */
  extraIds?: readonly string[];
  /** "Unknown", "No assist" */
  noneLabel: string;
  /** A player who cannot be picked here (the scorer, in the assist row): shown greyed out. */
  excludeId?: string;
  names: NameLookup;
  disabled?: boolean;
}

/**
 * Tappable player buttons instead of a native select (D96): one row group per role, number and
 * first name on each button, the selected one green, on-field players first, then the bench,
 * then the none option. Nothing opens that a ticking clock could close, and a goal with an
 * assist is three taps at 375px one-handed.
 */
export function PlayerPicker({
  label,
  value,
  onChange,
  onField,
  bench,
  showBench,
  extraIds = [],
  noneLabel,
  excludeId,
  names,
  disabled = false,
}: PlayerPickerProps) {
  const list = onField.length === 0 || showBench ? [...onField, ...bench] : onField;
  const button = (id: string, text: string, number: string) => {
    const on = value === id;
    const off = !!excludeId && excludeId === id;
    return (
      <button
        key={id || 'none'}
        type="button"
        role="radio"
        aria-checked={on}
        aria-label={number ? `#${number} ${text}` : text}
        className={cn('pbtn', on && 'on', off && 'off', !id && 'none')}
        disabled={disabled || off}
        onClick={() => onChange(id)}
      >
        {number && <b>#{number}</b>}
        <span>{text}</span>
      </button>
    );
  };
  return (
    <div className="fld" role="group">
      <span>{label}</span>
      <div className="pickgrid" role="radiogroup" aria-label={label}>
        {list.map((p) => button(p.id, p.first_name, p.jersey_number ?? ''))}
        {extraIds.map((id) =>
          button(id, `${names.name(id) || 'Removed player'} (removed)`, names.number(id)),
        )}
        {button('', noneLabel, '')}
      </div>
    </div>
  );
}
