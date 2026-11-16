import { Button } from '@/components/Button';
import { cn } from '@/lib/cn';
import { type SportDefinition, type StatType } from '@/sports/types';

export interface QuickScoreLast {
  text: string;
  /** Undo is offered until the entry has settled on the server, then it deletes it. */
  onUndo?: () => void;
}

/**
 * Basketball quick scoring during a live game (D108): Us +1 +2 +3 on the left, Them on the
 * right. An Us tap arms "who scored?" (the on-court jerseys answer), a Them tap records at
 * once. The confirmation line appears under the buttons once something is scored (D112); the
 * standing "Tap the points scored." lives in the bench info popover instead. The stats the team
 * tracks (D118: REB, AST, STL, FOUL) sit on a second row and arm the same way.
 */
export function QuickScoreRow({
  S,
  pending,
  pendingStat = null,
  stats = [],
  disabled,
  last,
  onUs,
  onThem,
  onStat,
}: {
  S: SportDefinition;
  /** Points waiting for a scorer, or null. */
  pending: number | null;
  /** A stat waiting for its player, or null. */
  pendingStat?: StatType | null;
  /** The stats the team tracks, in button order; none hides the row. */
  stats?: readonly StatType[];
  disabled?: boolean;
  last: QuickScoreLast | null;
  onUs: (points: number) => void;
  onThem: (points: number) => void;
  onStat?: (type: StatType) => void;
}) {
  const kinds = S.scoring.events;
  const statKinds = (S.scoring.stats ?? []).filter((k) => stats.includes(k.type));
  const armed = pending !== null || pendingStat !== null;
  return (
    <div className="quickscore" role="group" aria-label="Quick scoring">
      <div className="qsrow">
        <span className="qsside">Us</span>
        {kinds.map((k) => (
          <Button
            key={`us-${k.type}`}
            size="sm"
            variant={pending === k.points ? 'primary' : 'tinted'}
            className={cn('qsbtn', pending === k.points && 'armed')}
            aria-pressed={pending === k.points}
            aria-label={`Us +${k.points}, ${k.noun}`}
            disabled={disabled || pendingStat !== null}
            onClick={() => onUs(k.points)}
          >
            +{k.points}
          </Button>
        ))}
        <span className="qsgap" aria-hidden="true" />
        <span className="qsside">Them</span>
        {kinds.map((k) => (
          <Button
            key={`them-${k.type}`}
            size="sm"
            variant="gray"
            className="qsbtn"
            aria-label={`Them +${k.points}, ${k.noun}`}
            disabled={disabled || armed}
            onClick={() => onThem(k.points)}
          >
            +{k.points}
          </Button>
        ))}
      </div>
      {statKinds.length > 0 && onStat && (
        <div className="qsrow qsstats" role="group" aria-label="Stats">
          <span className="qsside">Stat</span>
          {statKinds.map((k) => (
            <Button
              key={k.type}
              size="sm"
              variant={pendingStat === k.type ? 'primary' : 'tinted'}
              className={cn('qsbtn', pendingStat === k.type && 'armed')}
              aria-pressed={pendingStat === k.type}
              aria-label={`${k.label}, ${k.noun}`}
              disabled={disabled || pending !== null}
              onClick={() => onStat(k.type)}
            >
              {k.label}
            </Button>
          ))}
        </div>
      )}
      <div className={cn('qslast', !last && 'empty')} aria-live="polite">
        {last && (
          <>
            <span>{last.text}</span>
            {last.onUndo && (
              <button type="button" className="linkbtn" onClick={last.onUndo}>
                Undo
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
