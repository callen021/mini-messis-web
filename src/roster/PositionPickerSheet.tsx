import { Sheet, SheetButton, SheetGroup, SheetHeader } from '@/components/Sheet';
import { type Formation, type Period } from '@/sports/types';
import { type Player } from '@/teams/api';

export interface PositionPickerSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  player: Player;
  period: Period;
  formation: Formation;
  players: Player[];
  /** null = sit this period. */
  onPick: (slotIndex: number | null) => void;
}

/** Rotation-grid chip menu: "* Sitting out" plus every position with its current occupant. */
export function PositionPickerSheet({
  open,
  onClose,
  title,
  player,
  period,
  formation,
  players,
  onPick,
}: PositionPickerSheetProps) {
  const current = period.slots.indexOf(player.id);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.first_name ?? '';
  const pick = (i: number | null) => {
    onPick(i);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} label={title}>
      <SheetGroup>
        <SheetHeader
          title={title}
          message={current >= 0 ? `Now at ${formation.positions[current]?.code ?? ''}` : 'Sitting out'}
        />
        <SheetButton onClick={() => pick(null)} destructive={current >= 0}>
          * Sitting out
        </SheetButton>
        {formation.positions.map((pos, i) => {
          const occupant = period.slots[i] ?? '';
          const mine = occupant === player.id;
          return (
            <SheetButton key={i} onClick={() => pick(i)}>
              {pos.code}
              {occupant && !mine ? ` · ${nameOf(occupant)}` : mine ? ' ✓' : ''}
            </SheetButton>
          );
        })}
      </SheetGroup>
      <SheetGroup>
        <SheetButton cancel onClick={onClose} initialFocus>
          Cancel
        </SheetButton>
      </SheetGroup>
    </Sheet>
  );
}
