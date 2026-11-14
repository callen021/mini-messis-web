import { useEffect, useId, useRef, useState } from 'react';
import { Jersey } from '@/lineups/Jersey';
import { type SportDefinition } from '@/sports/types';
import { type Player } from '@/teams/api';

export interface BenchEntry {
  player: Player;
}

/** The standing how-to for moving players (D112): behind the bench's info button, not on the page. */
export const MOVE_HELP =
  'Tap a jersey, then another, to swap them. Tap an open spot, then a bench player, to fill it.';

/**
 * The bench under a field (D70, D77): the same jersey art, smaller, five to a row on a phone,
 * at least a 44px tap target. It is the queue (D79) drawn right to left (D83): the next player in
 * is the rightmost jersey of the top row, the line continues leftward and then along the next
 * row, rows are right-aligned, and a player coming off joins the end (leftmost of the last row).
 * The DOM order stays queue order, so screen readers and tests read it next-in first. Players
 * marked out are not shown. Staff tap to select a player; parents see it read-only. Nothing is
 * written under a bench jersey (D99): minutes and periods live on the Rotation view. The how-to
 * sits behind a small info button after the label (D112); a tap anywhere else closes it.
 */
export function BenchRow({
  S,
  color,
  entries,
  canEdit,
  selectedId,
  flashing,
  highlight,
  onTap,
  emptyText,
  extra,
  help,
}: {
  S: SportDefinition;
  color: string;
  entries: readonly BenchEntry[];
  canEdit: boolean;
  selectedId: string | null;
  /** Ids a just-completed tap touched, outlined for a moment (D77). */
  flashing?: ReadonlySet<string>;
  highlight: ReadonlySet<string>;
  onTap: (playerId: string) => void;
  emptyText: string;
  /** Trailing note, e.g. the players marked out for this game. */
  extra?: string;
  /** The how-to behind the info button; none hides the button (parents). */
  help?: string;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);
  const helpId = useId();
  useEffect(() => {
    if (!helpOpen) return;
    // a tap anywhere outside the popover and its button closes it; so does Escape
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !helpRef.current?.contains(e.target)) setHelpOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHelpOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [helpOpen]);
  return (
    <div className="benchrow" role="group" aria-label="Bench">
      <div className="benchhead">
        <span className="benchlabel">
          Bench · {entries.length}
          {help && (
            <span className="benchhelp" ref={helpRef}>
              <button
                type="button"
                className="infobtn"
                aria-label="How to move players"
                aria-expanded={helpOpen}
                aria-controls={helpId}
                onClick={() => setHelpOpen((o) => !o)}
              >
                <span aria-hidden="true">i</span>
              </button>
              {helpOpen && (
                <span className="helppop" id={helpId} role="note">
                  {help}
                </span>
              )}
            </span>
          )}
          {extra && <small> · {extra}</small>}
        </span>
        {entries.length > 0 && (
          <span className="upnext" aria-hidden="true">
            Up Next
          </span>
        )}
      </div>
      {entries.length === 0 && <span className="benchempty">{emptyText}</span>}
      <div className="benchq">
        {entries.map(({ player }, i) => (
          <div key={player.id} className="bslot">
            <Jersey
              id={`bench-${player.id}`}
              color={color}
              kind={S.jersey}
              name={player.first_name}
              number={player.jersey_number ?? undefined}
              code=""
              label={`Bench: ${player.first_name}${player.jersey_number ? ` #${player.jersey_number}` : ''}${i === 0 ? ', up next' : ''}`}
              onClick={canEdit ? () => onTap(player.id) : undefined}
              readOnly={!canEdit}
              highlighted={highlight.has(player.id)}
              selected={canEdit ? selectedId === player.id : undefined}
              flash={flashing?.has(player.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
