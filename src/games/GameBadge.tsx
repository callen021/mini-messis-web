import { Badge } from '@/components/Badge';
import { type GameWithScore } from './api';
import { gameResult } from './stats';
import { timingLabel } from './timing';

/**
 * Win / Loss / Draw / In progress badge; an upcoming game shows how soon it is (Today, Tomorrow,
 * This week, Upcoming — D50) when `today` is given, plain "Upcoming" otherwise.
 */
export function GameBadge({
  game,
  today,
}: {
  game: Pick<GameWithScore, 'status' | 'us' | 'them'> & { game_date?: string };
  today?: string;
}) {
  if (game.status === 'live') return <Badge status="live">In progress</Badge>;
  if (game.status === 'upcoming') {
    const label = today && game.game_date ? timingLabel(game.game_date, today) : 'Upcoming';
    return (
      <Badge status="upcoming" className={label === 'Upcoming' ? undefined : 'soon'}>
        {label}
      </Badge>
    );
  }
  const r = gameResult(game);
  return <Badge status="done">{r === 'W' ? 'Win' : r === 'L' ? 'Loss' : 'Draw'}</Badge>;
}
