import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Stopwatch } from '../Stopwatch';
import { bestOf, formatSeconds, judge, type TimedRun, toTenths } from '../times';

const run = (id: string, seconds: number, run_on = '2026-03-01'): TimedRun => ({
  id,
  level: 1,
  seconds,
  run_on,
  created_at: `${run_on}T10:00:00Z`,
});

describe('times', () => {
  it('measures and shows tenths of a second', () => {
    expect(toTenths(8449)).toBe(8.4);
    expect(toTenths(-5)).toBe(0);
    expect(formatSeconds(0)).toBe('0.0');
    expect(formatSeconds(8.4)).toBe('8.4');
    expect(formatSeconds(59.9)).toBe('59.9');
    expect(formatSeconds(62.3)).toBe('1:02.3');
  });
  it('the best is the lowest; a new time beats it only by being under it', () => {
    const runs = [run('a', 12.4), run('b', 11.8), run('c', 13)];
    expect(bestOf(runs)).toBe(11.8);
    expect(bestOf([])).toBeNull();
    expect(judge(11.2, runs)).toEqual({ previous: 11.8, beat: true, diff: -0.6 });
    expect(judge(12.1, runs)).toEqual({ previous: 11.8, beat: false, diff: 0.3 });
    expect(judge(11.8, runs)).toEqual({ previous: 11.8, beat: false, diff: 0 });
    expect(judge(20, [])).toEqual({ previous: null, beat: true, diff: null });
  });
});

describe('Stopwatch', () => {
  let now = 0;
  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const timeRun = async (user: ReturnType<typeof userEvent.setup>, ms: number) => {
    await user.click(screen.getByRole('button', { name: 'Start' }));
    now += ms;
    await user.click(screen.getByRole('button', { name: 'Stop' }));
  };

  it('times a run, asks “Clean run?”, and saves it as a new personal best', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<Stopwatch level={1} runs={[run('a', 12.4), run('b', 11.8)]} saving={false} onSave={onSave} />);
    expect(screen.getByText('11.8 s', { selector: 'b' })).toBeInTheDocument(); // the best so far
    expect(screen.getByRole('timer')).toHaveTextContent('0.0');
    await timeRun(user, 11_260);
    expect(screen.getByRole('timer')).toHaveTextContent('11.2');
    expect(screen.getByRole('group', { name: 'Clean run?' })).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(11.2);
    expect(await screen.findByText('New personal best!')).toBeInTheDocument();
    expect(screen.getByText(/0\.6 s faster than 11\.8 s/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go again' })).toBeInTheDocument();
  });

  it('says when the best still stands', async () => {
    const user = userEvent.setup();
    render(<Stopwatch level={2} runs={[run('a', 9.5)]} saving={false} onSave={() => Promise.resolve()} />);
    await timeRun(user, 10_000);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Best is still 9\.5 s \(0\.5 s off\)/)).toBeInTheDocument();
  });

  it('Discard saves nothing and goes back to Start', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Stopwatch level={1} runs={[]} saving={false} onSave={onSave} />);
    expect(screen.getByText('no time yet')).toBeInTheDocument();
    await timeRun(user, 9_000);
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('0.0');
  });

  it('keeps the time on screen when saving fails', async () => {
    const user = userEvent.setup();
    render(<Stopwatch level={1} runs={[]} saving={false} onSave={() => Promise.reject(new Error('x'))} />);
    await timeRun(user, 9_000);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('9.0');
  });

  it('lists the last five runs, newest first, with the best marked', () => {
    const runs = [14, 13.5, 12.9, 13.1, 12.2, 12.6].map((s, i) => run(`r${i}`, s, `2026-03-0${i + 1}`));
    render(<Stopwatch level={1} runs={runs} saving={false} onSave={() => Promise.resolve()} />);
    const rows = within(screen.getByRole('list', { name: 'Level 1 recent runs' })).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent('12.6 s');
    expect(rows[1]).toHaveTextContent('12.2 s PB');
    expect(rows[4]).toHaveTextContent('13.5 s');
  });
});
