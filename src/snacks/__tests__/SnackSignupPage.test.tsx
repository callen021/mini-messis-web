import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Guards from '@/auth/guards';
import { ActionSheetProvider } from '@/components/Sheet';
import { ToastProvider } from '@/components/Toast';
import type * as TeamsApi from '@/teams/api';
import { type Team } from '@/teams/api';
import { TeamProviderForTests, type TeamContextValue } from '@/teams/TeamContext';
import { SnackSignupPage } from '../SnackSignupPage';

let staff = false;
let mode: Team['snack_signup'] = 'games';
const setSnack = vi.fn();
const clearSnack = vi.fn();
const game = (id: string, opponent: string, date: string, snack: string | null, flagged = false) => ({
  id,
  team_id: 't1',
  season_id: 's1',
  opponent,
  game_date: date,
  start_time: '10:00:00',
  status: 'upcoming',
  snack_player_id: snack,
  snack_flagged: flagged,
  us: 0,
  them: 0,
});
let games = [
  game('g1', 'Tigers', '2030-05-10', null),
  game('g2', 'Bears', '2030-05-17', 'p1'),
  game('g3', 'Owls', '2030-05-24', 'p2'),
];
const practices = [
  {
    id: 'pr1',
    team_id: 't1',
    season_id: 's1',
    practice_date: '2030-05-12',
    start_time: '18:00:00',
    end_time: null,
    status: 'scheduled',
    snack_player_id: null,
    snack_flagged: false,
  },
];

vi.mock('@/auth/guards', async () => {
  const actual = await vi.importActual<typeof Guards>('@/auth/guards');
  return { ...actual, useIsStaff: () => staff };
});
vi.mock('@/games/api', () => ({
  useGames: () => ({ data: games, isPending: false }),
  useCurrentSeason: () => ({ data: { id: 's1', name: 'Spring' } }),
}));
vi.mock('@/games/practices', () => ({ usePractices: () => ({ data: practices, isPending: false }) }));
vi.mock('@/teams/api', async () => {
  const actual = await vi.importActual<typeof TeamsApi>('@/teams/api');
  return {
    ...actual,
    usePlayers: () => ({
      data: [
        { id: 'p1', first_name: 'Nolan', archived_at: null },
        { id: 'p2', first_name: 'Ava', archived_at: null },
      ],
      isPending: false,
    }),
  };
});
vi.mock('@/lineups/api', () => ({ useMyChildren: () => ({ data: new Set(['p1']) }) }));
vi.mock('@/players/api', () => ({
  useTeamAllergySummary: () => ({ data: { allergens: ['peanuts'], others: [], unanswered: true } }),
}));
vi.mock('../api', () => ({
  useSnackCap: () => ({ data: 2 }),
  useSetSnack: () => ({ mutate: setSnack, isPending: false }),
  useClearSnack: () => ({ mutate: clearSnack, isPending: false }),
}));

function renderPage() {
  const team = { id: 't1', name: 'Strikers', sport: 'soccer', snack_signup: mode } as unknown as Team;
  const ctx: TeamContextValue = {
    teamId: 't1',
    team,
    sport: 'soccer',
    role: staff ? 'coach' : 'parent',
    isOwner: staff,
    memberships: [],
    switchTeam: () => undefined,
    statKeeper: false,
    userId: 'u-coach',
    adminActing: false,
  };
  render(
    <MemoryRouter>
      <ToastProvider>
        <ActionSheetProvider>
          <TeamProviderForTests value={ctx}>
            <SnackSignupPage />
          </TeamProviderForTests>
        </ActionSheetProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}
const row = (name: RegExp) => screen.getByRole('button', { name });

describe('SnackSignupPage (D115)', () => {
  beforeEach(() => {
    staff = false;
    mode = 'games';
    setSnack.mockReset();
    clearSnack.mockReset();
  });

  it('lists the eligible upcoming events with Open or the family, the allergy summary on top, and the share', () => {
    renderPage();
    expect(screen.getByText('Allergies on the team')).toBeInTheDocument();
    expect(screen.getByText('Peanuts · Not every family has answered.')).toBeInTheDocument();
    expect(row(/vs Tigers.*snacks Open$/)).toBeInTheDocument();
    expect(row(/vs Bears.*Nolan’s family \(yours\)/)).toHaveTextContent('Nolan’s family · you');
    expect(row(/vs Owls.*Ava’s family$/)).toBeInTheDocument();
    // games only: the practice is not on the list
    expect(screen.queryByText('Practice')).not.toBeInTheDocument();
    expect(screen.getByText(/Your family: 1 of 2 this season/)).toBeInTheDocument();
  });

  it('one tap claims an open event for the family; one tap on your own asks to release it', async () => {
    renderPage();
    await userEvent.click(row(/vs Tigers/));
    expect(setSnack).toHaveBeenCalledWith(
      { event: { kind: 'game', id: 'g1' }, playerId: 'p1' },
      expect.anything(),
    );
    await userEvent.click(row(/vs Bears/));
    const sheet = screen.getByRole('dialog', { name: 'Release the snack slot?' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Release' }));
    expect(clearSnack).toHaveBeenCalledWith({ kind: 'game', id: 'g2' }, expect.anything());
    // another family's slot only says who has it
    await userEvent.click(row(/vs Owls/));
    expect(setSnack).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.toast')).toHaveTextContent('Ava’s family has this one');
  });

  it('games and practices: the practice joins the list', () => {
    mode = 'both';
    renderPage();
    expect(row(/^Practice,.*snacks Open$/)).toBeInTheDocument();
  });

  it('a coach taps any event to assign a family or clear it, and sees the flag', async () => {
    staff = true;
    games = [...games.slice(0, 2), game('g3', 'Owls', '2030-05-24', 'p2', true)];
    renderPage();
    expect(row(/vs Owls/)).toHaveTextContent('the family can’t make it');
    await userEvent.click(row(/vs Tigers/));
    const sheet = screen.getByRole('dialog', { name: 'Who brings snacks?' });
    expect(within(sheet).queryByRole('button', { name: 'Clear the slot' })).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Ava’s family' }));
    expect(setSnack).toHaveBeenCalledWith(
      { event: { kind: 'game', id: 'g1' }, playerId: 'p2' },
      expect.anything(),
    );
    await userEvent.click(row(/vs Bears/));
    const sheet2 = screen.getByRole('dialog', { name: 'Who brings snacks?' });
    await userEvent.click(within(sheet2).getByRole('button', { name: 'Clear the slot' }));
    expect(clearSnack).toHaveBeenCalledWith({ kind: 'game', id: 'g2' }, expect.anything());
  });

  it('off: a plain note', () => {
    mode = 'off';
    renderPage();
    expect(screen.getByText('Snack signup is off for this team.')).toBeInTheDocument();
  });
});
