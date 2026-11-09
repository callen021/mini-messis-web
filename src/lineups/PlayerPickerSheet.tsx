import { Sheet, SheetButton, SheetGroup, SheetHeader } from '@/components/Sheet';
import { type Player } from '@/teams/api';
import { playerName } from './api';

export interface PickerOnField {
  player: Player;
  /** Position code the player currently holds in this period. */
  code: string;
}

export interface PlayerPickerSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  /** Players not on the field in this period (shown first). */
  bench: Player[];
  /** Players already placed elsewhere in this period ("move from X"). */
  onField: PickerOnField[];
  /** Player currently in the tapped slot, if any. */
  assigned: Player | null;
  /** Periods each player appears in, for the hint next to the name. */
  counts: Record<string, number>;
  periodNoun: string;
  /** '' clears the slot. */
  onPick: (playerId: string) => void;
}

const label = (p: Player, counts: Record<string, number>, noun: string) =>
  `${p.jersey_number ? `#${p.jersey_number} ` : ''}${playerName(p)} · ${counts[p.id] ?? 0} ${noun}${(counts[p.id] ?? 0) === 1 ? '' : 's'}`;

/** Bottom-sheet replacement for the legacy jersey <select>: bench first, then moves, then clear. */
export function PlayerPickerSheet({
  open,
  onClose,
  title,
  message,
  bench,
  onField,
  assigned,
  counts,
  periodNoun,
  onPick,
}: PlayerPickerSheetProps) {
  const pick = (id: string) => {
    onPick(id);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} label={title}>
      <SheetGroup>
        <SheetHeader
          title={title}
          message={message ?? (bench.length ? 'On the bench' : 'Nobody left on the bench')}
        />
        {bench.map((p) => (
          <SheetButton key={p.id} onClick={() => pick(p.id)}>
            {label(p, counts, periodNoun)}
          </SheetButton>
        ))}
      </SheetGroup>
      {onField.length > 0 && (
        <SheetGroup>
          <SheetHeader message="Move from another position" />
          {onField.map(({ player, code }) => (
            <SheetButton key={player.id} onClick={() => pick(player.id)}>
              {code} · {playerName(player)}
            </SheetButton>
          ))}
        </SheetGroup>
      )}
      <SheetGroup>
        {assigned && (
          <SheetButton destructive onClick={() => pick('')}>
            Clear jersey · {playerName(assigned)}
          </SheetButton>
        )}
        <SheetButton cancel onClick={onClose} initialFocus>
          Cancel
        </SheetButton>
      </SheetGroup>
    </Sheet>
  );
}
