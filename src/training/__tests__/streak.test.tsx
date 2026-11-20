import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { type Practice } from '@/games/practices';
import type * as Api from '../api';
import { StreakCard } from '../StreakCard';
import { EMPTY_STREAK, practiceStarted, type Streak, streakHint, teamNowStamp } from '../streak';
import { WentSection } from '../WentSection';

const api = vi.hoisted(() => ({
  streak: null as unknown,
  checkins: [] as unknown[],
  celebrate: vi.fn(),
  setWent: vi.fn(),
  gameCheckins: [] as unknown[],
  setGameWent: vi.fn(),
}));
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof Api>('../api');
  return {
    ...actual,
    useStreak: () => ({ data: api.streak, isPending: false, isError: false }),
    useCelebrateMilestone: () => ({ mutate: api.celebrate, isPending: false }),
    useCheckins: () => ({ data: api.checkins, isPending: false }),
    useSetWent: () => ({ mutate: api.setWent, isPending: false }),
    useGameCheckins: () => ({ data: api.gameCheckins, isPending: false }),
    useSetGameWent: () => ({ mutate: api.setGameWent, isPending: false }),
  };
});
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

const streak = (o: Partial<Streak>): Streak => ({ ...EMPTY_STREAK, ...o });
const practice = (id: string, date: string, time: string | null, status = 'scheduled') =>
  ({ id, team_id: 't1', practice_date: date, start_time: time, status }) as unknown as Practice;

describe('streak wording', () => {
  it('is one short line about today; there are no days off (D138)', () => {
    expect(streakHint(streak({}))).toBe('Do one drill today to start a streak.');
    expect(streakHint(streak({ current: 4 }))).toBe('One drill today keeps it going.');
    expect(streakHint(streak({ current: 5, todayCounts: true }))).toBe('Done for today.');
    expect(streakHint(streak({ current: 1, todayCounts: true }))).toBe('Done for today.');
    expect(streakHint(streak({ current: 4 }))).not.toMatch(/day off|days off/);
  });
});

describe('“We went” opens at the practice start, in the team’s time', () => {
  it('compares with the team’s clock, not the device’s', () => {
    const now = new Date('2026-03-02T23:30:00Z'); // 17:30 in Chicago, 00:30 next day in Paris
    expect(teamNowStamp('America/Chicago', now)).toBe('2026-03-02T17:30');
    expect(teamNowStamp('Europe/Paris', now)).toBe('2026-03-03T00:30');
  });
  it('is closed before the start, open from it, and never for a cancelled practice', () => {
    const p = practice('a', '2026-03-02', '17:30:00');
    expect(practiceStarted(p, '2026-03-02T17:29')).toBe(false);
    expect(practiceStarted(p, '2026-03-02T17:30')).toBe(true);
    expect(practiceStarted(practice('b', '2026-03-02', null), '2026-03-02T00:00')).toBe(true);
    expect(practiceStarted(practice('b', '2026-03-03', null), '2026-03-02T23:59')).toBe(false);
    expect(practiceStarted(practice('c', '2026-03-01', '09:00:00', 'cancelled'), '2026-03-02T17:30')).toBe(
      false,
    );
  });
});

describe('StreakCard', () => {
  beforeEach(() => {
    api.celebrate.mockReset();
  });
  it('shows the count, the longest and the hint', () => {
    api.streak = streak({ current: 7, longest: 12, todayCounts: true });
    render(
      <ToastProvider>
        <StreakCard playerId="p1" playerName="Sam" />
      </ToastProvider>,
    );
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Longest: 12 days')).toBeInTheDocument();
    expect(screen.getByText('Done for today.')).toBeInTheDocument();
    expect(screen.queryByText(/-day streak!/)).toBeNull();
  });
  it('celebrates a milestone once: “Nice!” records it', async () => {
    api.streak = streak({ current: 10, longest: 10, todayCounts: true, celebrate: 10 });
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <StreakCard playerId="p1" playerName="Sam" />
      </ToastProvider>,
    );
    expect(screen.getByText('10-day streak!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nice!' }));
    expect(api.celebrate).toHaveBeenCalledWith(10, expect.anything());
  });
});

describe('WentSection', () => {
  const TODAY = '2000-01-02';
  const past = practice('past', '2000-01-01', '09:00:00');
  const future = practice('future', '2999-01-01', '09:00:00');
  const show = (practices: Practice[], kids = [{ id: 'p1', first_name: 'Sam' }]) =>
    render(
      <ToastProvider>
        <WentSection practices={practices} kids={kids} timezone="America/Chicago" today={TODAY} />
      </ToastProvider>,
    );
  beforeEach(() => {
    api.checkins = [];
    api.setWent.mockReset();
    api.gameCheckins = [];
    api.setGameWent.mockReset();
  });

  it('“We went” works the same for a game that has started (D138)', async () => {
    const game = (id: string, date: string) => ({
      id,
      game_date: date,
      start_time: '09:00:00',
      opponent: 'Rovers',
    });
    const user = userEvent.setup();
    const first = render(
      <ToastProvider>
        <WentSection
          games={[game('g-past', '2000-01-01'), game('g-future', '2999-01-01')]}
          kids={[{ id: 'p1', first_name: 'Sam' }]}
          timezone="America/Chicago"
          today={TODAY}
        />
      </ToastProvider>,
    );
    expect(screen.getByText(/Sam · game .* vs Rovers/)).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1); // not the game still to come
    await user.click(screen.getByRole('button', { name: 'We went' }));
    expect(api.setGameWent).toHaveBeenCalledWith({ gameId: 'g-past', went: true }, expect.anything());
    expect(api.setWent).not.toHaveBeenCalled();
    first.unmount();
    api.gameCheckins = [
      { game_id: 'g-past', player_id: 'p1', set_by: 'me', created_at: '2000-01-02T18:00:00Z' },
    ];
    render(
      <ToastProvider>
        <WentSection
          games={[game('g-past', '2000-01-01')]}
          kids={[{ id: 'p1', first_name: 'Sam' }]}
          timezone="America/Chicago"
          today={TODAY}
        />
      </ToastProvider>,
    );
    expect(screen.getByText('Marked: we went')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(api.setGameWent).toHaveBeenCalledWith({ gameId: 'g-past', went: false }, expect.anything());
  });

  it('offers nothing before the practice starts, or without a confirmed child', () => {
    const first = show([future]);
    expect(screen.queryByText('Were you there?')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    first.unmount();
    show([past], []);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('“We went” marks the practice for the child', async () => {
    const user = userEvent.setup();
    show([past, future]);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'We went' }));
    expect(api.setWent).toHaveBeenCalledWith({ practiceId: 'past', went: true }, expect.anything());
  });
  it('a marked practice shows it; only today’s own mark can be taken back', async () => {
    const mine = { practice_id: 'past', player_id: 'p1', set_by: 'me' };
    api.checkins = [{ ...mine, created_at: '2000-01-02T18:00:00Z' }];
    const user = userEvent.setup();
    const first = show([past]);
    expect(screen.getByText('Marked: we went')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(api.setWent).toHaveBeenCalledWith({ practiceId: 'past', went: false }, expect.anything());
    first.unmount();
    api.checkins = [{ ...mine, created_at: '2000-01-01T18:00:00Z' }]; // marked yesterday
    const second = show([past]);
    expect(within(second.container).queryByRole('button')).toBeNull();
    expect(screen.getByRole('img', { name: 'We went' })).toBeInTheDocument();
    second.unmount();
    api.checkins = [{ ...mine, set_by: 'other', created_at: '2000-01-02T18:00:00Z' }]; // the other parent
    expect(within(show([past]).container).queryByRole('button')).toBeNull();
  });
});
