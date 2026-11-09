import { useState } from 'react';
import { Button } from '@/components/Button';
import { Field, Select } from '@/components/Form';
import { FormSheet } from '@/components/Sheet';
import { type ScoreEventKind, type SportDefinition } from '@/sports/types';
import { type Player } from '@/teams/api';
import { type NewScoreEvent, type ScoreEvent } from './api';
import { type NameLookup } from './names';
import { PeriodPicker } from './PeriodPicker';
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
}: ScorePanelProps) {
  const lastOurs = [...events].reverse().find((e) => e.side === 'us');
  const [period, setPeriod] = useState(initialPeriod);
  const [scorer, setScorer] = useState(lastOurs?.scorer_player_id ?? '');
  const [assist, setAssist] = useState('');
  const [busy, setBusy] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  // Re-seed the pickers each time the sheet opens (state derived from the previous render).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPeriod(initialPeriod);
      setScorer(lastOurs?.scorer_player_id ?? '');
      setAssist('');
      setBusy(false);
    }
  }

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
  const title =
    panel === 'run'
      ? `Run · vs ${opponent}`
      : panel === 'points'
        ? `Score · vs ${opponent}`
        : `Goal · vs ${opponent}`;
  const scorerLabel = panel === 'run' ? 'Who crossed the plate' : 'Scorer';

  const playerOptions = players.map((p) => (
    <option key={p.id} value={p.id}>
      {p.jersey_number ? `#${p.jersey_number} ` : ''}
      {names.name(p.id)}
    </option>
  ));

  return (
    <FormSheet open={open} onClose={onClose} title={title}>
      <PeriodPicker S={S} count={periodCount} value={period} onChange={setPeriod} />
      <Field label={scorerLabel}>
        <Select value={scorer} onChange={(e) => setScorer(e.target.value)}>
          <option value="">Unknown / not recorded</option>
          {playerOptions}
        </Select>
      </Field>
      {S.scoring.assists && (
        <Field label="Assist">
          <Select value={assist} onChange={(e) => setAssist(e.target.value)}>
            <option value="">No assist</option>
            {playerOptions}
          </Select>
        </Field>
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
