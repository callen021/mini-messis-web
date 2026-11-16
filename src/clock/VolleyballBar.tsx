import { Button } from '@/components/Button';
import { cn } from '@/lib/cn';

export type Side = 'us' | 'them';

export interface VolleyballBarProps {
  opponent: string;
  /** Points in the current set. */
  us: number;
  them: number;
  /** Who serves next; null until the set's first serve is known. */
  serving: Side | null;
  /** The match is decided (or every set has been played): no more points. */
  over: boolean;
  disabled?: boolean;
  /** Whether the viewer may rotate by hand and end the set (the staff); the keeper only scores. */
  canRun: boolean;
  onPoint: (side: Side) => void;
  onServe: (side: Side) => void;
  onRotate: () => void;
  onEndSet: () => void;
  onUndo: () => void;
}

/**
 * The volleyball point bar under the court (D121), two rows so the live court still fits a phone
 * screen without scrolling (D108): who serves (tap a side to set it before the first serve, or to
 * correct it) with Rotate, Undo and End set; then a point for us or them. The set number is the
 * card's title and the sets tally rides on the page's title line. A point we win on their serve
 * rotates us on the server side; Undo takes the point back with that rotation.
 */
export function VolleyballBar({
  opponent,
  us,
  them,
  serving,
  over,
  disabled,
  canRun,
  onPoint,
  onServe,
  onRotate,
  onEndSet,
  onUndo,
}: VolleyballBarProps) {
  const serveButton = (side: Side, label: string) => (
    <button
      type="button"
      className={cn('serve', serving === side && 'on')}
      aria-pressed={serving === side}
      aria-label={`${label} serve${serving === side ? ', serving' : ''}`}
      disabled={disabled || over}
      onClick={() => onServe(side)}
    >
      {serving === side ? '🏐 ' : ''}
      {label}
    </button>
  );
  return (
    <div className="quickscore vbbar" role="group" aria-label="Volleyball scoring">
      <div className="qsrow">
        <span className="qsside">Serve</span>
        {serveButton('us', 'Us')}
        {serveButton('them', 'Them')}
        <span className="qsgap" aria-hidden="true" />
        {canRun && (
          <Button size="sm" variant="gray" className="qsbtn" disabled={disabled || over} onClick={onRotate}>
            Rotate
          </Button>
        )}
        <Button size="sm" variant="gray" className="qsbtn" disabled={disabled} onClick={onUndo}>
          Undo
        </Button>
        {canRun && (
          <Button size="sm" variant="gray" className="qsbtn" disabled={disabled || over} onClick={onEndSet}>
            End set
          </Button>
        )}
      </div>
      <div className="qsrow" style={{ marginTop: 5 }}>
        <Button
          size="sm"
          variant="tinted"
          className="qsbtn big"
          aria-label={`Point for us, ${us + 1} to ${them}`}
          disabled={disabled || over}
          onClick={() => onPoint('us')}
        >
          +1 Us
        </Button>
        <Button
          size="sm"
          variant="gray"
          className="qsbtn big"
          aria-label={`Point for ${opponent}, ${us} to ${them + 1}`}
          disabled={disabled || over}
          onClick={() => onPoint('them')}
        >
          +1 Them
        </Button>
      </div>
    </div>
  );
}
