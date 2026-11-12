import { Jersey } from '@/lineups/Jersey';
import { type SportDefinition } from '@/sports/types';
import { type Player } from '@/teams/api';

export interface BenchEntry {
  player: Player;
  /** Second line under the jersey ("12 min · rest 3:20", "2 quarters"); empty when there is nothing to say. */
  time?: string;
}

/**
 * The bench under a field (D70, D77): the same jersey art at about two-thirds size, at least a
 * 44px tap target. It is the queue (D79) drawn right to left (D83): the next player in
 * is the rightmost jersey of the top row, the line continues leftward and then along the next
 * row, rows are right-aligned, and a player coming off joins the end (leftmost of the last row).
 * The DOM order stays queue order, so screen readers and tests read it next-in first. Players
 * marked out are not shown. Staff tap to select a player; parents see it read-only.
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
      <span className="benchlabel">
        Bench · {entries.length}
        {extra && <small> · {extra}</small>}
      </span>
      {entries.length === 0 && <span className="benchempty">{emptyText}</span>}
      <div className="benchq">
        {entries.map(({ player, time }) => (
          <div key={player.id} className="bslot">
            <Jersey
              id={`bench-${player.id}`}
              color={color}
              kind={S.jersey}
              name={player.first_name}
              number={player.jersey_number ?? undefined}
              code=""
              label={`Bench: ${player.first_name}${player.jersey_number ? ` #${player.jersey_number}` : ''}${time ? `, ${time}` : ''}`}
              onClick={canEdit ? () => onTap(player.id) : undefined}
              readOnly={!canEdit}
              highlighted={highlight.has(player.id)}
              selected={canEdit ? selectedId === player.id : undefined}
              flash={flashing?.has(player.id)}
              time={time}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
