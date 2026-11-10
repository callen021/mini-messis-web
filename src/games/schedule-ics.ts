import { type GameWithScore } from './api';
import { gameEvent, practiceEvent } from './ics';
import { type ScheduleItem } from './recurrence';

/** Every upcoming, non-cancelled game and practice as calendar events (the "Add all" file). */
export function scheduleEvents(items: readonly ScheduleItem<GameWithScore>[], teamName: string) {
  return items.flatMap((item) =>
    item.kind === 'game'
      ? [
          gameEvent({
            id: item.game.id,
            teamName,
            opponent: item.game.opponent,
            date: item.game.game_date,
            startTime: item.game.start_time,
            location: item.game.location,
            address: item.game.address,
            homeAway: item.game.home_away,
            notes: item.game.parent_notes,
          }),
        ]
      : item.practice.status === 'cancelled'
        ? []
        : [
            practiceEvent({
              id: item.practice.id,
              teamName,
              date: item.practice.practice_date,
              startTime: item.practice.start_time,
              endTime: item.practice.end_time,
              location: item.practice.location,
              address: item.practice.address,
              notes: item.practice.notes,
            }),
          ],
  );
}
