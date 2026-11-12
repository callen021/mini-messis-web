import { type ReactNode } from 'react';
import { OpenPill } from '@/components/Badge';
import { Button } from '@/components/Button';
import { FieldStage } from '@/lineups/FieldStage';
import { Jersey } from '@/lineups/Jersey';
import { playerName } from '@/lineups/api';
import { type FieldView } from '@/sports/field';
import { type Formation, type SportDefinition, type SportKey } from '@/sports/types';
import { type Player } from '@/teams/api';
import { type BenchEntry, BenchRow } from './BenchRow';
import { type Selection } from './tap';

export interface ClockCardProps {
  sport: SportKey;
  S: SportDefinition;
  view: FieldView;
  /** "H1", "Starters", "Full time". */
  title: string;
  formation: Formation;
  forms: readonly Formation[];
  /** Player id per spot ('' = empty). */
  slots: readonly string[];
  /** Time line per spot while on the field ("4:12"); empty on the template. */
  slotTimes?: readonly string[];
  players: readonly Player[];
  bench: readonly BenchEntry[];
  colors: Record<string, string>;
  canEdit: boolean;
  /** The formation select is live only while the lineup may be rewritten (template, or the clock at zero). */
  canChangeFormation: boolean;
  highlight: ReadonlySet<string>;
  selected: Selection;
  /** Ids a just-completed tap touched (D77). */
  flashing: ReadonlySet<string>;
  hint: string;
  /** With an on-field jersey selected: take that player off with nobody on (injury, or clear a starter). */
  onOpenSpot?: () => void;
  onFormationChange: (name: string) => void;
  onTapSlot: (slot: number) => void;
  onTapBench: (playerId: string) => void;
  /** Clock display and score button, right of the title. */
  headerExtra?: ReactNode;
  benchEmptyText: string;
}

/** One field for the whole game (clock mode, D70): the on-field jerseys, then the bench row. */
export function ClockCard({
  sport,
  S,
  view,
  title,
  formation,
  forms,
  slots,
  slotTimes,
  players,
  bench,
  colors,
  canEdit,
  canChangeFormation,
  highlight,
  selected,
  flashing,
  hint,
  onOpenSpot,
  onFormationChange,
  onTapSlot,
  onTapBench,
  headerExtra,
  benchEmptyText,
}: ClockCardProps) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const openCount = slots.filter((s) => !s).length;
  const benchColor = colors[S.groups[0]?.[0] ?? ''] ?? '#888';
  return (
    <article className="qcard clockcard">
      <div className="qhead">
        <div className="qleft">
          <h2>{title}</h2>
          <OpenPill open={openCount} />
        </div>
        <div className="qright">
          {forms.length <= 1 ? null : canEdit && canChangeFormation ? (
            <div className="sel">
              <select
                aria-label="Formation"
                value={formation.name}
                onChange={(e) => onFormationChange(e.target.value)}
              >
                {forms.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span className="pill">{formation.name}</span>
          )}
          {headerExtra}
        </div>
      </div>
      <FieldStage
        sport={sport}
        view={view}
        formation={formation}
        priority
        renderSlot={(i) => {
          const pos = formation.positions[i];
          if (!pos) return null;
          const pid = slots[i] ?? '';
          const player = byId.get(pid);
          const color = colors[S.group(pos.role)] ?? '#888';
          const isSel = !!selected && selected.kind === 'field' && selected.slot === i;
          return (
            <Jersey
              id={`clock-${i}`}
              color={color}
              kind={S.jersey}
              name={player?.first_name ?? ''}
              number={player?.jersey_number ?? undefined}
              code={pos.code}
              highlighted={!!pid && highlight.has(pid)}
              selected={canEdit ? isSel : undefined}
              flash={!!pid && flashing.has(pid)}
              time={pid ? slotTimes?.[i] : undefined}
              label={`${S.label(pos.role)}: ${player ? playerName(player) : 'open'}${slotTimes?.[i] && pid ? `, ${slotTimes[i]} this shift` : ''}`}
              onClick={canEdit ? () => onTapSlot(i) : undefined}
              readOnly={!canEdit}
            />
          );
        }}
      />
      <BenchRow
        S={S}
        color={benchColor}
        entries={bench}
        canEdit={canEdit}
        selectedId={selected?.kind === 'bench' ? selected.playerId : null}
        flashing={flashing}
        highlight={highlight}
        onTap={onTapBench}
        emptyText={benchEmptyText}
      />
      {canEdit && (
        <div className={`taphint${hint ? ' on' : ''}`} aria-live="polite">
          <span>
            {hint ||
              'Tap a jersey, then another, to swap them. Tap an open spot, then a bench player, to fill it.'}
          </span>
          {selected?.kind === 'field' && onOpenSpot && (
            <Button size="sm" variant="gray" onClick={onOpenSpot}>
              Open the spot
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
