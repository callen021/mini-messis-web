import { type ReactNode, useState } from 'react';
import { Button } from '@/components/Button';
import { FormSheet } from '@/components/Sheet';
import { type ScoreEventKind, type SportDefinition, type StatType } from '@/sports/types';
import { type Player } from '@/teams/api';
import { type NewScoreEvent, type NewStatEvent, type ScoreEvent } from './api';
import { type NameLookup } from './names';
import { PeriodPicker } from './PeriodPicker';
import { PlayerPicker } from './PlayerPicker';
import { describeEvent, scoreTapAllowed } from './scoring';

export interface ScorePanelProps {
  open: boolean;
  onClose: () => void;
  S: SportDefinition;
  opponent: string;
  periodCount: number;
  /** Period preselected when the panel opens (the card tapped, or the last period). */
  initialPeriod: number;
  /** Active roster, for the scorer/assist pickers. */
  players: readonly Player[];
  names: NameLookup;
  /** The game's log so far, oldest first (for "Undo last" and the default scorer). */
  events: readonly ScoreEvent[];
  onAdd: (ev: NewScoreEvent) => void;
  onUndo: (ev: ScoreEvent) => void;
  /** Clock mode (D68): the period comes from the game clock, so the picker is hidden. */
  lockPeriod?: boolean;
  /** Ids on the field right now, in field order (D96): their buttons come first. */
  onField?: readonly string[];
  /** Ids on the bench, in bench order; everyone not on the field when omitted. */
  bench?: readonly string[];
  /** "H1 · 12:34": the period and clock time the goal is stamped with (a ticking leaf). */
  stamp?: ReactNode;
  /** The stats the team tracks (D118): a row of REB / AST / STL / FOUL for the picked player. */
  trackedStats?: readonly StatType[];
  onAddStat?: (ev: NewStatEvent) => void;
}

/**
 * The score sheet: pick the period, who scored (defaults to the last scorer), and post the event.
 * Layout follows the sport: goal / opponent goal (soccer, lacrosse); +1 +2 +3 per side (basketball);
 * run / opponent run with the inning (baseball).
 */
export function ScorePanel({
  open,
  onClose,
  S,
  opponent,
  periodCount,
  initialPeriod,
  players,
  names,
  events,
  onAdd,
  onUndo,
  lockPeriod = false,
  onField = [],
  bench,
  stamp,
  trackedStats = [],
  onAddStat,
}: ScorePanelProps) {
  const lastOurs = [...events].reverse().find((e) => e.side === 'us');
  const [period, setPeriod] = useState(initialPeriod);
  const [scorer, setScorer] = useState(lastOurs?.scorer_player_id ?? '');
  const [assist, setAssist] = useState('');
  const [showBench, setShowBench] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  // Re-seed the pickers each time the sheet opens (state derived from the previous render).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPeriod(initialPeriod);
      setScorer(lastOurs?.scorer_player_id ?? '');
      setAssist('');
      setShowBench(false);
      setBusy(false);
    }
  }

  const byId = new Map(players.map((p) => [p.id, p]));
  const onSet = new Set(onField);
  const onFieldPlayers = onField.flatMap((id) => {
    const p = byId.get(id);
    return p ? [p] : [];
  });
  const benchPlayers = bench
    ? bench.flatMap((id) => {
        const p = byId.get(id);
        return p && !onSet.has(id) ? [p] : [];
      })
    : players.filter((p) => !onSet.has(p.id));
  const canToggleBench = onFieldPlayers.length > 0 && benchPlayers.length > 0;
  const pickScorer = (id: string) => {
    setScorer(id);
    if (id && id === assist) setAssist(''); // the same player cannot be both
  };

  const post = (side: 'us' | 'them', kind: ScoreEventKind) => {
    if (busy || !scoreTapAllowed()) return;
    setBusy(true);
    onAdd({
      side,
      period_index: Math.min(period, Math.max(0, periodCount - 1)),
      event_type: kind.type,
      points: kind.points,
      scorer_player_id: side === 'us' ? scorer || null : null,
      assist_player_id: side === 'us' && S.scoring.assists ? assist || null : null,
    });
    onClose();
  };

  const kinds = S.scoring.events;
  const first = kinds[0];
  const last = events[events.length - 1];
  const panel = S.scoring.panel;
  const statKinds = onAddStat ? (S.scoring.stats ?? []).filter((k) => trackedStats.includes(k.type)) : [];
  const postStat = (type: StatType) => {
    if (busy || !scorer || !onAddStat || !scoreTapAllowed()) return;
    setBusy(true);
    onAddStat({
      player_id: scorer,
      period_index: Math.min(period, Math.max(0, periodCount - 1)),
      stat_type: type,
    });
    onClose();
  };
  const title =
    panel === 'run'
      ? `Run · vs ${opponent}`
      : panel === 'points'
        ? `Score · vs ${opponent}`
        : `Goal · vs ${opponent}`;
  const scorerLabel = panel === 'run' ? 'Who crossed the plate' : 'Scorer';

  return (
    <FormSheet open={open} onClose={onClose} title={title}>
      {stamp && <p className="stamp">{stamp}</p>}
      {!lockPeriod && <PeriodPicker S={S} count={periodCount} value={period} onChange={setPeriod} />}
      <PlayerPicker
        label={scorerLabel}
        value={scorer}
        onChange={pickScorer}
        onField={onFieldPlayers}
        bench={benchPlayers}
        showBench={showBench}
        noneLabel="Unknown"
        names={names}
      />
      {S.scoring.assists && (
        <PlayerPicker
          label="Assist"
          value={assist}
          onChange={setAssist}
          onField={onFieldPlayers}
          bench={benchPlayers}
          showBench={showBench}
          noneLabel="No assist"
          excludeId={scorer || undefined}
          names={names}
        />
      )}
      {canToggleBench && (
        <button
          type="button"
          className="linkbtn benchtoggle"
          aria-expanded={showBench}
          onClick={() => setShowBench((v) => !v)}
        >
          {showBench ? 'Hide bench players' : `Show bench players (${benchPlayers.length})`}
        </button>
      )}
      {panel === 'points' ? (
        <div className="ptpanel" role="group" aria-label="Add points">
          <div className="ptrow">
            <span className="ptside">US</span>
            {kinds.map((k) => (
              <Button
                key={k.type}
                disabled={busy}
                onClick={() => post('us', k)}
                aria-label={`Our ${k.noun}, ${k.label}`}
              >
                {k.label}
              </Button>
            ))}
          </div>
          <div className="ptrow">
            <span className="ptside">THEM</span>
            {kinds.map((k) => (
              <Button
                key={k.type}
                variant="gray"
                disabled={busy}
                onClick={() => post('them', k)}
                aria-label={`${opponent} ${k.noun}, ${k.label}`}
              >
                {k.label}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        first && (
          <>
            <Button disabled={busy} onClick={() => post('us', first)}>
              Add our {first.noun}
            </Button>
            <Button variant="gray" disabled={busy} onClick={() => post('them', first)}>
              Add opponent {first.noun}
            </Button>
          </>
        )
      )}
      {statKinds.length > 0 && (
        <div className="ptpanel" role="group" aria-label="Add a stat">
          <div className="ptrow stats">
            <span className="ptside">{scorer ? 'STAT' : 'PICK'}</span>
            {statKinds.map((k) => (
              <Button
                key={k.type}
                variant="tinted"
                disabled={busy || !scorer}
                onClick={() => postStat(k.type)}
                aria-label={`${k.noun} for ${scorer ? names.name(scorer) || 'the player' : 'the picked player'}`}
              >
                {k.label}
              </Button>
            ))}
          </div>
        </div>
      )}
      {last && (
        <Button
          variant="gray"
          className="undo"
          onClick={() => {
            onUndo(last);
            onClose();
          }}
        >
          Undo last · {describeEvent(S, periodCount, opponent, last, names)}
        </Button>
      )}
    </FormSheet>
  );
}
