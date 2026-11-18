import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { fmtDate } from '@/games/format';
import { bestOf, formatSeconds, judge, type RunVerdict, type TimedRun, toTenths } from './times';

export interface StopwatchProps {
  level: number;
  /** The child's saved runs at this level, oldest first. */
  runs: readonly TimedRun[];
  saving: boolean;
  /** Save a clean run; resolves once it is stored. */
  onSave: (seconds: number) => Promise<void>;
}

type Phase =
  | { at: 'idle' }
  | { at: 'running'; since: number }
  | { at: 'stopped'; seconds: number }
  | { at: 'saved'; seconds: number; verdict: RunVerdict };

const HISTORY = 5;

/**
 * The Cone Dribbling stopwatch (D129): large digits to a tenth of a second, Start and Stop. After
 * Stop it asks "Clean run?": Save keeps the time, Discard drops it. It shows the best before the
 * run, whether the new time beat it, and the last few runs at this level.
 */
export function Stopwatch({ level, runs, saving, onSave }: StopwatchProps) {
  const [phase, setPhase] = useState<Phase>({ at: 'idle' });
  const [elapsed, setElapsed] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (phase.at !== 'running') return;
    const tick = () => {
      setElapsed(performance.now() - phase.since);
      frame.current = window.requestAnimationFrame(tick);
    };
    frame.current = window.requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, [phase]);

  const best = bestOf(runs);
  const shown = phase.at === 'running' ? toTenths(elapsed) : phase.at === 'idle' ? 0 : phase.seconds;

  const start = () => {
    setElapsed(0);
    setPhase({ at: 'running', since: performance.now() });
  };
  const stop = () => {
    if (phase.at !== 'running') return;
    const seconds = toTenths(performance.now() - phase.since);
    // a tap too quick to be a run is not offered for saving
    setPhase(seconds > 0 ? { at: 'stopped', seconds } : { at: 'idle' });
  };
  const save = () => {
    if (phase.at !== 'stopped') return;
    const { seconds } = phase;
    const verdict = judge(seconds, runs);
    void onSave(seconds).then(
      () => setPhase({ at: 'saved', seconds, verdict }),
      () => undefined, // the caller shows the error; the time stays on screen to try again
    );
  };

  const recent = [...runs].reverse().slice(0, HISTORY);

  return (
    <div className="stopwatch">
      <p className="swbest">
        Level {level} best: <b>{best === null ? 'no time yet' : `${formatSeconds(best)} s`}</b>
      </p>
      <p className="swtime" role="timer" aria-label="Stopwatch">
        {formatSeconds(shown)}
      </p>

      {phase.at === 'idle' && (
        <Button className="swbtn" onClick={start}>
          Start
        </Button>
      )}
      {phase.at === 'running' && (
        <Button className="swbtn stop" onClick={stop}>
          Stop
        </Button>
      )}
      {phase.at === 'stopped' && (
        <div className="swask" role="group" aria-label="Clean run?">
          <p>
            <b>Clean run?</b>
          </p>
          <div className="swchoice">
            <Button onClick={save} disabled={saving}>
              Save
            </Button>
            <Button variant="gray" onClick={() => setPhase({ at: 'idle' })} disabled={saving}>
              Discard
            </Button>
          </div>
        </div>
      )}
      {phase.at === 'saved' && (
        <>
          <p className={`swverdict${phase.verdict.beat ? ' beat' : ''}`} role="status">
            {phase.verdict.previous === null ? (
              <>
                <b>First time saved.</b> That is the one to beat.
              </>
            ) : phase.verdict.beat ? (
              <>
                <b>New personal best!</b> {formatSeconds(Math.abs(phase.verdict.diff ?? 0))} s faster than{' '}
                {formatSeconds(phase.verdict.previous)} s.
              </>
            ) : (
              <>
                <b>Saved.</b> Best is still {formatSeconds(phase.verdict.previous)} s
                {phase.verdict.diff ? ` (${formatSeconds(phase.verdict.diff)} s off)` : ' (a tie)'}.
              </>
            )}
          </p>
          <Button className="swbtn" variant="tinted" onClick={() => setPhase({ at: 'idle' })}>
            Go again
          </Button>
        </>
      )}

      {recent.length > 0 && (
        <ol className="swhistory" aria-label={`Level ${level} recent runs`}>
          {recent.map((r) => (
            <li key={r.id}>
              <span>{fmtDate(r.run_on)}</span>
              <span>
                {formatSeconds(r.seconds)} s{r.seconds === best && <b className="pb"> PB</b>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
