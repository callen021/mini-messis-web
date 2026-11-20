import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clockText, scoreText, targetLine, timeText, toHundredths } from '../challenge';
import { StopwatchChallenge } from '../StopwatchChallenge';
import { TimerChallenge } from '../TimerChallenge';
import { formatSeconds, toTenths } from '../times';

const fx = vi.hoisted(() => ({ beep: vi.fn(), buzzer: vi.fn(), unlock: vi.fn(), wake: vi.fn() }));
vi.mock('../sounds', () => ({ beep: fx.beep, buzzer: fx.buzzer, unlockSound: fx.unlock }));
vi.mock('@/clock/useWakeLock', () => ({ useWakeLock: (on: boolean) => fx.wake(on) }));

const START = new Date('2026-03-01T10:00:00Z');
/** Let the clock run: timers fire as they would. */
const pass = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
/** The phone was in the background: the clock moved and nothing ticked, then the page is shown again. */
const background = (ms: number) =>
  act(() => {
    vi.setSystemTime(Date.now() + ms);
    document.dispatchEvent(new Event('visibilitychange'));
  });
/** A tap as a finger makes it: down, up, then the click the browser adds. */
const tap = (el: HTMLElement) => {
  fireEvent.pointerDown(el);
  fireEvent.pointerUp(el);
  fireEvent.click(el);
};
const button = (name: string) => screen.getByRole('button', { name });
const plus = () => button('One more');
const minus = () => button('One fewer');
const reps = () => screen.getByRole('status', { name: 'Reps counted' });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  for (const f of Object.values(fx)) f.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('what the challenge shows', () => {
  it('a countdown shows a started second until it is over', () => {
    expect(clockText(60_000)).toBe('1:00');
    expect(clockText(59_999)).toBe('1:00');
    expect(clockText(59_000)).toBe('0:59');
    expect(clockText(1)).toBe('0:01');
    expect(clockText(0)).toBe('0:00');
    expect(clockText(-500)).toBe('0:00');
  });
  it('a course time is kept to a hundredth', () => {
    expect(toHundredths(8429)).toBe(8.42);
    expect(toHundredths(-5)).toBe(0);
    expect(timeText(0)).toBe('0.00');
    expect(timeText(8.4)).toBe('8.40');
    expect(timeText(62.3)).toBe('1:02.30');
    expect(scoreText({ reps: 42, seconds: null })).toBe('42');
    expect(scoreText({ reps: null, seconds: 8.42 })).toBe('8.42 s');
  });
  it('the target line says what unlocks the next level, and nothing at the top one', () => {
    expect(targetLine({ mode: 'timer', seconds: 60, target: 40 }, 1, 3)).toBe(
      'Target: 40 or more unlocks Level 2',
    );
    expect(targetLine({ mode: 'stopwatch', seconds: 60, target: 10 }, 2, 3)).toBe(
      'Target: 10.0 s or less unlocks Level 3',
    );
    expect(targetLine({ mode: 'timer', seconds: 60, target: null }, 3, 3)).toBeNull();
    expect(targetLine({ mode: 'timer', seconds: 60, target: 40 }, 3, 3)).toBeNull();
  });
  it('the skill-test stopwatch still measures tenths (D137)', () => {
    expect(toTenths(8449)).toBe(8.4);
    expect(formatSeconds(62.3)).toBe('1:02.3');
  });
});

describe('a timer challenge (D140)', () => {
  const record = vi.fn();
  const show = (busy = false) => render(<TimerChallenge seconds={60} busy={busy} onRecord={record} />);
  /** Start and wait out the 3, 2, 1. */
  const begin = () => {
    fireEvent.click(button('Start'));
    pass(3000);
  };
  beforeEach(() => {
    record.mockReset();
  });

  it('waits at 1:00 with only Start', () => {
    show();
    expect(screen.getByRole('timer')).toHaveTextContent('1:00');
    expect(screen.queryByRole('button', { name: 'One more' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Record Score' })).toBeNull();
    expect(fx.wake).toHaveBeenLastCalledWith(false);
  });

  it('Start shows 3, 2, 1 on the card with a beep on each, then the countdown runs', () => {
    show();
    fireEvent.click(button('Start'));
    expect(fx.unlock).toHaveBeenCalled(); // sound can only start from a tap
    expect(screen.getByRole('status')).toHaveTextContent('3');
    expect(fx.beep).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'One more' })).toBeNull();
    pass(1000);
    expect(screen.getByRole('status')).toHaveTextContent('2');
    expect(fx.beep).toHaveBeenCalledTimes(2);
    pass(1000);
    expect(screen.getByRole('status')).toHaveTextContent('1');
    expect(fx.beep).toHaveBeenCalledTimes(3);
    pass(1000);
    expect(screen.getByRole('timer')).toHaveTextContent('1:00');
    expect(fx.beep).toHaveBeenCalledTimes(3);
    expect(fx.buzzer).not.toHaveBeenCalled();
    expect(fx.wake).toHaveBeenLastCalledWith(true); // the screen stays awake during an attempt
  });

  it('plus and minus count reps while the clock runs down, never below zero', () => {
    show();
    begin();
    tap(minus());
    expect(reps()).toHaveTextContent('0');
    tap(plus());
    tap(plus());
    tap(plus());
    tap(minus());
    expect(reps()).toHaveTextContent('2');
    pass(30_000);
    expect(screen.getByRole('timer')).toHaveTextContent('0:30');
    expect(reps()).toHaveTextContent('2');
    expect(screen.queryByRole('button', { name: 'Record Score' })).toBeNull(); // not before zero
  });

  it('press and hold repeats, and stops on release', () => {
    show();
    begin();
    fireEvent.pointerDown(plus());
    expect(reps()).toHaveTextContent('1'); // at once
    pass(390);
    expect(reps()).toHaveTextContent('1'); // a short press is one
    pass(470); // repeats at 490, 580, 670, 760 and 850 ms
    expect(reps()).toHaveTextContent('6');
    fireEvent.pointerUp(plus());
    fireEvent.click(plus()); // the click that ends the press adds nothing
    pass(1000);
    expect(reps()).toHaveTextContent('6');
  });
  it('a keyboard press counts one', () => {
    show();
    begin();
    fireEvent.click(plus());
    fireEvent.click(plus());
    expect(reps()).toHaveTextContent('2');
  });

  it('at zero the buzzer sounds once and the card says TIME!', () => {
    show();
    begin();
    tap(plus());
    pass(59_900);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fx.buzzer).not.toHaveBeenCalled();
    pass(100);
    expect(screen.getByRole('alert')).toHaveTextContent('TIME!');
    expect(screen.queryByRole('timer')).toBeNull();
    expect(fx.buzzer).toHaveBeenCalledTimes(1);
    pass(5000);
    expect(fx.buzzer).toHaveBeenCalledTimes(1);
    expect(fx.wake).toHaveBeenLastCalledWith(true); // until the score is recorded
  });

  it('plus and minus keep working after the buzzer, and Record Score saves what is shown', () => {
    show();
    begin();
    tap(plus());
    pass(60_000);
    // corrected, and entered late
    tap(plus());
    tap(plus());
    tap(plus());
    tap(minus());
    expect(reps()).toHaveTextContent('3');
    fireEvent.click(button('Record Score'));
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(3);
  });
  it('a score of zero can be recorded', () => {
    show();
    begin();
    pass(60_000);
    fireEvent.click(button('Record Score'));
    expect(record).toHaveBeenCalledWith(0);
  });
  it('Record Score waits while a score is being saved', () => {
    show(true);
    begin();
    pass(60_000);
    expect(button('Record Score')).toBeDisabled();
  });

  it('reads the clock, so it is right after the browser was in the background', () => {
    show();
    begin();
    tap(plus());
    background(20_000);
    expect(screen.getByRole('timer')).toHaveTextContent('0:40');
    // back after the end: TIME! is on the screen and the count is still there
    background(70_000);
    expect(screen.getByRole('alert')).toHaveTextContent('TIME!');
    expect(reps()).toHaveTextContent('1');
    expect(fx.buzzer).toHaveBeenCalledTimes(1);
  });

  it('Start over drops the attempt; leaving the page drops it too, and nothing is saved', () => {
    const view = show();
    begin();
    tap(plus());
    fireEvent.click(button('Start over'));
    expect(screen.getByRole('timer')).toHaveTextContent('1:00');
    expect(fx.wake).toHaveBeenLastCalledWith(false);
    begin();
    tap(plus());
    view.unmount();
    pass(120_000);
    expect(record).not.toHaveBeenCalled();
    show(); // coming back is a new attempt
    expect(button('Start')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'One more' })).toBeNull();
  });
  it('the 3, 2, 1 can be cancelled', () => {
    show();
    fireEvent.click(button('Start'));
    pass(1500);
    fireEvent.click(button('Cancel'));
    pass(5000);
    expect(button('Start')).toBeInTheDocument();
    expect(fx.buzzer).not.toHaveBeenCalled();
  });
});

describe('a stopwatch challenge (D140)', () => {
  const record = vi.fn();
  const show = () => render(<StopwatchChallenge busy={false} onRecord={record} />);
  const clock = () => screen.getByRole('timer', { name: 'Stopwatch' });
  beforeEach(() => {
    record.mockReset();
  });

  it('counts up from Start, to a hundredth', () => {
    show();
    expect(clock()).toHaveTextContent('0.00');
    expect(fx.wake).toHaveBeenLastCalledWith(false);
    fireEvent.click(button('Start'));
    pass(3250);
    expect(clock()).toHaveTextContent('3.25');
    expect(fx.wake).toHaveBeenLastCalledWith(true);
    pass(60_000); // it does not stop at a minute
    expect(clock()).toHaveTextContent('1:03.25');
  });

  it('Pause holds the time, Resume goes on from it, Stop then Record Score saves it', () => {
    show();
    fireEvent.click(button('Start'));
    pass(3250);
    fireEvent.click(button('Pause'));
    pass(5000);
    expect(clock()).toHaveTextContent('3.25'); // paused time does not count
    expect(screen.queryByRole('button', { name: 'Record Score' })).toBeNull();
    fireEvent.click(button('Resume'));
    pass(1000);
    expect(clock()).toHaveTextContent('4.25');
    fireEvent.click(button('Pause'));
    fireEvent.click(button('Resume'));
    pass(500);
    fireEvent.click(button('Stop'));
    pass(5000);
    expect(clock()).toHaveTextContent('4.75');
    fireEvent.click(button('Record Score'));
    expect(record).toHaveBeenCalledWith(4.75);
  });

  it('Stop works from a pause as well', () => {
    show();
    fireEvent.click(button('Start'));
    pass(2000);
    fireEvent.click(button('Pause'));
    fireEvent.click(button('Stop'));
    fireEvent.click(button('Record Score'));
    expect(record).toHaveBeenCalledWith(2);
  });

  it('Reset clears the attempt and saves nothing', () => {
    show();
    fireEvent.click(button('Start'));
    pass(2000);
    fireEvent.click(button('Stop'));
    fireEvent.click(button('Reset'));
    expect(clock()).toHaveTextContent('0.00');
    expect(button('Start')).toBeInTheDocument();
    expect(record).not.toHaveBeenCalled();
    expect(fx.wake).toHaveBeenLastCalledWith(false);
  });

  it('reads the clock, so it is right after the browser was in the background', () => {
    show();
    fireEvent.click(button('Start'));
    pass(1000);
    background(9000);
    expect(clock()).toHaveTextContent('10.00');
    fireEvent.click(button('Stop'));
    fireEvent.click(button('Record Score'));
    expect(record).toHaveBeenCalledWith(10);
  });

  it('leaving the page mid-run saves nothing', () => {
    const view = show();
    fireEvent.click(button('Start'));
    pass(2000);
    view.unmount();
    pass(10_000);
    expect(record).not.toHaveBeenCalled();
    show();
    expect(clock()).toHaveTextContent('0.00');
  });
});
