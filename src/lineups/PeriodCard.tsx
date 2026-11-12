import { type ReactNode, useMemo, useState } from 'react';
import { BenchRow } from '@/clock/BenchRow';
import { type Selection, resolveTap, selectionHint } from '@/clock/tap';
import { useFlash } from '@/clock/useFlash';
import { OpenPill } from '@/components/Badge';
import { Button } from '@/components/Button';
import { type FieldView } from '@/sports/field';
import { type Formation, type Period, type SportDefinition, type SportKey } from '@/sports/types';
import { type Player } from '@/teams/api';
import { playerName } from './api';
import { FieldStage } from './FieldStage';
import { Jersey } from './Jersey';
import { periodsPlayed } from './captions';
import { PlayerPickerSheet } from './PlayerPickerSheet';

export interface PeriodCardProps {
  sport: SportKey;
  S: SportDefinition;
  view: FieldView;
  title: string;
  periodIndex: number;
  period: Period;
  formation: Formation;
  forms: readonly Formation[];
  players: Player[];
  activePlayers: Player[];
  colors: Record<string, string>;
  counts: Record<string, number>;
  /** Periods per game, for the "2 quarters" / "1 half" caption under a bench jersey. */
  periodCount: number;
  canEdit: boolean;
  /** Player ids to highlight (a parent's own children). */
  highlight: ReadonlySet<string>;
  onFormationChange: (name: string) => void;
  onAssign: (slotIndex: number, playerId: string) => void;
  /** Two on-field jerseys change places (D77). */
  onSwap: (slotA: number, slotB: number) => void;
  /** The bench queue for this period, left to right (D79). */
  benchOrder: readonly string[];
  /** Two bench players change places in the queue (D79). */
  onBenchSwap: (a: string, b: string) => void;
  onAutoFill: () => void;
  onRedo: () => void;
  /** Optional trailing control in the header (score button, Phase 5). */
  headerExtra?: ReactNode;
}

/**
 * One period of the plan: the field, then the bench row of small jerseys (sitting out, fewest
 * periods first) and the Auto-fill / Redo buttons. Changes are select-then-target (D77): the
 * first tap selects a jersey, the second completes the change; an open spot with nothing selected
 * opens the picker sheet as before.
 */
export function PeriodCard({
  sport,
  S,
  view,
  title,
  periodIndex,
  period,
  formation,
  forms,
  players,
  activePlayers,
  colors,
  counts,
  periodCount,
  canEdit,
  highlight,
  onFormationChange,
  onAssign,
  onSwap,
  benchOrder,
  onBenchSwap,
  onAutoFill,
  onRedo,
  headerExtra,
}: PeriodCardProps) {
  const [picking, setPicking] = useState<number | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const [flashing, flash] = useFlash();
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const openCount = period.slots.filter((s) => !s).length;
  const sittingOut = useMemo(() => {
    const byId = new Map(activePlayers.map((p) => [p.id, p]));
    return benchOrder.flatMap((id) => {
      const p = byId.get(id);
      return p && !period.slots.includes(id) ? [p] : [];
    });
  }, [activePlayers, period.slots, benchOrder]);
  const out = players.filter((p) => !p.is_available);
  const autoN = period.auto.filter((i) => period.slots[i]).length;
  const nameOf = (id: string) => byId.get(id)?.first_name ?? 'player';

  const pickSlot = picking !== null ? formation.positions[picking] : undefined;
  const assignedId = picking !== null ? (period.slots[picking] ?? '') : '';
  const onField = activePlayers
    .filter((p) => period.slots.includes(p.id) && p.id !== assignedId)
    .map((p) => ({ player: p, code: formation.positions[period.slots.indexOf(p.id)]?.code ?? '' }));
  const benchColor = colors[S.groups[0]?.[0] ?? ''] ?? '#888';

  const tap = (target: Parameters<typeof resolveTap>[1]) => {
    const o = resolveTap(selected, target);
    if (o.action === 'select') {
      setSelected(o.selection);
      return;
    }
    if (o.action === 'none') return;
    setSelected(null);
    if (o.action === 'cancel') return;
    if (o.action === 'picker') {
      setPicking(o.slot);
      return;
    }
    if (o.action === 'benchswap') {
      flash([o.a, o.b]);
      onBenchSwap(o.a, o.b);
      return;
    }
    if (o.action === 'swap') {
      const ia = period.slots.indexOf(o.a);
      const ib = period.slots.indexOf(o.b);
      if (ia < 0 || ib < 0) return;
      flash([o.a, o.b]);
      onSwap(ia, ib);
    } else if (o.action === 'move') {
      flash([o.playerId]);
      onAssign(o.slot, o.playerId);
    } else if (o.action === 'sub') {
      const i = period.slots.indexOf(o.off);
      if (i < 0) return;
      flash([o.off, o.on]);
      onAssign(i, o.on);
    } else if (o.action === 'fill') {
      flash([o.playerId]);
      onAssign(o.slot, o.playerId);
    }
  };
  const openSelectedSpot = () => {
    if (!selected || selected.kind !== 'field') return;
    setSelected(null);
    onAssign(selected.slot, '');
  };

  return (
    <article className="qcard">
      <div className="qhead">
        <div className="qleft">
          <h2>{title}</h2>
          <OpenPill open={openCount} />
        </div>
        <div className="qright">
          {forms.length <= 1 ? null : canEdit ? (
            <div className="sel">
              <select
                aria-label={`Formation for ${S.periodName(0)} ${periodIndex + 1}`}
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
        renderSlot={(i) => {
          const pos = formation.positions[i];
          if (!pos) return null;
          const pid = period.slots[i] ?? '';
          const player = byId.get(pid);
          const color = colors[S.group(pos.role)] ?? '#888';
          const roleLabel = S.label(pos.role);
          return (
            <Jersey
              id={`${periodIndex}-${i}`}
              color={color}
              kind={S.jersey}
              name={player?.first_name ?? ''}
              number={player?.jersey_number ?? undefined}
              code={pos.code}
              auto={canEdit && period.auto.includes(i)}
              highlighted={!!pid && highlight.has(pid)}
              selected={canEdit ? !!selected && selected.kind === 'field' && selected.slot === i : undefined}
              flash={!!pid && flashing.has(pid)}
              label={`${S.periodName(0)} ${periodIndex + 1}, ${roleLabel}: ${player ? playerName(player) : 'open'}`}
              onClick={canEdit ? () => tap({ kind: 'field', slot: i, playerId: pid }) : undefined}
              readOnly={!canEdit}
            />
          );
        }}
      />
      <BenchRow
        S={S}
        color={benchColor}
        entries={sittingOut.map((player) => ({
          player,
          time: periodsPlayed(S, periodCount, counts[player.id] ?? 0),
        }))}
        canEdit={canEdit}
        selectedId={selected?.kind === 'bench' ? selected.playerId : null}
        flashing={flashing}
        highlight={highlight}
        onTap={(playerId) => tap({ kind: 'bench', playerId })}
        emptyText={`Everyone is ${S.unit}`}
        extra={out.length > 0 ? `Out: ${out.map((p) => p.first_name).join(', ')}` : undefined}
      />
      {canEdit && (
        <div className={`taphint${selected ? ' on' : ''}`} aria-live="polite">
          <span>
            {selected
              ? selectionHint(selected, nameOf)
              : 'Tap a jersey, then another, to swap them. The bench is a line: next in on the right.'}
          </span>
          {selected?.kind === 'field' && (
            <Button size="sm" variant="gray" onClick={openSelectedSpot}>
              Open the spot
            </Button>
          )}
          {!selected && openCount > 0 && sittingOut.length > 0 && (
            <Button
              size="sm"
              variant="tinted"
              onClick={onAutoFill}
              title="Fill the open jerseys with the players who have played least"
            >
              Auto-fill
            </Button>
          )}
          {!selected && !(openCount > 0 && sittingOut.length > 0) && autoN > 0 && (
            <Button
              size="sm"
              variant="gray"
              onClick={onRedo}
              title="Reshuffle the auto-filled jerseys; your own picks stay"
            >
              Redo
            </Button>
          )}
        </div>
      )}
      {canEdit && (
        <PlayerPickerSheet
          open={picking !== null}
          onClose={() => setPicking(null)}
          title={pickSlot ? `${title} · ${S.label(pickSlot.role)}` : title}
          bench={sittingOut}
          onField={onField}
          assigned={assignedId ? (byId.get(assignedId) ?? null) : null}
          counts={counts}
          periodNoun={S.periodName(periodCount).toLowerCase()}
          onPick={(id) => {
            if (picking !== null) onAssign(picking, id);
          }}
        />
      )}
    </article>
  );
}
