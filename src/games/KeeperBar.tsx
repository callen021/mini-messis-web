import { Button } from '@/components/Button';
import { type KeeperGame, type KeeperViewer, canKeepStats, keeperText } from './keeper';

/**
 * The game bar's line about who keeps the scores and stats of a live game (D120), with Keep stats
 * for a coach, an assistant or a granted stat keeper who is not keeping them right now. On the
 * court it renders only while there is something to offer: the live court must fit a phone screen
 * without scrolling (D108), so the plain "You keep the stats" goes into the title line instead.
 */
export function KeeperBar({
  game,
  viewer,
  busy,
  onKeep,
  always,
}: {
  game: KeeperGame | null | undefined;
  viewer: KeeperViewer;
  busy?: boolean;
  onKeep: () => void;
  /** Render the line even with nothing to offer (the game page); the court folds the text into its own line. */
  always?: boolean;
}) {
  const text = keeperText(game, viewer.userId);
  const offer = canKeepStats(game, viewer);
  if (!offer && !(always && text)) return null;
  return (
    <p className="sub keeperbar" role="status">
      <span>{text ?? 'Nobody is keeping the stats'}</span>
      {offer && (
        <Button size="sm" variant="tinted" disabled={busy} onClick={onKeep}>
          Keep stats
        </Button>
      )}
    </p>
  );
}
