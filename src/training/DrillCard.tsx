import { useId, useState } from 'react';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { fmtDate } from '@/games/format';
import { libraryImageUrl } from '@/library/api';
import { DrillDiagram } from '@/library/DrillDiagram';
import { type HomeLevel, levelLabel } from '@/library/types';
import {
  type Attempt,
  type Best,
  type Completion,
  type DrillLevel,
  type DrillMode,
  type HomeDrill,
  MODE_LABEL,
  type Score,
} from './api';
import { scoreText, targetLine } from './challenge';
import { StopwatchChallenge } from './StopwatchChallenge';
import { TimerChallenge } from './TimerChallenge';

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
  /** The child's personal best at the level shown; null before the first score. */
  best: Best | null;
  /** The child's scores on this drill, newest first. */
  attempts: readonly Attempt[];
  busy: boolean;
  /** Record Score: saves the attempt and goes to the results page. */
  onRecord: (level: number, mode: DrillMode, score: Score) => void;
  /** Done without a score, for a level that has no challenge. */
  onDone: (level: number, mode: DrillMode) => void;
  /** A parent picks another level under "More". */
  onSetLevel: (level: number) => void;
}

const RECENT = 5;
const NO_PARAMS = [] as const;
const NO_OVERRIDES = {} as const;

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
 * One home drill (D138, D140): its group as a tag, the instruction for the child's level to read
 * aloud, a picture when there is one, the parent's job, and the level's timed challenge: a
 * countdown with a rep counter, or a stopwatch. Record Score saves the attempt; the day's first
 * is the drill Done. "More" holds the other levels, "Make it harder", On My Own, the course
 * diagram, the coaching tips and the recent scores.
 */
export function DrillCard({
  drill,
  pinned = false,
  open,
  onToggle,
  level,
  done,
  best,
  attempts,
  busy,
  onRecord,
  onDone,
  onSetLevel,
}: DrillCardProps) {
  const { home } = drill;
  const id = useId();
  const [mode, setMode] = useState<DrillMode>(done?.mode ?? 'parent');
  const [more, setMore] = useState(false);
  const count = Math.max(home.levels.length, 1);
  const current = Math.min(Math.max(level.level, 1), count);
  const lvl = home.levels[current - 1];
  const challenge = lvl?.challenge ?? null;
  const target = challenge && targetLine(challenge, current, count);
  const recent = attempts.filter((a) => a.level === current).slice(0, RECENT);

  const body = (
    <div className="drillbody" id={`${id}-body`}>
      {lvl && <LevelImage key={`${drill.id}:${current}`} level={lvl} />}
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

      {challenge && (
        <p className="drillgoal">
          <span>
            Level {current} best: <b>{best ? scoreText(best) : 'no score yet'}</b>
          </span>
          {target && <span>{target}</span>}
        </p>
      )}
      {/* another level or another way of doing it is another attempt: start clean */}
      {challenge?.mode === 'timer' && (
        <TimerChallenge
          key={`${current}:${mode}`}
          seconds={challenge.seconds}
          busy={busy}
          onRecord={(reps) => onRecord(current, mode, { reps })}
        />
      )}
      {challenge?.mode === 'stopwatch' && (
        <StopwatchChallenge
          key={`${current}:${mode}`}
          busy={busy}
          onRecord={(seconds) => onRecord(current, mode, { seconds })}
        />
      )}
      {!challenge && !done && (
        <Button className="drillgo" disabled={busy} onClick={() => onDone(current, mode)}>
          Done
        </Button>
      )}
      {done && (
        <p className="drilldone" role="status">
          <span>
            <b>Done today</b>
            {challenge ? ' · go again any time, every score is saved' : ''}
          </span>
        </p>
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
          {lvl?.harder && (
            <p className="drillnote">
              <b>Make it harder:</b> {lvl.harder}
            </p>
          )}
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
            {current < count && target
              ? `A score that meets the target unlocks Level ${current + 1}. Tap a level to change it.`
              : current < count
                ? 'Tap a level to change it.'
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

          {home.diagram && <DrillDiagram spec={home.diagram} params={NO_PARAMS} overrides={NO_OVERRIDES} />}
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

          {recent.length > 0 && (
            <ol className="drillscores" aria-label={`Level ${current} recent scores`}>
              {recent.map((a) => (
                <li key={a.id}>
                  <span>
                    {fmtDate(a.done_on)}
                    {a.old_course ? ' · five cones' : ''}
                  </span>
                  <span>{scoreText(a)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );

  const label = (
    <span className="lbl">
      <b>{drill.title}</b>
      {home.skill && <span className="drilltag">{home.skill}</span>}
      <span className="drilllevel">Level {current}</span>
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
