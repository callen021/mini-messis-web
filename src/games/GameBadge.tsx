import { Badge } from '@/components/Badge';
import { type GameWithScore } from './api';
import { gameResult } from './stats';

/** Win / Loss / Draw / In progress / Upcoming badge. */
export function GameBadge({ game }: { game: Pick<GameWithScore, 'status' | 'us' | 'them'> }) {
  if (game.status === 'live') return <Badge status="live">In progress</Badge>;
  if (game.status === 'upcoming') return <Badge status="upcoming">Upcoming</Badge>;
  const r = gameResult(game);
  return <Badge status="done">{r === 'W' ? 'Win' : r === 'L' ? 'Loss' : 'Draw'}</Badge>;
}
