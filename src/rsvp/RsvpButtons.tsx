import { Button } from '@/components/Button';
import { cn } from '@/lib/cn';
import { type RsvpStatus } from './rsvp';

/**
 * A parent's reply for one player and one event (D107): Going and Can't make it, both always
 * visible, the current choice highlighted so it changes in one tap. Tapping the highlighted one
 * again clears the reply. Locked once the game has started (the practice has begun).
 */
export function RsvpButtons({
  status,
  playerName,
  locked,
  busy,
  onSet,
  className,
}: {
  status: RsvpStatus;
  playerName: string;
  locked: boolean;
  busy?: boolean;
  onSet: (status: RsvpStatus) => void;
  className?: string;
}) {
  const pick = (s: RsvpStatus) => onSet(status === s ? 'none' : s);
  return (
    <div className={cn('rsvpbtns', className)} role="group" aria-label={`${playerName}: will they make it?`}>
      <Button
        variant={status === 'going' ? 'primary' : 'gray'}
        className={cn('rsvpbtn', status === 'going' && 'on')}
        aria-pressed={status === 'going'}
        disabled={locked || busy}
        onClick={() => pick('going')}
      >
        Going
      </Button>
      <Button
        variant={status === 'out' ? 'primary' : 'gray'}
        className={cn('rsvpbtn out', status === 'out' && 'on')}
        aria-pressed={status === 'out'}
        disabled={locked || busy}
        onClick={() => pick('out')}
      >
        Can’t make it
      </Button>
    </div>
  );
}
