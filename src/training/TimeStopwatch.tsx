import { type ReactNode, useState } from 'react';
import { Button } from '@/components/Button';
import { formatSeconds } from './times';
import { useStopwatch } from './useStopwatch';

export interface TimeStopwatchProps {
  /** A line above the digits, e.g. who is being timed. */
  caption?: ReactNode;
  /** Told when the clock starts and when it stops, whatever the time. */
  onRunning?: (running: boolean) => void;
  /** The stopped time in seconds, to a tenth. Not called for a tap too quick to be a run. */
  onStop: (seconds: number) => void;
  /** Shown under the button once a time has been taken, e.g. "Next player". */
  after?: ReactNode;
}

/**
 * The stopwatch on a skill result sheet (D137): Start, then Stop, and the time goes to the Time
 * field. It saves nothing itself; starting again takes a new time that replaces the last one.
 * The clock is the Cone Dribbling stopwatch's (useStopwatch).
 */
export function TimeStopwatch({ caption, onRunning, onStop, after }: TimeStopwatchProps) {
  const sw = useStopwatch();
  const [last, setLast] = useState<number | null>(null);
  const shown = sw.running ? sw.seconds : (last ?? 0);
  return (
    <div className="stopwatch compact" role="group" aria-label="Stopwatch">
      {caption && <p className="swbest">{caption}</p>}
      <div className="swline">
        <p className="swtime" role="timer" aria-label="Stopwatch time">
          {formatSeconds(shown)}
        </p>
        {sw.running ? (
          <Button
            className="swbtn stop"
            onClick={() => {
              const seconds = sw.stop();
              onRunning?.(false);
              if (seconds <= 0) return;
              setLast(seconds);
              onStop(seconds);
            }}
          >
            Stop
          </Button>
        ) : (
          <Button
            className="swbtn"
            onClick={() => {
              onRunning?.(true);
              sw.start();
            }}
          >
            {last === null ? 'Start' : 'Start again'}
          </Button>
        )}
      </div>
      {!sw.running && last !== null && after}
    </div>
  );
}
