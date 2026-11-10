/** The parent home's "next up": the first upcoming game or scheduled practice (D53). Pure. */
import { type ScheduleGame, type ScheduleItem } from '@/games/recurrence';

/** First item on the merged schedule that is not a cancelled practice; null when nothing is coming. */
export function nextEvent<G extends ScheduleGame>(items: readonly ScheduleItem<G>[]): ScheduleItem<G> | null {
  for (const item of items) {
    if (item.kind === 'practice' && item.practice.status === 'cancelled') continue;
    return item;
  }
  return null;
}
