import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { parseContent } from '@/library/types';
import type * as Api from '../api';
import { type Completion, type HomeDrill } from '../api';
import { DailyDrills } from '../DailyDrills';
import { addDays, drillsFor, ROTATION, rotationDay, teamToday } from '../rotation';

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
const MINUTES = [3, 3, 3, 4, 4, 4, 3, 5, 3, 5];
const drill = (slug: string, i: number): HomeDrill => {
  const home = parseContent({
    home: {
      skill: 'Footwork',
      type: 'repetition',
      minutes: MINUTES[i],
      intro: `Intro of ${slug}.`,
      with_parent: `Together: ${slug}.`,
      on_my_own: `Alone: ${slug}.`,
      levels: [{ text: 'Easy.' }, { text: 'Medium.' }, { text: 'Hard.' }],
      tips: 'Stay on the balls of your feet.',
      clip: 'Side view.',
    },
  }).home;
  if (!home) throw new Error('no home section');
  return { id: `id-${slug}`, slug, title: `Drill ${slug}`, home };
};
const DRILLS = SLUGS.map(drill);

const api = vi.hoisted(() => ({
  completions: [] as unknown[],
  markDone: vi.fn(),
  undoDone: vi.fn(),
  wake: vi.fn(),
}));
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof Api>('../api');
  return {
    ...actual,
    useHomeDrills: () => ({ data: DRILLS, isPending: false, isError: false }),
    useCompletions: () => ({ data: api.completions, isPending: false, isError: false }),
    useMarkDone: () => ({ mutate: api.markDone, isPending: false }),
    useUndoDone: () => ({ mutate: api.undoDone, isPending: false }),
  };
});
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('@/clock/useWakeLock', () => ({ useWakeLock: (on: boolean) => api.wake(on) }));

const TODAY = '2026-01-05'; // day 1 of the rotation
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

describe('the five-day rotation', () => {
  it('follows the sheet: three drills a day, all ten in five days, 10 to 12 minutes', () => {
    expect(drillsFor('2026-01-05')).toEqual([
      'toe-taps',
      'cone-dribbling',
      'first-touch-and-passing-with-a-parent',
    ]);
    expect(drillsFor('2026-01-07')).toEqual(['sole-rolls', 'l-drags', 'juggling']);
    expect(new Set(ROTATION.flat()).size).toBe(10);
    const minutes = ROTATION.map((day) => day.reduce((m, s) => m + (MINUTES[SLUGS.indexOf(s)] ?? 0), 0));
    expect(minutes).toEqual([12, 12, 10, 11, 12]);
  });
  it('is picked by the calendar and repeats every five days, before the first day too', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((d) => rotationDay(addDays('2026-01-05', d)))).toEqual([
      0, 1, 2, 3, 4, 0, 1, 2,
    ]);
    expect(rotationDay('2026-01-04')).toBe(4);
    expect(rotationDay('2025-12-31')).toBe(0);
  });
  it('reads today where the team plays', () => {
    const lateEvening = new Date('2026-03-02T04:30:00Z'); // still 1 March in Chicago
    expect(teamToday('America/Chicago', lateEvening)).toBe('2026-03-01');
    expect(teamToday('Europe/Paris', lateEvening)).toBe('2026-03-02');
  });
});

describe('Daily Drills', () => {
  beforeEach(() => {
    api.completions = [];
    api.markDone.mockReset();
    api.undoDone.mockReset();
    api.wake.mockReset();
  });

  it('shows today’s three with name, type and minutes', () => {
    show();
    expect(screen.getByText('Today · 3 drills · about 12 min')).toBeInTheDocument();
    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(within(cards[1] as HTMLElement).getByText('Drill cone-dribbling')).toBeInTheDocument();
    expect(within(cards[1] as HTMLElement).getByText('· 4 min')).toBeInTheDocument();
    expect(api.wake).toHaveBeenLastCalledWith(false);
  });

  it('an open drill has the toggle, all three levels, the tips and Done; the child picks the level', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: /Drill toe-taps/ }));
    expect(api.wake).toHaveBeenLastCalledWith(true); // the screen stays awake while a drill is open
    expect(screen.getByText('Together: toe-taps.')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'On My Own' }));
    expect(screen.getByText('Alone: toe-taps.')).toBeInTheDocument();
    const levels = within(screen.getByRole('radiogroup', { name: /level/ })).getAllByRole('radio');
    expect(levels).toHaveLength(3);
    expect(levels.every((l) => !(l as HTMLButtonElement).disabled)).toBe(true); // none locked
    expect(screen.getByText(/Stay on the balls of your feet/)).toBeInTheDocument();
    expect(screen.queryByText(/Side view/)).toBeNull(); // the clip description is not shown
    await user.click(levels[2] as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(api.markDone).toHaveBeenCalledWith(
      { itemId: 'id-toe-taps', level: 3, mode: 'solo' },
      expect.anything(),
    );
  });

  it('starts from the level and mode used last time', async () => {
    api.completions = [done('toe-taps', { done_on: '2026-01-01', level: 2, mode: 'solo' })];
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: /Drill toe-taps/ }));
    expect(screen.getByRole('radio', { name: 'On My Own' })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Level 2/ })).toBeChecked();
  });

  it('a finished drill shows Done with Undo for the parent who recorded it', async () => {
    api.completions = [done('toe-taps', { level: 2 }), done('cone-dribbling', { recorded_by: 'other' })];
    const user = userEvent.setup();
    show();
    expect(screen.getAllByRole('img', { name: 'Done today' })).toHaveLength(2);
    expect(screen.queryByText(/All three done/)).toBeNull();
    await user.click(screen.getByRole('button', { name: /Drill toe-taps/ }));
    expect(screen.getByText(/Level 2 · With a Parent/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(api.undoDone).toHaveBeenCalledWith('c-toe-taps', expect.anything());
    await user.click(screen.getByRole('button', { name: /Drill cone-dribbling/ }));
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('celebrates when all three are done', () => {
    api.completions = ['toe-taps', 'cone-dribbling', 'first-touch-and-passing-with-a-parent'].map((s) =>
      done(s),
    );
    show();
    expect(screen.getByText('All three done!').closest('p')).toHaveTextContent(
      'All three done! Great work, Sam.',
    );
  });

  it('“Do another” lists all ten, recorded the same way', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Do another' }));
    expect(screen.getByText('All 10 drills')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(13);
    await user.click(screen.getByRole('button', { name: /Drill juggling/ }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(api.markDone).toHaveBeenCalledWith(
      { itemId: 'id-juggling', level: 1, mode: 'parent' },
      expect.anything(),
    );
  });
});
