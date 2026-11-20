import { type ReactNode, useId, useState } from 'react';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { libraryImageUrl } from '@/library/api';
import { type HomeLevel, levelLabel } from '@/library/types';
import {
  type Completion,
  DONES_PER_LEVEL,
  type DrillLevel,
  type DrillMode,
  type HomeDrill,
  MODE_LABEL,
} from './api';

export interface DrillCardProps {
  drill: HomeDrill;
  /** Today's drill is always open and has no header to tap; the others open one at a time. */
  pinned?: boolean;
  open: boolean;
  onToggle?: () => void;
  /** Where the child stands on this drill. */
  level: DrillLevel;
  /** Today's completion of this drill, if there is one. */
  done: Completion | null;
  busy: boolean;
  onDone: (level: number, mode: DrillMode) => void;
  /** Take back today's Done; absent when it is not this parent's to take back. */
  onUndo?: () => void;
  /** A parent picks another level under "More". */
  onSetLevel: (level: number) => void;
  /** Extra controls for the level and mode (the Cone Dribbling stopwatch). */
  extra?: (level: number, mode: DrillMode) => ReactNode;
}

/** The level's picture, when one is set; nothing at all when it is not, or when it fails to load. */
function LevelImage({ level }: { level: HomeLevel }) {
  const [failed, setFailed] = useState(false);
  if (!level.image || failed) return null;
  return (
    <img
      className="drillimg"
      src={libraryImageUrl(level.image.path)}
      width={level.image.width ?? undefined}
      height={level.image.height ?? undefined}
      alt=""
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * One home drill (D138), kept to what a parent needs while watching their child: the instruction
 * for the child's level to read aloud, a picture when there is one, the parent's job, and Done.
 * No timer and nothing to follow on screen (Cone Dribbling keeps its stopwatch: it is the drill).
 * "More" holds the other levels, the coaching tips and the On My Own version.
 */
export function DrillCard({
  drill,
  pinned = false,
  open,
  onToggle,
  level,
  done,
  busy,
  onDone,
  onUndo,
  onSetLevel,
  extra,
}: DrillCardProps) {
  const { home } = drill;
  const id = useId();
  const [mode, setMode] = useState<DrillMode>(done?.mode ?? 'parent');
  const [more, setMore] = useState(false);
  const count = Math.max(home.levels.length, 1);
  const current = Math.min(Math.max(level.level, 1), count);
  // once it is Done today the card keeps showing what was done, even if that Done moved the child up
  const shown = Math.min(Math.max(done?.level ?? current, 1), count);
  const lvl = home.levels[shown - 1];
  const left = DONES_PER_LEVEL - level.donesAtLevel;

  const body = (
    <div className="drillbody" id={`${id}-body`}>
      {lvl && <LevelImage key={`${drill.id}:${shown}`} level={lvl} />}
      <p className="drillsay">{lvl?.text}</p>
      {mode === 'parent'
        ? lvl?.parentJob && (
            <p className="drilljob">
              <b>Your job:</b> {lvl.parentJob}
            </p>
          )
        : home.onMyOwn && (
            <p className="drilljob">
              <b>On my own:</b> {home.onMyOwn}
            </p>
          )}

      {extra?.(shown, mode)}

      {done ? (
        <p className="drilldone" role="status">
          <span>
            <b>Done today</b> · Level {done.level}
            {done.mode === 'solo' ? ` · ${MODE_LABEL.solo}` : ''}
          </span>
          {onUndo && (
            <button type="button" className="linkbtn" onClick={onUndo} disabled={busy}>
              Undo
            </button>
          )}
        </p>
      ) : (
        <Button className="drillgo" disabled={busy} onClick={() => onDone(shown, mode)}>
          Done
        </Button>
      )}

      <p className="drillmore">
        <button
          type="button"
          className="linkbtn"
          aria-expanded={more}
          aria-controls={`${id}-more`}
          onClick={() => setMore(!more)}
        >
          {more ? 'Less' : 'More'}
        </button>
      </p>
      {more && (
        <div className="drillextra" id={`${id}-more`}>
          <div className="drilllevels" role="radiogroup" aria-label={`${drill.title}: level`}>
            {home.levels.map((l, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={current === i + 1}
                className={current === i + 1 ? 'on' : undefined}
                disabled={busy}
                onClick={() => {
                  if (current !== i + 1) onSetLevel(i + 1);
                }}
              >
                <b>{levelLabel(home, i)}</b>
                <span>{l.text}</span>
              </button>
            ))}
          </div>
          <p className="drillnote">
            {current < count
              ? `Three Dones at a level move up to the next: ${left} to go at Level ${current}. Tap a level to change it.`
              : 'This is the top level. Tap a level to change it.'}
          </p>

          <Segmented<DrillMode>
            label={`${drill.title}: how`}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'parent', label: MODE_LABEL.parent },
              { value: 'solo', label: MODE_LABEL.solo },
            ]}
          />
          {home.onMyOwn && (
            <p className="drillnote">
              <b>{MODE_LABEL.solo}:</b> {home.onMyOwn}
            </p>
          )}

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
        </div>
      )}
    </div>
  );

  const label = (
    <span className="lbl">
      <b>{drill.title}</b>
      <span className="drilllevel">Level {shown}</span>
    </span>
  );
  const mark = done && (
    <span className="donemark" role="img" aria-label="Done today">
      ✓
    </span>
  );

  if (pinned) {
    return (
      <li className={`drillcard open pinned${done ? ' done' : ''}`}>
        <div className="drillhead">
          {label}
          {mark}
        </div>
        {body}
      </li>
    );
  }
  return (
    <li className={`drillcard${done ? ' done' : ''}${open ? ' open' : ''}`}>
      <button
        type="button"
        className="drillhead"
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={onToggle}
      >
        {label}
        {mark}
        <span className="chev" aria-hidden="true" />
      </button>
      {open && body}
    </li>
  );
}
