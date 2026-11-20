import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { parseContent } from '@/library/types';
import type * as Api from '../api';
import { type Completion, type DrillLevel, type HomeDrill } from '../api';
import { DailyDrills } from '../DailyDrills';
import { addDays, drillFor, drillForChild, FIRST_DRILL, ROTATION, rotationDay, teamToday } from '../rotation';

const SLUGS = [
  'toe-taps',
  'inside-inside-touches',
  'sole-rolls',
  'v-cuts',
  'l-drags',
  'cone-dribbling',
  'inside-outside-touches',
  'wall-passing-and-first-touch',
  'juggling',
  'first-touch-and-passing-with-a-parent',
];
const drill = (slug: string): HomeDrill => {
  const home = parseContent({
    home: {
      skill: 'Dribbling and Ball Mastery',
      type: 'repetition',
      minutes: 3,
      intro: `Intro of ${slug}.`,
      with_parent: `Together: ${slug}.`,
      on_my_own: `Alone: ${slug}.`,
      levels: [
        { text: 'Say one.', parent_job: 'Job one.' },
        { text: 'Say two.', parent_job: 'Job two.', image: 'home/pic-two.png' },
        { text: 'Say three.', parent_job: 'Job three.' },
      ],
      tips: 'Stay on the balls of your feet.',
      clip: 'Side view.',
      stopwatch: slug === 'cone-dribbling',
    },
  }).home;
  if (!home) throw new Error('no home section');
  return { id: `id-${slug}`, slug, title: `Drill ${slug}`, home };
};
const DRILLS = SLUGS.map(drill);

const api = vi.hoisted(() => ({
  completions: [] as unknown[],
  levels: new Map<string, unknown>(),
  markDone: vi.fn(),
  undoDone: vi.fn(),
  setLevel: vi.fn(),
  wake: vi.fn(),
}));
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof Api>('../api');
  return {
    ...actual,
    useHomeDrills: () => ({ data: DRILLS, isPending: false, isError: false }),
    useCompletions: () => ({ data: api.completions, isPending: false, isError: false }),
    useDrillLevels: () => ({ data: api.levels, isPending: false, isError: false }),
    useMarkDone: () => ({ mutate: api.markDone, isPending: false }),
    useUndoDone: () => ({ mutate: api.undoDone, isPending: false }),
    useSetDrillLevel: () => ({ mutate: api.setLevel, isPending: false }),
  };
});
vi.mock('../DrillStopwatch', () => ({
  DrillStopwatch: ({ level }: { level: number }) => <div role="timer">stopwatch at level {level}</div>,
}));
vi.mock('@/library/api', () => ({ libraryImageUrl: (path: string) => `https://img.test/${path}` }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('@/clock/useWakeLock', () => ({ useWakeLock: (on: boolean) => api.wake(on) }));

const TODAY = '2026-01-08'; // day 4 of the rotation: Inside-Inside Touches
const BEFORE = '2026-01-02';
const at = (level: number, donesAtLevel = 0, firstDoneOn: string | null = BEFORE): DrillLevel => ({
  level,
  donesAtLevel,
  firstDoneOn,
});
/** A child who has trained before: on the team's rotation. */
const seasoned = (over: Record<string, DrillLevel> = {}) =>
  new Map(SLUGS.map((s) => [`id-${s}`, over[s] ?? at(1, 0, s === 'toe-taps' ? BEFORE : null)]));
const done = (slug: string, o: Partial<Completion> = {}): Completion => ({
  id: `c-${slug}`,
  player_id: 'p1',
  item_id: `id-${slug}`,
  done_on: TODAY,
  level: 1,
  mode: 'parent',
  recorded_by: 'me',
  created_at: `${TODAY}T10:00:00Z`,
  ...o,
});
const show = () =>
  render(
    <ToastProvider>
      <DailyDrills playerId="p1" playerName="Sam" sport="soccer" today={TODAY} />
    </ToastProvider>,
  );
const todays = () => screen.getAllByRole('listitem')[0] as HTMLElement;

describe('one drill a day (D138)', () => {
  it('goes round all ten, one a day, the same for everyone on a date', () => {
    expect(ROTATION).toHaveLength(10);
    expect(new Set(ROTATION)).toEqual(new Set(SLUGS));
    expect(drillFor('2026-01-05')).toBe('toe-taps');
    expect(drillFor('2026-01-06')).toBe('cone-dribbling');
    expect(drillFor('2026-01-14')).toBe('l-drags');
    expect(drillFor('2026-01-15')).toBe('toe-taps');
  });
  it('is picked by the calendar and repeats every ten days, before the first day too', () => {
    expect([0, 1, 9, 10, 11].map((d) => rotationDay(addDays('2026-01-05', d)))).toEqual([0, 1, 9, 0, 1]);
    expect(rotationDay('2026-01-04')).toBe(9);
    expect(rotationDay('2025-12-26')).toBe(0);
  });
  it('a child with no Done before today starts with Toe Taps, whatever the date', () => {
    expect(FIRST_DRILL).toBe('toe-taps');
    expect(drillForChild('2026-01-08', null)).toBe('toe-taps');
    // the first Done was today: still Toe Taps for the rest of the day
    expect(drillForChild('2026-01-08', '2026-01-08')).toBe('toe-taps');
    // from the next day, the team's rotation
    expect(drillForChild('2026-01-09', '2026-01-08')).toBe(drillFor('2026-01-09'));
    expect(drillForChild('2026-01-08', '2026-01-02')).toBe('inside-inside-touches');
  });
  it('reads today where the team plays', () => {
    const lateEvening = new Date('2026-03-02T04:30:00Z'); // still 1 March in Chicago
    expect(teamToday('America/Chicago', lateEvening)).toBe('2026-03-01');
    expect(teamToday('Europe/Paris', lateEvening)).toBe('2026-03-02');
  });
});

describe('Daily Drills (D138)', () => {
  beforeEach(() => {
    api.completions = [];
    api.levels = seasoned();
    api.markDone.mockReset();
    api.undoDone.mockReset();
    api.setLevel.mockReset();
    api.wake.mockReset();
  });

  it('shows one drill for today, open, at the child’s level: the instruction, the parent’s job and Done', () => {
    api.levels = seasoned({ 'inside-inside-touches': at(2, 1) });
    show();
    expect(screen.getByText('Today’s drill')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    const card = within(todays());
    expect(card.getByText('Drill inside-inside-touches')).toBeInTheDocument();
    expect(card.getByText('Level 2')).toBeInTheDocument();
    expect(card.getByText('Say two.')).toBeInTheDocument();
    expect(card.getByText('Job two.')).toBeInTheDocument();
    expect(card.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    // nothing else on the card: no other level, no tips, no mode switch, no timer
    expect(card.queryByText('Say one.')).toBeNull();
    expect(card.queryByText(/Stay on the balls/)).toBeNull();
    expect(card.queryByRole('radio')).toBeNull();
    expect(card.queryByRole('timer')).toBeNull();
    expect(card.queryByText(/Intro of/)).toBeNull();
    expect(api.wake).toHaveBeenLastCalledWith(false);
  });

  it('tags the card with the drill’s Library group (D139)', () => {
    api.levels = seasoned();
    show();
    expect(within(todays()).getByText('Dribbling and Ball Mastery')).toHaveClass('drilltag');
  });
  it('a brand-new child gets Toe Taps at Level 1', () => {
    api.levels = new Map(SLUGS.map((s) => [`id-${s}`, at(1, 0, null)]));
    show();
    const card = within(todays());
    expect(card.getByText('Drill toe-taps')).toBeInTheDocument();
    expect(card.getByText('Level 1')).toBeInTheDocument();
    expect(card.getByText('Say one.')).toBeInTheDocument();
  });

  it('the picture shows only when the level has one', () => {
    show(); // Level 1 has no picture
    expect(todays().querySelector('img')).toBeNull();
  });
  it('and comes from the level’s own image', () => {
    api.levels = seasoned({ 'inside-inside-touches': at(2) });
    show();
    expect(todays().querySelector('img.drillimg')).toHaveAttribute(
      'src',
      'https://img.test/home/pic-two.png',
    );
  });

  it('Done records the drill at the child’s level, with a parent by default', async () => {
    api.levels = seasoned({ 'inside-inside-touches': at(3) });
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(api.markDone).toHaveBeenCalledWith(
      { itemId: 'id-inside-inside-touches', level: 3, mode: 'parent' },
      expect.anything(),
    );
  });

  it('“More” holds the other levels, the tips and On My Own; a parent can change the level', async () => {
    api.levels = seasoned({ 'inside-inside-touches': at(1) });
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'More' }));
    const levels = within(screen.getByRole('radiogroup', { name: /level/ })).getAllByRole('radio');
    expect(levels).toHaveLength(3);
    expect(levels[0]).toBeChecked();
    expect(
      screen.getByText(/Each Done moves up a level next time: Level 2 after this one/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Stay on the balls of your feet/)).toBeInTheDocument();
    expect(screen.getByText('Alone: inside-inside-touches.')).toBeInTheDocument();
    expect(screen.queryByText(/Side view/)).toBeNull(); // the clip description is not shown
    await user.click(levels[2] as HTMLElement);
    expect(api.setLevel).toHaveBeenCalledWith(
      { itemId: 'id-inside-inside-touches', level: 3 },
      expect.anything(),
    );
    // On My Own: the parent's job gives way to the solo version, and Done records it so
    await user.click(screen.getByRole('radio', { name: 'On My Own' }));
    expect(screen.queryByText('Job one.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(api.markDone).toHaveBeenCalledWith(
      { itemId: 'id-inside-inside-touches', level: 1, mode: 'solo' },
      expect.anything(),
    );
  });

  it('a finished drill says “Done for today”, keeps the level that was done, and offers Undo to its parent', async () => {
    // the Done at Level 1 moved the child up; the card still shows what was done
    api.levels = seasoned({ 'inside-inside-touches': at(2, 0) });
    api.completions = [done('inside-inside-touches', { level: 1 })];
    const user = userEvent.setup();
    show();
    expect(screen.getByText('Done for today!').closest('p')).toHaveTextContent(
      'Done for today! Great work, Sam.',
    );
    const card = within(todays());
    expect(card.getByRole('img', { name: 'Done today' })).toBeInTheDocument();
    expect(card.getByText('Say one.')).toBeInTheDocument();
    expect(card.queryByRole('button', { name: 'Done' })).toBeNull();
    await user.click(card.getByRole('button', { name: 'Undo' }));
    expect(api.undoDone).toHaveBeenCalledWith('c-inside-inside-touches', expect.anything());
  });
  it('but not to another parent', () => {
    api.completions = [done('inside-inside-touches', { recorded_by: 'other' })];
    show();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('“Do another” lists the other nine, closed, recorded the same way', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Do another' }));
    expect(screen.getByText('The other 9 drills')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getAllByRole('button', { name: 'Done' })).toHaveLength(1); // only today's is open
    await user.click(screen.getByRole('button', { name: /Drill juggling/ }));
    const juggling = within(
      screen.getByRole('button', { name: /Drill juggling/ }).closest('li') as HTMLElement,
    );
    await user.click(juggling.getByRole('button', { name: 'Done' }));
    expect(api.markDone).toHaveBeenCalledWith(
      { itemId: 'id-juggling', level: 1, mode: 'parent' },
      expect.anything(),
    );
  });

  it('Cone Dribbling keeps its stopwatch on the card, at the child’s level', async () => {
    api.levels = seasoned({ 'cone-dribbling': at(2) });
    const user = userEvent.setup();
    show();
    expect(screen.queryByRole('timer')).toBeNull(); // no timer on any other drill
    await user.click(screen.getByRole('button', { name: 'Do another' }));
    await user.click(screen.getByRole('button', { name: /Drill cone-dribbling/ }));
    expect(screen.getByRole('timer')).toHaveTextContent('stopwatch at level 2');
    expect(api.wake).toHaveBeenLastCalledWith(true); // the screen stays awake for the stopwatch
  });
});
