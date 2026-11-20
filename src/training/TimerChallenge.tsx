import { useEffect, useState } from 'react';
import { useWakeLock } from '@/clock/useWakeLock';
import { Button } from '@/components/Button';
import { clockText, MAX_REPS, READY_SECONDS } from './challenge';
import { beep, buzzer, unlockSound } from './sounds';
import { useHoldRepeat } from './useHoldRepeat';

export interface TimerChallengeProps {
  /** The countdown's length. */
  seconds: number;
  /** A score is being saved. */
  busy: boolean;
  onRecord: (reps: number) => void;
}

function RepButton({ label, sign, onStep }: { label: string; sign: '+' | '−'; onStep: () => void }) {
  const hold = useHoldRepeat(onStep);
  return (
    <button type="button" className={sign === '+' ? 'chstep plus' : 'chstep'} aria-label={label} {...hold}>
      {sign}
    </button>
  );
}

/**
 * A timer challenge (D140): Start, then 3, 2, 1 on the card with a beep each, then the countdown
 * with large plus and minus to count reps (hold to repeat). At zero a buzzer sounds and the card
 * says "TIME!", for a phone on silent; plus and minus keep working so the score can be corrected
 * or entered late, and Record Score saves it.
 *
 * Time is read from the clock on every tick, never counted, so it is right after the browser was
 * in the background. The screen stays awake from Start until the score is recorded. Nothing is
 * kept anywhere but here: leaving the page abandons the attempt.
 */
export function TimerChallenge({ seconds, busy, onRecord }: TimerChallengeProps) {
  // when the countdown itself begins: three seconds after Start
  const [startAt, setStartAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [reps, setReps] = useState(0);

  const elapsed = startAt === null ? 0 : now - startAt;
  const phase =
    startAt === null ? 'idle' : elapsed < 0 ? 'ready' : elapsed < seconds * 1000 ? 'running' : 'over';
  const ticking = phase === 'ready' || phase === 'running';
  const count = phase === 'ready' ? Math.ceil(-elapsed / 1000) : 0;

  useEffect(() => {
    if (!ticking) return;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 100);
    // back from the background: catch up at once
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [ticking]);
  useEffect(() => {
    if (count > 0) beep();
  }, [count]);
  useEffect(() => {
    if (phase === 'over') buzzer();
  }, [phase]);
  useWakeLock(phase !== 'idle');

  const start = () => {
    unlockSound();
    const t = Date.now();
    setNow(t);
    setReps(0);
    setStartAt(t + READY_SECONDS * 1000);
  };
  const reset = () => {
    setStartAt(null);
    setReps(0);
  };
  const step = (by: number) => setReps((r) => Math.min(MAX_REPS, Math.max(0, r + by)));

  if (phase === 'idle') {
    return (
      <div className="challenge">
        <p className="chclock idle" role="timer" aria-label="Time left">
          {clockText(seconds * 1000)}
        </p>
        <Button className="chgo" onClick={start}>
          Start
        </Button>
      </div>
    );
  }
  if (phase === 'ready') {
    return (
      <div className="challenge">
        <p className="chready">Get ready</p>
        <p className="chcount" role="status" aria-live="assertive">
          {count}
        </p>
        <button type="button" className="linkbtn chreset" onClick={reset}>
          Cancel
        </button>
      </div>
    );
  }
  return (
    <div className={phase === 'over' ? 'challenge over' : 'challenge'}>
      {phase === 'over' ? (
        <p className="chtime" role="alert">
          TIME!
        </p>
      ) : (
        <p className="chclock" role="timer" aria-label="Time left">
          {clockText(seconds * 1000 - elapsed)}
        </p>
      )}
      <div className="chreps" role="group" aria-label="Reps">
        <RepButton label="One fewer" sign="−" onStep={() => step(-1)} />
        <output className="chscore" aria-label="Reps counted" aria-live="off">
          {reps}
        </output>
        <RepButton label="One more" sign="+" onStep={() => step(1)} />
      </div>
      {phase === 'over' && (
        <Button className="chgo" disabled={busy} onClick={() => onRecord(reps)}>
          Record Score
        </Button>
      )}
      <button type="button" className="linkbtn chreset" disabled={busy} onClick={reset}>
        Start over
      </button>
    </div>
  );
}
