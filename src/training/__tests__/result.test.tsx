import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionSheetProvider } from '@/components/Sheet';
import { ToastProvider } from '@/components/Toast';
import { parseContent } from '@/library/types';
import type * as Api from '../api';
import { type Attempt, type Best, type HomeDrill } from '../api';
import { ResultPage } from '../ResultPage';
import { addDays, teamToday } from '../rotation';

const level = (mode: 'timer' | 'stopwatch', target?: number) => ({
  text: 'Say it.',
  parent_job: 'Job.',
  challenge: { mode, seconds: 60, target },
});
const drillOf = (slug: string, title: string, mode: 'timer' | 'stopwatch'): HomeDrill => {
  const home = parseContent({
    home: { skill: 'Dribbling and Ball Mastery', levels: [level(mode, 40), level(mode, 70), level(mode)] },
  }).home;
  if (!home) throw new Error('no home section');
  return { id: `id-${slug}`, slug, title, home };
};
const DRILLS = [
  drillOf('toe-taps', 'Toe Taps', 'timer'),
  drillOf('cone-dribbling', 'Cone Dribbling', 'stopwatch'),
];

const api = vi.hoisted(() => ({
  attempt: null as unknown,
  bests: new Map<string, unknown>(),
  remove: vi.fn(),
}));
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof Api>('../api');
  return {
    ...actual,
    useAttempt: () => ({ data: api.attempt, isPending: false, isError: false }),
    useHomeDrills: () => ({ data: DRILLS, isPending: false, isError: false }),
    useBests: () => ({ data: api.bests, isPending: false, isError: false }),
    useDeleteAttempt: () => ({ mutate: api.remove, isPending: false }),
  };
});
vi.mock('@/teams/TeamContext', () => ({
  useCurrentTeam: () => ({ sport: 'soccer', team: { id: 'team', sport: 'soccer', timezone: 'UTC' } }),
}));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

const TODAY = teamToday('UTC');
const attempt = (o: Partial<Attempt> = {}): Attempt => ({
  id: 'att-1',
  player_id: 'p1',
  item_id: 'id-toe-taps',
  level: 1,
  kind: 'reps',
  reps: 13,
  seconds: null,
  mode: 'parent',
  done_on: TODAY,
  recorded_by: 'me',
  created_at: `${TODAY}T10:00:00Z`,
  previous_best_reps: 12,
  previous_best_seconds: null,
  is_record: false,
  unlocked_level: null,
  old_course: false,
  ...o,
});
const time = (o: Partial<Attempt> = {}): Attempt =>
  attempt({ item_id: 'id-cone-dribbling', kind: 'time', reps: null, previous_best_reps: null, ...o });
const best = (o: Partial<Best>): Best => ({ reps: null, seconds: null, attempts: 3, ...o });
const show = (a: Attempt, b?: Best) => {
  api.attempt = a;
  api.bests = new Map(b ? [[`${a.item_id}:${a.level}`, b]] : []);
  return render(
    <ToastProvider>
      <ActionSheetProvider>
        <MemoryRouter initialEntries={['/training/result/att-1']}>
          <Routes>
            <Route path="/training/result/:attemptId" element={<ResultPage />} />
            <Route path="/training/:playerId" element={<p>back on Training</p>} />
          </Routes>
        </MemoryRouter>
      </ActionSheetProvider>
    </ToastProvider>,
  );
};
const score = () => screen.getByTestId('result-score');

beforeEach(() => {
  api.remove.mockReset();
});

describe('the results page of a score (D140)', () => {
  it('shows the score, the personal best and NEW RECORD when the attempt beat the best', () => {
    show(attempt({ reps: 13, previous_best_reps: 12, is_record: true }), best({ reps: 13 }));
    expect(screen.getByRole('heading', { level: 1, name: 'Toe Taps' })).toBeInTheDocument();
    expect(screen.getByText('Level 1')).toBeInTheDocument();
    expect(screen.getByText('Reps in 60 seconds')).toBeInTheDocument();
    expect(score()).toHaveTextContent('13');
    expect(screen.getByText('NEW RECORD')).toBeInTheDocument();
    expect(screen.getByText(/^Personal best:/)).toHaveTextContent('Personal best: 13 (was 12)');
  });

  it('a tie is not a new record', () => {
    show(attempt({ reps: 12, previous_best_reps: 12 }), best({ reps: 12 }));
    expect(screen.queryByText('NEW RECORD')).toBeNull();
    expect(screen.getByText(/^Personal best:/)).toHaveTextContent('Personal best: 12');
    expect(screen.getByText('That ties the best. One better is a new record.')).toBeInTheDocument();
  });

  it('a lower score leaves the best where it was', () => {
    show(attempt({ reps: 9, previous_best_reps: 12 }), best({ reps: 12 }));
    expect(score()).toHaveTextContent('9');
    expect(screen.queryByText('NEW RECORD')).toBeNull();
    expect(screen.getByText(/^Personal best:/)).toHaveTextContent('Personal best: 12');
    expect(screen.queryByText(/ties the best/)).toBeNull();
  });

  it('a first score is the best, with nothing to beat', () => {
    show(attempt({ reps: 0, previous_best_reps: null }), best({ reps: 0, attempts: 1 }));
    expect(score()).toHaveTextContent('0');
    expect(screen.queryByText('NEW RECORD')).toBeNull();
    expect(screen.getByText(/^Personal best:/)).toHaveTextContent('Personal best: 0');
    expect(screen.getByText('First score at this level: that is the one to beat.')).toBeInTheDocument();
  });

  it('for a course, less time is the record', () => {
    show(time({ seconds: 8.42, previous_best_seconds: 9.5, is_record: true }), best({ seconds: 8.42 }));
    expect(screen.getByText('Course time')).toBeInTheDocument();
    expect(score()).toHaveTextContent('8.42 s');
    expect(screen.getByText('NEW RECORD')).toBeInTheDocument();
    expect(screen.getByText(/^Personal best:/)).toHaveTextContent('Personal best: 8.42 s (was 9.50 s)');
  });
  it('and the same time is a tie', () => {
    show(time({ seconds: 9.5, previous_best_seconds: 9.5 }), best({ seconds: 9.5 }));
    expect(screen.queryByText('NEW RECORD')).toBeNull();
    expect(screen.getByText(/ties the best/)).toBeInTheDocument();
  });

  it('says so when the score unlocked the next level', () => {
    show(
      attempt({ reps: 40, previous_best_reps: 12, is_record: true, unlocked_level: 2 }),
      best({ reps: 40 }),
    );
    expect(screen.getByText('Level 2 unlocked!').closest('p')).toHaveTextContent(
      'Level 2 unlocked! Toe Taps opens at Level 2 next time.',
    );
  });
  it('and nothing about levels when it did not', () => {
    show(attempt({ reps: 39 }), best({ reps: 39 }));
    expect(screen.queryByText(/unlocked/)).toBeNull();
  });

  it('shows what the attempt itself tells while the bests are still loading', () => {
    show(attempt({ reps: 9, previous_best_reps: 12 }));
    expect(screen.getByText(/^Personal best:/)).toHaveTextContent('Personal best: 12');
  });

  it('Try Again opens the drill again; Back to Training goes back for that child', () => {
    show(time({ seconds: 9.5, previous_best_seconds: null }), best({ seconds: 9.5 }));
    expect(screen.getByRole('link', { name: 'Try Again' })).toHaveAttribute(
      'href',
      '/training/p1?drill=cone-dribbling',
    );
    expect(screen.getByRole('link', { name: 'Back to Training' })).toHaveAttribute('href', '/training/p1');
  });

  it('whoever recorded it can delete it the same day, after confirming', async () => {
    api.remove.mockImplementation((_id: string, o: { onSuccess: () => void }) => o.onSuccess());
    show(attempt(), best({ reps: 13 }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete this score' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this score?' });
    expect(dialog).toHaveTextContent('A level it unlocked stays.');
    expect(api.remove).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete this score' }));
    expect(api.remove).toHaveBeenCalledWith('att-1', expect.anything());
    expect(screen.getByText('back on Training')).toBeInTheDocument();
  });
  it('not someone else’s score, and not an earlier day’s', () => {
    const view = show(attempt({ recorded_by: 'other' }), best({ reps: 13 }));
    expect(screen.queryByRole('button', { name: 'Delete this score' })).toBeNull();
    view.unmount();
    show(attempt({ done_on: addDays(TODAY, -1) }), best({ reps: 13 }));
    expect(screen.queryByRole('button', { name: 'Delete this score' })).toBeNull();
  });

  it('a score that is gone says so', () => {
    api.attempt = null;
    render(
      <ToastProvider>
        <ActionSheetProvider>
          <MemoryRouter initialEntries={['/training/result/gone']}>
            <Routes>
              <Route path="/training/result/:attemptId" element={<ResultPage />} />
            </Routes>
          </MemoryRouter>
        </ActionSheetProvider>
      </ToastProvider>,
    );
    expect(screen.getByText('This score is not here any more.')).toBeInTheDocument();
  });
});
