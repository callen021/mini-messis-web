import { type ReactNode, useMemo } from 'react';
import { OpenPill } from '@/components/Badge';
import { Button } from '@/components/Button';
import { FieldStage } from '@/lineups/FieldStage';
import { Jersey } from '@/lineups/Jersey';
import { playerName } from '@/lineups/api';
import { type FieldView } from '@/sports/field';
import { type Formation, type SportDefinition, type SportKey } from '@/sports/types';
import { type Player } from '@/teams/api';
import { type BenchEntry, BenchRow, MOVE_HELP } from './BenchRow';
import { type ClockState, type Stint, formatClock, isRunning, playerTimes } from './clock';
import { type Selection } from './tap';
import { useServerNow } from './useNow';

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
  players: readonly Player[];
  /** The bench queue, next in first (D79). */
  bench: readonly Player[];
  /** A live game: the shift time under each on-field jersey comes from the stints and ticks here (D95). */
  live: boolean;
  clock: ClockState;
  stints: readonly Stint[];
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
  /** Players a parent's reply marks out for the planned game (D107): red OUT tag if still placed, listed as out. */
  parentOut?: ReadonlySet<string>;
  /** Trailing bench note: the players marked out, coach flag or parent reply (D107). */
  outText?: string;
  /** The one-period "Game" title stays for screen readers only, so the chips never overlap it (D108). */
  hideTitle?: boolean;
  /** Scoring mode (D108): the on-court jerseys answer "who scored?". */
  pickable?: boolean;
  /** Replaces the "Open the spot" button in the hint line (scoring mode: Team / Cancel). */
  hintExtra?: ReactNode;
  /** The how-to behind the bench info button (D112); the standing text unless the page adds to it. */
  help?: string;
}

const NOBODY: ReadonlySet<string> = new Set();

/** One field for the whole game (clock mode, D70): the on-field jerseys, then the bench row. */
export function ClockCard({
  sport,
  S,
  view,
  title,
  formation,
  forms,
  slots,
  players,
  bench,
  live,
  clock,
  stints,
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
  parentOut = NOBODY,
  outText,
  hideTitle,
  pickable,
  hintExtra,
  help = MOVE_HELP,
}: ClockCardProps) {
  const byId = new Map(players.map((p) => [p.id, p]));
  // the only thing on the page that re-renders every second (D95)
  const now = useServerNow(live && isRunning(clock));
  const times = useMemo(() => {
    if (!live) return null;
    return playerTimes(stints, clock, now, slots.filter(Boolean));
  }, [live, stints, clock, now, slots]);
  // nothing under a bench jersey (D99): the queue is the information
  const benchEntries: BenchEntry[] = useMemo(() => bench.map((player) => ({ player })), [bench]);
  const slotTimes = useMemo(
    () => (times ? slots.map((id) => (id ? formatClock(times.get(id)?.shiftSeconds ?? 0) : '')) : undefined),
    [times, slots],
  );
  const openCount = slots.filter((s) => !s).length;
  const benchColor = colors[S.groups[0]?.[0] ?? ''] ?? '#888';
  return (
    <article className="qcard clockcard">
      <div className="qhead">
        <div className="qleft">
          <h2 className={hideTitle ? 'sr-only' : undefined}>{title}</h2>
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
              heldOut={!!pid && parentOut.has(pid)}
              pickable={pickable && !!pid}
              label={`${S.label(pos.role)}: ${player ? playerName(player) : 'open'}${slotTimes?.[i] && pid ? `, ${slotTimes[i]} this shift` : ''}${pid && parentOut.has(pid) ? ', marked out for this game' : ''}${pickable && pid ? ', tap to credit the points' : ''}`}
              onClick={canEdit ? () => onTapSlot(i) : undefined}
              readOnly={!canEdit}
            />
          );
        }}
      />
      <BenchRow
        S={S}
        color={benchColor}
        entries={benchEntries}
        canEdit={canEdit}
        selectedId={selected?.kind === 'bench' ? selected.playerId : null}
        flashing={flashing}
        highlight={highlight}
        onTap={onTapBench}
        emptyText={benchEmptyText}
        extra={outText}
        help={canEdit ? help : undefined}
      />
      {/* the hint row has content only mid-change (D112): the card ends under the bench otherwise;
          the live region itself stays mounted so the hint is announced */}
      {canEdit && (
        <div className={`taphint${hint ? ' on' : ''}${hint || hintExtra ? '' : ' empty'}`} aria-live="polite">
          {hint && <span>{hint}</span>}
          {hintExtra ??
            (selected?.kind === 'field' && onOpenSpot && (
              <Button size="sm" variant="gray" onClick={onOpenSpot}>
                Open the spot
              </Button>
            ))}
        </div>
      )}
    </article>
  );
}
