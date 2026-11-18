import { type ReactNode, useId, useState } from 'react';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { HomeMeta } from '@/library/HomeTab';
import { levelLabel } from '@/library/types';
import { type Completion, type DrillMode, type HomeDrill, MODE_LABEL } from './api';

export interface DrillCardProps {
  drill: HomeDrill;
  open: boolean;
  onToggle: () => void;
  /** Today's completion of this drill, if there is one. */
  done: Completion | null;
  /** The child's last completion of this drill before today: the level and mode to start from. */
  last: Completion | null;
  busy: boolean;
  onDone: (level: number, mode: DrillMode) => void;
  /** Take back today's Done; absent when it is not this parent's to take back. */
  onUndo?: () => void;
  /** Extra controls for the picked level and mode (the Cone Dribbling stopwatch). */
  extra?: (level: number, mode: DrillMode) => ReactNode;
}

/**
 * One home drill (D128): name, type and minutes; opened, the With a Parent / On My Own toggle,
 * all three levels to pick from (none locked; the child picks), the coaching tips and Done.
 */
export function DrillCard({
  drill,
  open,
  onToggle,
  done,
  last,
  busy,
  onDone,
  onUndo,
  extra,
}: DrillCardProps) {
  const { home } = drill;
  const id = useId();
  const [mode, setMode] = useState<DrillMode>(done?.mode ?? last?.mode ?? 'parent');
  const [picked, setPicked] = useState<number>(done?.level ?? last?.level ?? 1);
  const level = Math.min(Math.max(picked, 1), Math.max(home.levels.length, 1));

  return (
    <li className={`drillcard${done ? ' done' : ''}${open ? ' open' : ''}`}>
      <button
        type="button"
        className="drillhead"
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={onToggle}
      >
        <span className="lbl">
          <b>{drill.title}</b>
          <HomeMeta home={home} />
        </span>
        {done && (
          <span className="donemark" role="img" aria-label="Done today">
            ✓
          </span>
        )}
        <span className="chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="drillbody" id={`${id}-body`}>
          {home.intro && <p className="drillintro">{home.intro}</p>}
          <Segmented<DrillMode>
            label={`${drill.title}: how`}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'parent', label: MODE_LABEL.parent },
              { value: 'solo', label: MODE_LABEL.solo },
            ]}
          />
          <p className="drillmode">{mode === 'parent' ? home.withParent : home.onMyOwn}</p>

          <div className="drilllevels" role="radiogroup" aria-label={`${drill.title}: level`}>
            {home.levels.map((l, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={level === i + 1}
                className={level === i + 1 ? 'on' : undefined}
                onClick={() => setPicked(i + 1)}
              >
                <b>{levelLabel(home, i)}</b>
                <span>{l.text}</span>
              </button>
            ))}
          </div>

          {home.notes.map((n) => (
            <p className="drillnote" key={n.title}>
              <b>{n.title}:</b> {n.text}
            </p>
          ))}
          {home.tips && (
            <p className="drillnote tips">
              <b>Coaching tips:</b> {home.tips}
            </p>
          )}

          {extra?.(level, mode)}

          {done ? (
            <p className="drilldone" role="status">
              <span>
                <b>Done today</b> · Level {done.level} · {MODE_LABEL[done.mode]}
              </span>
              {onUndo && (
                <button type="button" className="linkbtn" onClick={onUndo} disabled={busy}>
                  Undo
                </button>
              )}
            </p>
          ) : (
            <Button className="drillgo" disabled={busy} onClick={() => onDone(level, mode)}>
              Done
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
