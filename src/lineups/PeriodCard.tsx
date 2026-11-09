import { type ReactNode, useMemo, useState } from 'react';
import { OpenPill } from '@/components/Badge';
import { Button } from '@/components/Button';
import { type FieldView } from '@/sports/field';
import { type Formation, type Period, type SportDefinition, type SportKey } from '@/sports/types';
import { type Player } from '@/teams/api';
import { playerName } from './api';
import { FieldStage } from './FieldStage';
import { Jersey } from './Jersey';
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
  periodNoun: string;
  canEdit: boolean;
  /** Player ids to highlight (a parent's own children). */
  highlight: ReadonlySet<string>;
  onFormationChange: (name: string) => void;
  onAssign: (slotIndex: number, playerId: string) => void;
  onAutoFill: () => void;
  onRedo: () => void;
  /** Optional trailing control in the header (score button, Phase 5). */
  headerExtra?: ReactNode;
}

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
  periodNoun,
  canEdit,
  highlight,
  onFormationChange,
  onAssign,
  onAutoFill,
  onRedo,
  headerExtra,
}: PeriodCardProps) {
  const [picking, setPicking] = useState<number | null>(null);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const openCount = period.slots.filter((s) => !s).length;
  const sittingOut = activePlayers.filter((p) => !period.slots.includes(p.id));
  const out = players.filter((p) => !p.is_available);
  const autoN = period.auto.filter((i) => period.slots[i]).length;

  const pickSlot = picking !== null ? formation.positions[picking] : undefined;
  const assignedId = picking !== null ? (period.slots[picking] ?? '') : '';
  const bench = activePlayers.filter((p) => !period.slots.includes(p.id));
  const onField = activePlayers
    .filter((p) => period.slots.includes(p.id) && p.id !== assignedId)
    .map((p) => ({ player: p, code: formation.positions[period.slots.indexOf(p.id)]?.code ?? '' }));

  return (
    <article className="qcard">
      <div className="qhead">
        <div className="qleft">
          <h2>{title}</h2>
          <OpenPill open={openCount} />
        </div>
        <div className="qright">
          {canEdit ? (
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
              auto={period.auto.includes(i)}
              highlighted={!!pid && highlight.has(pid)}
              label={`${S.periodName(0)} ${periodIndex + 1}, ${roleLabel}: ${player ? playerName(player) : 'open'}`}
              onClick={canEdit ? () => setPicking(i) : undefined}
              readOnly={!canEdit}
            />
          );
        }}
      />
      <div className="bench">
        {openCount > 0 && <span className="opencount">{openCount} open</span>}
        <strong>Sitting out · {sittingOut.length}</strong>
        <div className="names">
          {sittingOut.map((p) => p.first_name).join(' · ') || `Everyone is ${S.unit}`}
          {out.length > 0 && `  ·  Out: ${out.map((p) => p.first_name).join(', ')}`}
        </div>
        {canEdit && openCount > 0 && sittingOut.length > 0 && (
          <Button
            size="sm"
            variant="tinted"
            onClick={onAutoFill}
            title="Fill the open jerseys with the players who have played least"
          >
            Auto-fill
          </Button>
        )}
        {canEdit && !(openCount > 0 && sittingOut.length > 0) && autoN > 0 && (
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
      {canEdit && (
        <PlayerPickerSheet
          open={picking !== null}
          onClose={() => setPicking(null)}
          title={pickSlot ? `${title} · ${S.label(pickSlot.role)}` : title}
          bench={bench}
          onField={onField}
          assigned={assignedId ? (byId.get(assignedId) ?? null) : null}
          counts={counts}
          periodNoun={periodNoun}
          onPick={(id) => {
            if (picking !== null) onAssign(picking, id);
          }}
        />
      )}
    </article>
  );
}
