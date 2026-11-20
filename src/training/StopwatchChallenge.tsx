import { useEffect, useState } from 'react';
import { useWakeLock } from '@/clock/useWakeLock';
import { Button } from '@/components/Button';
import { timeText, toHundredths } from './challenge';

export interface StopwatchChallengeProps {
  /** A score is being saved. */
  busy: boolean;
  onRecord: (seconds: number) => void;
}

/**
 * A stopwatch challenge (D140, Cone Dribbling): Start, Pause and Resume, Stop, Reset, then Record
 * Score. It counts up, to a hundredth of a second, and what it shows once stopped is what is
 * recorded.
 *
 * Time is the clock's: the time banked before a pause plus the clock time since the last start,
 * so it is right after the browser was in the background. The screen stays awake from Start until
 * the score is recorded or the attempt is reset. Leaving the page abandons the attempt.
 */
export function StopwatchChallenge({ busy, onRecord }: StopwatchChallengeProps) {
  /** Milliseconds banked before the last pause. */
  const [banked, setBanked] = useState(0);
  /** When the clock was last started; null while it is not running. */
  const [since, setSince] = useState<number | null>(null);
  const [stopped, setStopped] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const running = since !== null;
  const elapsed = banked + (since === null ? 0 : Math.max(0, now - since));
  const phase = running ? 'running' : stopped ? 'stopped' : banked > 0 ? 'paused' : 'idle';

  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 50);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [running]);
  useWakeLock(phase !== 'idle');

  const start = () => {
    const t = Date.now();
    setNow(t);
    setSince(t);
  };
  /** Bank the running time and stop the clock; returns the total. */
  const hold = (): number => {
    const total = banked + (since === null ? 0 : Math.max(0, Date.now() - since));
    setBanked(total);
    setSince(null);
    return total;
  };
  const stop = () => {
    // a tap too quick to be a run is not offered for recording
    if (toHundredths(hold()) > 0) setStopped(true);
    else setBanked(0);
  };
  const reset = () => {
    setBanked(0);
    setSince(null);
    setStopped(false);
  };

  return (
    <div className={stopped ? 'challenge over' : 'challenge'}>
      <p className="chclock" role="timer" aria-label="Stopwatch">
        {timeText(toHundredths(elapsed))}
      </p>
      {phase === 'idle' && (
        <Button className="chgo" onClick={start}>
          Start
        </Button>
      )}
      {phase === 'running' && (
        <div className="chrow">
          <Button variant="gray" onClick={() => hold()}>
            Pause
          </Button>
          <Button className="stop" onClick={stop}>
            Stop
          </Button>
        </div>
      )}
      {phase === 'paused' && (
        <div className="chrow">
          <Button onClick={start}>Resume</Button>
          <Button className="stop" onClick={stop}>
            Stop
          </Button>
        </div>
      )}
      {phase === 'stopped' && (
        <Button className="chgo" disabled={busy} onClick={() => onRecord(toHundredths(elapsed))}>
          Record Score
        </Button>
      )}
      {phase !== 'idle' && (
        <button type="button" className="linkbtn chreset" disabled={busy} onClick={reset}>
          Reset
        </button>
      )}
    </div>
  );
}
