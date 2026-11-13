import { Jersey } from '@/lineups/Jersey';
import { type SportDefinition } from '@/sports/types';
import { type Player } from '@/teams/api';

export interface BenchEntry {
  player: Player;
}

/**
 * The bench under a field (D70, D77): the same jersey art, smaller, five to a row on a phone,
 * at least a 44px tap target. It is the queue (D79) drawn right to left (D83): the next player in
 * is the rightmost jersey of the top row, the line continues leftward and then along the next
 * row, rows are right-aligned, and a player coming off joins the end (leftmost of the last row).
 * The DOM order stays queue order, so screen readers and tests read it next-in first. Players
 * marked out are not shown. Staff tap to select a player; parents see it read-only. Nothing is
 * written under a bench jersey (D99): minutes and periods live on the Rotation view.
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
}) {
  return (
    <div className="benchrow" role="group" aria-label="Bench">
      <div className="benchhead">
        <span className="benchlabel">
          Bench · {entries.length}
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
