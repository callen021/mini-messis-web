import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { parseContent } from '@/library/types';
import type * as Api from '../api';
import { type Attempt, type Best, type Completion, type DrillLevel, type HomeDrill } from '../api';
import { DailyDrills } from '../DailyDrills';
import { drillForChild, ROTATION, teamToday } from '../rotation';

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
  const cones = slug === 'cone-dribbling';
  const challenge = (target?: number) =>
    cones ? { mode: 'stopwatch', target } : { mode: 'timer', seconds: 60, target };
  const home = parseContent({
    home: {
      skill: 'Dribbling and Ball Mastery',
      type: 'repetition',
      minutes: 3,
      intro: `Intro of ${slug}.`,
      with_parent: `Together: ${slug}.`,
      on_my_own: `Alone: ${slug}.`,
      levels: [
        { text: 'Say one.', parent_job: 'Job one.', challenge: challenge(cones ? 10 : 40) },
        {
          text: 'Say two.',
          parent_job: 'Job two.',
          harder: 'Harder two.',
          image: 'home/pic-two.png',
          challenge: challenge(cones ? 8 : 70),
        },
        // juggling's top level is written the old way, without a challenge
        {
          text: 'Say three.',
          parent_job: 'Job three.',
          ...(slug === 'juggling' ? {} : { challenge: challenge() }),
        },
      ],
      tips: 'Stay on the balls of your feet.',
      clip: 'Side view.',
      ...(cones
        ? { diagram: { elements: [{ type: 'cones', id: 'c', from: [0, 0], step: [1, 0], count: 4 }] } }
        : {}),
    },
  }).home;
  if (!home) throw new Error('no home section');
  return { id: `id-${slug}`, slug, title: `Drill ${slug}`, home };
};
const DRILLS = SLUGS.map(drill);

const api = vi.hoisted(() => ({
  completions: [] as unknown[],
  levels: new Map<string, unknown>(),
  bests: new Map<string, unknown>(),
  attempts: [] as unknown[],
  markDone: vi.fn(),
  record: vi.fn(),
  setLevel: vi.fn(),
}));
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof Api>('../api');
  return {
    ...actual,
    useHomeDrills: () => ({ data: DRILLS, isPending: false, isError: false }),
    useCompletions: () => ({ data: api.completions, isPending: false, isError: false }),
    useDrillLevels: () => ({ data: api.levels, isPending: false, isError: false }),
    useBests: () => ({ data: api.bests, isPending: false, isError: false }),
    useAttempts: () => ({ data: api.attempts, isPending: false, isError: false }),
    useMarkDone: () => ({ mutate: api.markDone, isPending: false }),
    useRecordAttempt: () => ({ mutate: api.record, isPending: false }),
    useSetDrillLevel: () => ({ mutate: api.setLevel, isPending: false }),
  };
});
// the challenges have their own tests; here each is a button that hands over a score
vi.mock('../TimerChallenge', () => ({
  TimerChallenge: ({ seconds, onRecord }: { seconds: number; onRecord: (reps: number) => void }) => (
    <button type="button" onClick={() => onRecord(41)}>
      timer {seconds}
    </button>
  ),
}));
vi.mock('../StopwatchChallenge', () => ({
  StopwatchChallenge: ({ onRecord }: { onRecord: (seconds: number) => void }) => (
    <button type="button" onClick={() => onRecord(9.87)}>
      stopwatch
    </button>
  ),
}));
vi.mock('@/library/api', () => ({ libraryImageUrl: (path: string) => `https://img.test/${path}` }));

const TODAY = '2026-01-08';
const BEFORE = '2026-01-02';
const at = (level: number, firstDoneOn: string | null = BEFORE): DrillLevel => ({ level, firstDoneOn });
/** A child who did Toe Taps on an earlier day: Inside-Inside Touches is next in their line-up. */
const seasoned = (over: Record<string, DrillLevel> = {}) =>
  new Map(SLUGS.map((s) => [`id-${s}`, over[s] ?? at(1, s === 'toe-taps' ? BEFORE : null)]));
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
const attempt = (slug: string, o: Partial<Attempt> = {}): Attempt => ({
  id: `a-${slug}-${o.done_on ?? TODAY}`,
  player_id: 'p1',
  item_id: `id-${slug}`,
  level: 1,
  kind: 'reps',
  reps: 30,
  seconds: null,
  mode: 'parent',
  done_on: TODAY,
  recorded_by: 'me',
  created_at: `${TODAY}T10:00:00Z`,
  previous_best_reps: null,
  previous_best_seconds: null,
  is_record: false,
  unlocked_level: null,
  old_course: false,
  ...o,
});
const best = (o: Partial<Best>): Best => ({ reps: null, seconds: null, attempts: 1, ...o });
const show = (path = '/training') =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/training"
            element={<DailyDrills playerId="p1" playerName="Sam" sport="soccer" today={TODAY} />}
          />
          <Route path="/training/result/:attemptId" element={<p>the results page</p>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
const todays = () => screen.getAllByRole('listitem')[0] as HTMLElement;

describe('one drill a day, each child easiest first (D141)', () => {
  const last = (o: Record<string, string> = {}) => new Map(Object.entries(o));
  it('lists all ten, easiest first', () => {
    expect(ROTATION).toEqual([
      'toe-taps',
      'inside-inside-touches',
      'sole-rolls',
      'wall-passing-and-first-touch',
      'first-touch-and-passing-with-a-parent',
      'inside-outside-touches',
      'cone-dribbling',
      'v-cuts',
      'l-drags',
      'juggling',
    ]);
    expect(new Set(ROTATION)).toEqual(new Set(SLUGS));
  });
  it('a child with no Done yet starts with Toe Taps, whatever order the drills come in', () => {
    expect(drillForChild(SLUGS, last())).toBe('toe-taps');
    expect(drillForChild([...SLUGS].reverse(), last())).toBe('toe-taps');
  });
  it('then takes the next easiest they have not done, a day at a time', () => {
    const done = new Map<string, string>();
    const days = ROTATION.map((_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`);
    const got = days.map((day) => {
      const slug = drillForChild(SLUGS, done) as string;
      done.set(slug, day);
      return slug;
    });
    expect(got).toEqual(ROTATION);
    // and round again from the top: Toe Taps is now the one done longest ago
    expect(drillForChild(SLUGS, done)).toBe('toe-taps');
  });
  it('a missed day skips nothing: the line-up waits for the child', () => {
    const done = last({ 'toe-taps': '2026-01-01' });
    expect(drillForChild(SLUGS, done)).toBe('inside-inside-touches'); // on 2 January, or on 20 January
  });
  it('a drill done early from “Do another” goes to the back of the line', () => {
    const done = last({ 'toe-taps': '2026-01-01', juggling: '2026-01-01' });
    expect(drillForChild(SLUGS, done)).toBe('inside-inside-touches');
    const all = new Map(ROTATION.map((s) => [s, '2026-01-05']));
    all.set('sole-rolls', '2026-01-03');
    expect(drillForChild(SLUGS, all)).toBe('sole-rolls'); // the one done longest ago
  });
  it('skips a drill that is not on offer, and takes a new one after the ten', () => {
    expect(
      drillForChild(
        SLUGS.filter((s) => s !== 'toe-taps'),
        last(),
      ),
    ).toBe('inside-inside-touches');
    expect(drillForChild(['new-drill', 'juggling'], last())).toBe('juggling');
    expect(drillForChild(['new-drill', 'juggling'], last({ juggling: '2026-01-01' }))).toBe('new-drill');
    expect(drillForChild([], last())).toBeNull();
  });
  it('reads today where the team plays', () => {
    const lateEvening = new Date('2026-03-02T04:30:00Z'); // still 1 March in Chicago
    expect(teamToday('America/Chicago', lateEvening)).toBe('2026-03-01');
    expect(teamToday('Europe/Paris', lateEvening)).toBe('2026-03-02');
  });
});

describe('Daily Drills (D138, D140, D141)', () => {
  const EARLIER = () => done('toe-taps', { id: 'c-earlier', done_on: BEFORE });
  beforeEach(() => {
    api.completions = [EARLIER()];
    api.levels = seasoned();
    api.bests = new Map();
    api.attempts = [];
    api.markDone.mockReset();
    api.record.mockReset();
    api.setLevel.mockReset();
  });

  it('shows one drill for today at the child’s level: the instruction, the parent’s job and the challenge', () => {
    api.levels = seasoned({ 'inside-inside-touches': at(2) });
    show();
    expect(screen.getByText('Today’s drill')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    const card = within(todays());
    expect(card.getByText('Drill inside-inside-touches')).toBeInTheDocument();
    expect(card.getByText('Level 2')).toBeInTheDocument();
    expect(card.getByText('Say two.')).toBeInTheDocument();
    expect(card.getByText('Job two.')).toBeInTheDocument();
    expect(card.getByRole('button', { name: 'timer 60' })).toBeInTheDocument();
    expect(todays()).toHaveTextContent('Level 2 best: no score yet');
    expect(card.getByText('Target: 70 or more unlocks Level 3')).toBeInTheDocument();
    // the simple Done button is gone, and nothing else is on the card until More
    expect(card.queryByRole('button', { name: 'Done' })).toBeNull();
    expect(card.queryByText('Say one.')).toBeNull();
    expect(card.queryByText('Harder two.')).toBeNull();
    expect(card.queryByText(/Stay on the balls/)).toBeNull();
    expect(card.queryByRole('radio')).toBeNull();
  });

  it('tags the card with the drill’s Library group (D139)', () => {
    show();
    expect(within(todays()).getByText('Dribbling and Ball Mastery')).toHaveClass('drilltag');
  });
  it('Toe Taps done for the first time today is still today’s drill', () => {
    api.completions = [done('toe-taps')];
    show();
    expect(within(todays()).getByText('Drill toe-taps')).toBeInTheDocument();
  });
  it('a brand-new child gets Toe Taps at Level 1', () => {
    api.completions = [];
    api.levels = new Map(SLUGS.map((s) => [`id-${s}`, at(1, null)]));
    show();
    const card = within(todays());
    expect(card.getByText('Drill toe-taps')).toBeInTheDocument();
    expect(card.getByText('Level 1')).toBeInTheDocument();
    expect(card.getByText('Say one.')).toBeInTheDocument();
  });

  it('the picture slot stays empty until the level has a picture', () => {
    show(); // Level 1 has no picture
    expect(todays().querySelector('img')).toBeNull();
  });
  it('and then shows the level’s own image', () => {
    api.levels = seasoned({ 'inside-inside-touches': at(2) });
    show();
    expect(todays().querySelector('img.drillimg')).toHaveAttribute(
      'src',
      'https://img.test/home/pic-two.png',
    );
  });

  it('Record Score saves the attempt at the child’s level and opens its results page', async () => {
    api.levels = seasoned({ 'inside-inside-touches': at(3) });
    api.record.mockImplementation((_v: unknown, o: { onSuccess: (id: string) => void }) =>
      o.onSuccess('att-1'),
    );
    show();
    await userEvent.click(screen.getByRole('button', { name: 'timer 60' }));
    expect(api.record).toHaveBeenCalledWith(
      { itemId: 'id-inside-inside-touches', level: 3, mode: 'parent', score: { reps: 41 } },
      expect.anything(),
    );
    expect(screen.getByText('the results page')).toBeInTheDocument();
  });

  it('shows the personal best of the level the child is on, and no target at the top level', () => {
    api.levels = seasoned({ 'inside-inside-touches': at(3) });
    api.bests = new Map([
      ['id-inside-inside-touches:1', best({ reps: 99 })],
      ['id-inside-inside-touches:3', best({ reps: 52 })],
    ]);
    show();
    expect(todays()).toHaveTextContent('Level 3 best: 52');
    expect(within(todays()).queryByText(/^Target:/)).toBeNull();
  });

  it('“More” holds Make it harder, the levels, the tips and On My Own; a parent can change the level', async () => {
    api.levels = seasoned({ 'inside-inside-touches': at(2) });
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByText('Harder two.').closest('p')).toHaveTextContent('Make it harder: Harder two.');
    const levels = within(screen.getByRole('radiogroup', { name: /level/ })).getAllByRole('radio');
    expect(levels).toHaveLength(3);
    expect(levels[1]).toBeChecked();
    expect(screen.getByText(/A score that meets the target unlocks Level 3/)).toBeInTheDocument();
    expect(screen.getByText(/Stay on the balls of your feet/)).toBeInTheDocument();
    expect(screen.getByText('Alone: inside-inside-touches.')).toBeInTheDocument();
    expect(screen.queryByText(/Side view/)).toBeNull(); // the clip description is not shown
    await user.click(levels[2] as HTMLElement);
    expect(api.setLevel).toHaveBeenCalledWith(
      { itemId: 'id-inside-inside-touches', level: 3 },
      expect.anything(),
    );
    // On My Own: the parent's job gives way to the solo version, and the score is recorded so
    await user.click(screen.getByRole('radio', { name: 'On My Own' }));
    expect(screen.queryByText('Job two.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'timer 60' }));
    expect(api.record).toHaveBeenCalledWith(
      { itemId: 'id-inside-inside-touches', level: 2, mode: 'solo', score: { reps: 41 } },
      expect.anything(),
    );
  });

  it('a drill with a score today says “Done for today”, stays today’s drill, and can be tried again', () => {
    api.completions = [EARLIER(), done('inside-inside-touches')];
    show();
    expect(screen.getByText('Done for today!').closest('p')).toHaveTextContent(
      'Done for today! Great work, Sam.',
    );
    const card = within(todays());
    expect(card.getByRole('img', { name: 'Done today' })).toBeInTheDocument();
    expect(card.getByRole('button', { name: 'timer 60' })).toBeInTheDocument();
    expect(card.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('opens at the new level once a score has unlocked it', () => {
    // the server moved the child up when the score met the target
    api.levels = seasoned({ 'inside-inside-touches': at(2) });
    api.completions = [EARLIER(), done('inside-inside-touches', { level: 1 })];
    show();
    expect(within(todays()).getByText('Level 2')).toBeInTheDocument();
    expect(within(todays()).getByText('Say two.')).toBeInTheDocument();
  });

  it('“Do another” lists the other nine, closed, recorded the same way', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Do another' }));
    expect(screen.getByText('The other 9 drills')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getAllByRole('button', { name: 'timer 60' })).toHaveLength(1); // only today's is open
    await user.click(screen.getByRole('button', { name: /Drill sole-rolls/ }));
    const rolls = within(
      screen.getByRole('button', { name: /Drill sole-rolls/ }).closest('li') as HTMLElement,
    );
    await user.click(rolls.getByRole('button', { name: 'timer 60' }));
    expect(api.record).toHaveBeenCalledWith(
      { itemId: 'id-sole-rolls', level: 1, mode: 'parent', score: { reps: 41 } },
      expect.anything(),
    );
  });

  it('Try Again from the results page opens that drill', () => {
    show('/training?drill=sole-rolls');
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByRole('button', { name: /Drill sole-rolls/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('button', { name: 'timer 60' })).toHaveLength(2);
  });
  it('and today’s own drill needs no list', () => {
    show('/training?drill=inside-inside-touches');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('Cone Dribbling is a stopwatch: a time is recorded, with the course diagram and old five-cone times under More', async () => {
    api.levels = seasoned({ 'cone-dribbling': at(1) });
    api.bests = new Map([['id-cone-dribbling:1', best({ seconds: 9.5 })]]);
    api.attempts = [
      attempt('cone-dribbling', { kind: 'time', reps: null, seconds: 9.5 }),
      attempt('cone-dribbling', {
        kind: 'time',
        reps: null,
        seconds: 5.9,
        done_on: '2025-11-02',
        old_course: true,
      }),
      attempt('cone-dribbling', { kind: 'time', reps: null, seconds: 7, level: 2 }),
    ];
    const user = userEvent.setup();
    show('/training?drill=cone-dribbling');
    const cones = screen.getByRole('button', { name: /Drill cone-dribbling/ }).closest('li') as HTMLElement;
    expect(cones).toHaveTextContent('Level 1 best: 9.50 s');
    expect(within(cones).getByText('Target: 10.0 s or less unlocks Level 2')).toBeInTheDocument();
    await user.click(within(cones).getByRole('button', { name: 'stopwatch' }));
    expect(api.record).toHaveBeenCalledWith(
      { itemId: 'id-cone-dribbling', level: 1, mode: 'parent', score: { seconds: 9.87 } },
      expect.anything(),
    );
    await user.click(within(cones).getByRole('button', { name: 'More' }));
    expect(within(cones).getByRole('img', { name: /Overhead diagram: 4 cones/ })).toBeInTheDocument();
    const scores = within(within(cones).getByRole('list', { name: 'Level 1 recent scores' })).getAllByRole(
      'listitem',
    );
    // this level's only; the old course is kept and labelled, though it is no personal best
    expect(scores).toHaveLength(2);
    expect(scores[0]).toHaveTextContent('9.50 s');
    expect(scores[1]).toHaveTextContent('five cones');
    expect(scores[1]).toHaveTextContent('5.90 s');
  });

  it('a level written without a challenge keeps a plain Done', async () => {
    api.levels = seasoned({ juggling: at(3) });
    const user = userEvent.setup();
    show('/training?drill=juggling');
    const juggling = within(
      screen.getByRole('button', { name: /Drill juggling/ }).closest('li') as HTMLElement,
    );
    expect(juggling.queryByRole('button', { name: /timer/ })).toBeNull();
    await user.click(juggling.getByRole('button', { name: 'Done' }));
    expect(api.markDone).toHaveBeenCalledWith(
      { itemId: 'id-juggling', level: 3, mode: 'parent' },
      expect.anything(),
    );
  });
});
