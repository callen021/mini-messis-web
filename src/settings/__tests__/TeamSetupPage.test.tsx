import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import type * as LineupsApi from '@/lineups/api';
import type * as TeamsApi from '@/teams/api';
import { SPORTS } from '@/sports/definitions';
import { type ActiveMembership, type Team } from '@/teams/api';
import { COALESCE_MS, SAVE_FAILED } from '@/teams/teamCache';
import { TeamProviderForTests, type TeamContextValue } from '@/teams/TeamContext';
import { TeamSetupPage } from '../TeamSetupPage';

const updates: unknown[] = [];
let liveGame: { id: string } | null = null;
/** When set, the next team update fails with this (raw-looking) database error. */
let failNext: { message: string; code: string } | null = null;

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (patch: unknown) => {
        updates.push(patch);
        return {
          eq: async () => {
            const error = failNext;
            failNext = null;
            return { error };
          },
        };
      },
    }),
  },
}));
vi.mock('@/lineups/api', async () => {
  const actual = await vi.importActual<typeof LineupsApi>('@/lineups/api');
  return {
    ...actual,
    useLiveGame: () => ({ data: liveGame, isPending: false }),
  };
});
vi.mock('@/teams/api', async () => {
  const actual = await vi.importActual<typeof TeamsApi>('@/teams/api');
  return { ...actual, usePlayers: () => ({ data: [], isPending: false }) };
});

const base: Team = {
  id: 't1',
  name: 'Strikers',
  sport: 'soccer',
  owner_id: 'u1',
  join_code: 'ABCD2345',
  join_code_rotated_at: '',
  join_enabled: true,
  require_approval: false,
  timezone: 'America/Chicago',
  parent_stats: 'own',
  time_mode: 'periods',
  clock_periods: 2,
  period_minutes: null,
  side_size: 7,
  has_gk: true,
  periods_count: 4,
  colors: SPORTS.soccer.defaultColors,
  last_batter_player_id: null,
  archived_at: null,
  created_at: '',
  updated_at: '',
  updated_by: null,
};

/**
 * Like the app: the page's team comes from the memberships query, so an optimistic update is
 * visible only if the cache is patched (D88).
 */
function Harness() {
  const q = useQuery<ActiveMembership[]>({ queryKey: ['memberships', 'u1'], enabled: false });
  const m = q.data?.[0];
  if (!m) return null;
  const ctx: TeamContextValue = {
    teamId: 't1',
    team: m.team,
    sport: 'soccer',
    role: 'coach',
    isOwner: true,
    memberships: q.data ?? [],
    switchTeam: () => undefined,
    adminActing: false,
  };
  return (
    <TeamProviderForTests value={ctx}>
      <TeamSetupPage />
    </TeamProviderForTests>
  );
}

function renderPage(team: Partial<Team> = {}) {
  const t = { ...base, ...team };
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  qc.setQueryData(['team', 't1'], t);
  qc.setQueryData(
    ['memberships', 'u1'],
    [{ team: t, membership: { id: 'm1', team_id: 't1', user_id: 'u1', role: 'coach', status: 'active' } }],
  );
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <Harness />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return qc;
}

const settle = () => new Promise((r) => setTimeout(r, COALESCE_MS + 50));

describe('TeamSetupPage · track playing time by (D65)', () => {
  beforeEach(() => {
    updates.length = 0;
    liveGame = null;
    failNext = null;
  });

  it('period mode shows the quarters stepper and no clock rows', () => {
    renderPage();
    expect(screen.getByRole('radio', { name: 'Periods' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('group', { name: 'Quarters' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/length in minutes/)).not.toBeInTheDocument();
  });

  it('switching to the clock shows at once and saves the mode a moment later', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('radio', { name: 'Clock' }));
    // optimistic: the control and its rows flip before any request
    expect(screen.getByRole('radio', { name: 'Clock' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('group', { name: 'Halves' })).toBeInTheDocument();
    expect(updates).toHaveLength(0);
    await waitFor(() => expect(updates).toContainEqual({ time_mode: 'clock' }));
  });

  it('clock mode shows its own period count (two halves) and the optional period length', async () => {
    renderPage({ time_mode: 'clock' });
    expect(screen.getByRole('group', { name: 'Halves' })).toHaveTextContent('2');
    const len = screen.getByLabelText('Half length in minutes');
    await userEvent.type(len, '25');
    await userEvent.tab();
    await waitFor(() => expect(updates).toContainEqual({ period_minutes: 25 }));
    await userEvent.click(screen.getByRole('button', { name: 'Increase Halves' }));
    await waitFor(() => expect(updates).toContainEqual({ clock_periods: 3 }));
    // the period-mode count is never touched from here
    expect(updates.some((u) => typeof u === 'object' && u !== null && 'periods_count' in u)).toBe(false);
  });

  it('is locked while a game is live', async () => {
    liveGame = { id: 'g1' };
    renderPage({ time_mode: 'clock' });
    expect(screen.getByText('Finish the game in progress to change this')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Periods' }));
    await act(settle);
    expect(updates).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Increase Halves' })).toBeDisabled();
  });
});

describe('TeamSetupPage · responsive controls (D88)', () => {
  beforeEach(() => {
    updates.length = 0;
    liveGame = null;
    failNext = null;
  });

  it('three quick stepper taps update the display each time and save once, merged', async () => {
    renderPage({ time_mode: 'clock' });
    const inc = () => screen.getByRole('button', { name: /Increase (Halves|Quarters)/ });
    const group = () => screen.getByRole('group', { name: /Halves|Quarters/ });
    await userEvent.click(inc()); // 2 → 3 (and the label turns into Quarters)
    expect(group()).toHaveTextContent('3');
    await userEvent.click(inc()); // 3 → 4
    await userEvent.click(inc()); // 4 → 6
    expect(group()).toHaveTextContent('6');
    expect(updates).toHaveLength(0);
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({ clock_periods: 6 });
  });

  it('a mode switch and a stepper tap in one burst save as one request', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('radio', { name: 'Clock' }));
    await userEvent.click(screen.getByRole('button', { name: 'Increase Halves' }));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({ time_mode: 'clock', clock_periods: 3 });
  });

  it('a failed save rolls the control back and says so in plain words, never the database text', async () => {
    failNext = { message: 'new row violates check constraint "teams_clock_periods_check"', code: '23514' };
    renderPage({ time_mode: 'clock' });
    await userEvent.click(screen.getByRole('button', { name: 'Increase Halves' }));
    expect(screen.getByRole('group', { name: 'Quarters' })).toHaveTextContent('3');
    await waitFor(() => expect(updates).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole('group', { name: 'Halves' })).toHaveTextContent('2'));
    expect(screen.getByRole('status')).toHaveTextContent(SAVE_FAILED);
    expect(document.body.textContent).not.toMatch(/violates|constraint/);
  });
});
