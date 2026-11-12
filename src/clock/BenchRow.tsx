import { Jersey } from '@/lineups/Jersey';
import { type SportDefinition } from '@/sports/types';
import { type Player } from '@/teams/api';

export interface BenchEntry {
  player: Player;
  /** Second line under the jersey ("12 min · rest 3:20"); empty on the template. */
  time?: string;
}

/**
 * The bench under a clock-mode field (D70): the same jersey art at about two-thirds size, at least
 * a 44px tap target, wrapping as needed. Players marked out are not shown. Staff tap to select a
 * player for a substitution; parents see it read-only.
 */
export function BenchRow({
  S,
  color,
  entries,
  canEdit,
  selectedId,
  highlight,
  onTap,
  emptyText,
}: {
  S: SportDefinition;
  color: string;
  entries: readonly BenchEntry[];
  canEdit: boolean;
  selectedId: string | null;
  highlight: ReadonlySet<string>;
  onTap: (playerId: string) => void;
  emptyText: string;
}) {
  return (
    <div className="benchrow" role="group" aria-label="Bench">
      <span className="benchlabel">Bench · {entries.length}</span>
      {entries.length === 0 && <span className="benchempty">{emptyText}</span>}
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
            time={time}
          />
        </div>
      ))}
    </div>
  );
}
