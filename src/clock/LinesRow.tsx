import { Button } from '@/components/Button';
import { LINE_SLOTS, type Line, lineHasPlayers, lineLabel } from '@/lines/api';

/**
 * The line chips under the bench on the live rink (D122): F1 F2 F3 · D1 D2. One tap puts the
 * line on exactly as saved (the server does the moves as one undoable op). A line with nobody
 * saved is greyed out; the row renders nothing with no lines at all.
 */
export function LinesRow({
  lines,
  disabled,
  onChange,
}: {
  lines: readonly Line[];
  disabled?: boolean;
  onChange: (line: Line) => void;
}) {
  const saved = LINE_SLOTS.map(({ kind, slot }) =>
    lines.find((l) => l.kind === kind && l.slot === slot),
  ).filter((l): l is Line => !!l);
  if (!saved.length) return null;
  return (
    <div className="quickscore linesrow" role="group" aria-label="Lines">
      <div className="qsrow">
        <span className="qsside">Lines</span>
        {saved.map((line) => (
          <Button
            key={line.id}
            size="sm"
            variant={line.kind === 'forward' ? 'tinted' : 'gray'}
            className="qsbtn"
            aria-label={`${line.kind === 'forward' ? 'Forward line' : 'Defense pair'} ${lineLabel(line)} on`}
            disabled={disabled || !lineHasPlayers(line)}
            onClick={() => onChange(line)}
          >
            {lineLabel(line)}
          </Button>
        ))}
      </div>
    </div>
  );
}
