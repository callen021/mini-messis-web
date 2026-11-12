import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import type * as LineupsApi from '@/lineups/api';
import type * as TeamsApi from '@/teams/api';
import { SPORTS } from '@/sports/definitions';
import { type Team } from '@/teams/api';
import { TeamProviderForTests, type TeamContextValue } from '@/teams/TeamContext';
import { TeamSetupPage } from '../TeamSetupPage';

const updates: unknown[] = [];
let liveGame: { id: string } | null = null;

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (patch: unknown) => {
        updates.push(patch);
        return { eq: async () => ({ error: null }) };
      },
    }),
  },
  errorMessage: (e: unknown) => String(e),
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

function renderPage(team: Partial<Team> = {}) {
  const t = { ...base, ...team };
  const ctx: TeamContextValue = {
    teamId: 't1',
    team: t,
    sport: 'soccer',
    role: 'coach',
    isOwner: true,
    memberships: [],
    switchTeam: () => undefined,
    adminActing: false,
  };
  const qc = new QueryClient();
  qc.setQueryData(['team', 't1'], t);
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <TeamProviderForTests value={ctx}>
            <TeamSetupPage />
          </TeamProviderForTests>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('TeamSetupPage · track playing time by (D65)', () => {
  beforeEach(() => {
    updates.length = 0;
    liveGame = null;
  });

  it('period mode shows the quarters stepper and no clock rows', () => {
    renderPage();
    expect(screen.getByRole('radio', { name: 'Periods' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('group', { name: 'Quarters' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/length in minutes/)).not.toBeInTheDocument();
  });

  it('switching to the clock saves the mode', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('radio', { name: 'Clock' }));
    expect(updates).toContainEqual({ time_mode: 'clock' });
  });

  it('clock mode shows its own period count (two halves) and the optional period length', async () => {
    renderPage({ time_mode: 'clock' });
    expect(screen.getByRole('group', { name: 'Halves' })).toHaveTextContent('2');
    const len = screen.getByLabelText('Half length in minutes');
    await userEvent.type(len, '25');
    await userEvent.tab();
    expect(updates).toContainEqual({ period_minutes: 25 });
    await userEvent.click(screen.getByRole('button', { name: 'Increase Halves' }));
    expect(updates).toContainEqual({ clock_periods: 3 });
    // the period-mode count is never touched from here
    expect(updates.some((u) => typeof u === 'object' && u !== null && 'periods_count' in u)).toBe(false);
  });

  it('is locked while a game is live', async () => {
    liveGame = { id: 'g1' };
    renderPage({ time_mode: 'clock' });
    expect(screen.getByText('Finish the game in progress to change this')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Periods' }));
    expect(updates).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Increase Halves' })).toBeDisabled();
  });
});
