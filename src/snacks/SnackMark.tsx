import { SnackIcon } from '@/components/icons';
import { type SnackSlot, snackMarkLabel } from './snacks';

/** The small snack icon on a schedule row (D115): outline = open, filled = taken, red = the family can't make it. */
export function SnackMark({
  slot,
  nameOf,
}: {
  slot: SnackSlot;
  nameOf: (playerId: string) => string | undefined;
}) {
  const { state, label } = snackMarkLabel(slot, nameOf);
  return (
    <span className={`snackmark ${state}`} role="img" aria-label={label} title={label}>
      <SnackIcon />
    </span>
  );
}
