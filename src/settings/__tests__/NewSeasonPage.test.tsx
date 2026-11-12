import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionSheetProvider } from '@/components/Sheet';
import type * as RosterApi from '@/roster/api';
import type * as TeamsApi from '@/teams/api';
import { ToastProvider } from '@/components/Toast';
import { SPORTS } from '@/sports/definitions';
import { type Player, type Team } from '@/teams/api';
import { TeamProviderForTests, type TeamContextValue } from '@/teams/TeamContext';
import { NewSeasonPage } from '../NewSeasonPage';
import { defaultSeasonName, seasonSummary } from '../season';

const start = vi.fn();
let liveGame: { id: string } | null = null;
let losing: { user_id: string; display_name: string; children: string[] }[] = [];

vi.mock('@/games/api', () => ({
  useCurrentSeason: () => ({ data: { id: 's1', name: '2026 season', is_current: true }, isPending: false }),
  useStartSeason: () => ({ mutate: start, isPending: false }),
}));
vi.mock('@/lineups/api', () => ({ useLiveGame: () => ({ data: liveGame, isPending: false }) }));
vi.mock('@/roster/api', async () => {
  const actual = await vi.importActual<typeof RosterApi>('@/roster/api');
  return { ...actual, parentsLosingAccess: async () => losing };
});
const mk = (id: string, first_name: string, n: string): Player => ({
  id,
  team_id: 't1',
  first_name,
  last_name: null,
  jersey_number: n,
  is_available: true,
  batting_order: null,
  sort_order: 0,
  archived_at: null,
  created_at: '',
  updated_at: '',
  updated_by: null,
});
const players = [mk('p1', 'Ann', '1'), mk('p2', 'Bo', '2'), mk('p3', 'Cy', '3')];
vi.mock('@/teams/api', async () => {
  const actual = await vi.importActual<typeof TeamsApi>('@/teams/api');
  return { ...actual, usePlayers: () => ({ data: players, isPending: false }) };
});

const team = {
  id: 't1',
  name: 'Strikers',
  sport: 'soccer',
  colors: SPORTS.soccer.defaultColors,
  time_mode: 'periods',
  periods_count: 4,
  clock_periods: 2,
  side_size: 7,
  has_gk: true,
} as Team;

function renderPage(role: 'coach' | 'assistant' = 'coach') {
  const ctx: TeamContextValue = {
    teamId: 't1',
    team,
    sport: 'soccer',
    role,
    isOwner: true,
    memberships: [],
    switchTeam: () => undefined,
    adminActing: false,
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <ActionSheetProvider>
          <MemoryRouter>
            <TeamProviderForTests value={ctx}>
              <NewSeasonPage />
            </TeamProviderForTests>
          </MemoryRouter>
        </ActionSheetProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('season helpers (D94)', () => {
  it('suggests the next year from the current season name', () => {
    expect(defaultSeasonName('2026 season', new Date('2026-11-12'))).toBe('2027 season');
    expect(defaultSeasonName('Spring', new Date('2026-11-12'))).toBe('2026 season');
    expect(defaultSeasonName(null, new Date('2026-11-12'))).toBe('2026 season');
  });

  it('writes the confirmation: returning, not returning, parents losing access', () => {
    const text = seasonSummary(
      '2027 season',
      2,
      [{ first_name: 'Ann' }],
      'Pat loses access to the team: this is their only child here.',
    );
    expect(text).toContain('2 players returning');
    expect(text).toContain('1 not returning (Ann)');
    expect(text).toContain('Pat loses access');
    expect(text).toContain('2027 season starts with an empty schedule');
    expect(seasonSummary('X', 1, [], '')).toMatch(/^1 player returning\. X starts/);
  });
});

describe('NewSeasonPage (D94)', () => {
  beforeEach(() => {
    start.mockReset();
    liveGame = null;
    losing = [];
  });

  it('asks for a name and dates, then a roster review with every player returning by default', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Start new season' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveAttribute(
      'placeholder',
      `${new Date().getFullYear() + 1} season`,
    );
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText(/Roster review · 3 of 3 returning/)).toBeInTheDocument();
    for (const n of ['Ann', 'Bo', 'Cy'])
      expect(screen.getByRole('switch', { name: `${n} returning` })).toHaveAttribute('aria-checked', 'true');
  });

  it('refuses an end date before the start date', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText('Starts (optional)'), '2027-03-01');
    await userEvent.type(screen.getByLabelText('Ends (optional)'), '2027-02-01');
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('cannot end before it starts');
  });

  it('confirms with the not-returning players and the parents who lose access, then starts the season', async () => {
    losing = [{ user_id: 'u9', display_name: 'Pat', children: ['Ann'] }];
    renderPage();
    await userEvent.type(screen.getByLabelText('Name'), 'Spring 2027');
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    await userEvent.click(screen.getByRole('switch', { name: 'Ann returning' }));
    expect(screen.getByText(/2 of 3 returning/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start Spring 2027' }));
    const dialog = await screen.findByRole('dialog', { name: 'Start Spring 2027?' });
    expect(dialog).toHaveTextContent('1 not returning (Ann)');
    expect(dialog).toHaveTextContent('Pat loses access to the team');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start Spring 2027' }));
    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(start.mock.calls[0]?.[0]).toEqual({
      name: 'Spring 2027',
      startsOn: null,
      endsOn: null,
      notReturning: ['p1'],
    });
  });

  it('is not available while a game is live, and not to an assistant', () => {
    liveGame = { id: 'g1' };
    renderPage();
    expect(screen.getByText('Finish the game in progress first')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Next/ })).not.toBeInTheDocument();
  });
});
