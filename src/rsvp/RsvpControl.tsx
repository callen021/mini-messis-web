import { useState } from 'react';
import { Tag } from '@/components/Badge';
import { cn } from '@/lib/cn';
import { RsvpButtons } from './RsvpButtons';
import { RsvpIcon } from './RsvpMarks';
import { type RsvpStatus } from './rsvp';

/**
 * A parent's reply for one player and one event (D107): unanswered, a prompt line with an amber
 * "Reply needed" tag and the two buttons; answered, one status line with a Change link that
 * brings the buttons back; locked, the status line alone.
 */
export function RsvpControl({
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
  const [changing, setChanging] = useState(false);
  // a new answer (from this tap or another device) closes the buttons again
  const [seen, setSeen] = useState(status);
  if (seen !== status) {
    setSeen(status);
    setChanging(false);
  }
  const answered = status !== 'none';
  const showButtons = !locked && (!answered || changing);

  return (
    <div className={cn('rsvpctl', className)}>
      {answered ? (
        <p className={`rsvpline ${status}`}>
          <RsvpIcon status={status} />
          <span>
            {playerName} {status === 'going' ? 'is going' : 'can’t make it'}
          </span>
          {!locked && !changing && (
            <button type="button" className="linkbtn" onClick={() => setChanging(true)}>
              Change
            </button>
          )}
        </p>
      ) : locked ? (
        <p className="rsvpline none">
          <span>No reply for {playerName}</span>
        </p>
      ) : (
        <p className="rsvpline ask">
          <span>Is {playerName} going?</span>
          <Tag className="warn">Reply needed</Tag>
        </p>
      )}
      {showButtons && (
        <RsvpButtons status={status} playerName={playerName} locked={locked} busy={busy} onSet={onSet} />
      )}
    </div>
  );
}
