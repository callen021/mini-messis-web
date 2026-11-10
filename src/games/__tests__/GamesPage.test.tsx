import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionSheetProvider } from '@/components/Sheet';
import { ToastProvider } from '@/components/Toast';
import { useUIStore } from '@/lib/ui-store';
import type * as LineupsApi from '@/lineups/api';
import { SPORTS } from '@/sports/definitions';
import type * as TeamsApi from '@/teams/api';
import { type Team } from '@/teams/api';
import { TeamProviderForTests, type TeamContextValue } from '@/teams/TeamContext';
import type * as GamesApi from '../api';
import { type GameWithScore } from '../api';
import { GamesPage } from '../GamesPage';
import type * as PracticesApi from '../practices';
import { type Practice } from '../practices';

let games: GameWithScore[] = [];
let practices: Practice[] = [];
const createGame = vi.fn();
const createPractices = vi.fn();

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof GamesApi>('../api');
  return {
    ...actual,
    useGames: () => ({ data: games, isPending: false }),
    useCreateGame: () => ({ mutate: createGame, isPending: false }),
    useScoreEvents: () => ({ data: [], isPending: false }),
    useAddScoreEvent: () => ({ mutate: vi.fn(), isPending: false }),
    useDeleteScoreEvent: () => ({ mutate: vi.fn(), isPending: false }),
    useFinishGame: () => ({ mutate: vi.fn(), isPending: false }),
  };
});
vi.mock('../practices', async () => {
  const actual = await vi.importActual<typeof PracticesApi>('../practices');
  return {
    ...actual,
    usePractices: () => ({ data: practices, isPending: false }),
    useCreatePractices: () => ({ mutate: createPractices, isPending: false }),
  };
});
vi.mock('../places', () => ({
  useTeamPlaces: () => ({ data: [], isPending: false }),
  addressFor: () => null,
}));
vi.mock('@/lineups/api', async () => {
  const actual = await vi.importActual<typeof LineupsApi>('@/lineups/api');
  return {
    ...actual,
    useCurrentPlan: () => ({ gameId: null, liveGame: null, periods: [], isPending: false, error: null }),
  };
});
vi.mock('@/teams/api', async () => {
  const actual = await vi.importActual<typeof TeamsApi>('@/teams/api');
  return { ...actual, usePlayers: () => ({ data: [], isPending: false }) };
});

const team: Team = {
  id: 't1',
  name: 'Strikers',
  sport: 'soccer',
  owner_id: 'u1',
  join_code: 'ABCD2345',
  join_code_rotated_at: '',
  join_enabled: true,
  timezone: 'America/Chicago',
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
const ctx = (role: TeamContextValue['role']): TeamContextValue => ({
  teamId: 't1',
  team,
  sport: 'soccer',
  role,
  isOwner: role === 'coach',
  memberships: [],
  switchTeam: () => undefined,
  adminActing: false,
});

const game = (over: Partial<GameWithScore>): GameWithScore =>
  ({
    id: 'g',
    team_id: 't1',
    opponent: 'Tigers',
    game_date: '2030-05-10',
    start_time: '09:00:00',
    location: null,
    home_away: null,
    parent_notes: null,
    status: 'upcoming',
    us: 0,
    them: 0,
    created_at: '2030-01-01T00:00:00Z',
    ...over,
  }) as unknown as GameWithScore;

const practice = (over: Partial<Practice>): Practice => ({
  id: 'p',
  team_id: 't1',
  season_id: 's',
  practice_date: '2030-05-12',
  start_time: '18:30:00',
  end_time: null,
  location: null,
  address: null,
  notes: null,
  status: 'scheduled',
  created_at: '',
  created_by: null,
  updated_at: '',
  updated_by: null,
  ...over,
});

function renderPage(role: TeamContextValue['role'] = 'coach') {
  return render(
    <MemoryRouter initialEntries={['/games']}>
      <ToastProvider>
        <ActionSheetProvider>
          <TeamProviderForTests value={ctx(role)}>
            <GamesPage />
          </TeamProviderForTests>
        </ActionSheetProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useUIStore.setState({ gamesView: 'all' });
  games = [
    game({ id: 'g1', opponent: 'Tigers', game_date: '2030-05-10' }),
    game({ id: 'g0', opponent: 'Bears', game_date: '2026-01-10', status: 'done', us: 2, them: 1 }),
  ];
  practices = [
    practice({ id: 'p1', practice_date: '2030-05-08' }),
    practice({ id: 'p2', practice_date: '2030-05-15', status: 'cancelled' }),
  ];
});

describe('Schedule page', () => {
  it('shows upcoming games and practices together, without completed games', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Schedule view' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Games' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Practices' })).toBeInTheDocument();
    expect(screen.getByText('vs Tigers')).toBeInTheDocument();
    expect(screen.queryByText('vs Bears')).not.toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.getByText(/1 game · 2 practices coming up/)).toBeInTheDocument();
  });

  it('Games hides practices; Practices keeps the cancelled one; the live card stays on top in both', async () => {
    games = [
      ...games,
      game({ id: 'live', opponent: 'Lions', game_date: '2026-11-10', status: 'live', us: 1 }),
    ];
    renderPage();
    expect(screen.getByText('In progress · vs Lions')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Games' }));
    expect(screen.getByText('vs Tigers')).toBeInTheDocument();
    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument();
    expect(screen.getByText('In progress · vs Lions')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Practices' }));
    expect(screen.queryByText('vs Tigers')).not.toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.getByText('In progress · vs Lions')).toBeInTheDocument();
    expect(useUIStore.getState().gamesView).toBe('practices');
  });

  it('the + button is for staff only and opens New game / New practice', async () => {
    const parent = renderPage('parent');
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    parent.unmount();

    renderPage('assistant');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    const sheet = screen.getByRole('dialog', { name: 'Add to the schedule' });
    expect(within(sheet).getByRole('button', { name: 'New practice' })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'New game' }));
    expect(await screen.findByRole('dialog', { name: 'New game' })).toBeInTheDocument();
  });

  it('badges rows by how soon they are, bolds the date line and links directions (D50)', () => {
    const d = new Date();
    const iso = (offset: number) => {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
      return [
        x.getFullYear(),
        String(x.getMonth() + 1).padStart(2, '0'),
        String(x.getDate()).padStart(2, '0'),
      ].join('-');
    };
    games = [
      game({ id: 'today', opponent: 'Lions', game_date: iso(0), address: '1 Main St', location: 'Field 1' }),
      game({ id: 'week', opponent: 'Bears', game_date: iso(4) }),
      game({ id: 'far', opponent: 'Hawks', game_date: iso(20), location: 'Riverside Park' }),
    ];
    practices = [practice({ id: 'tmrw', practice_date: iso(1), location: 'Field 2' })];
    renderPage('parent');
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
    expect(screen.getByText('This week')).toBeInTheDocument();
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('Practice', { selector: '.badge' })).toBeInTheDocument();
    expect(document.querySelectorAll('.when').length).toBe(4);
    const dirs = screen.getAllByRole('link', { name: /^Directions to/ });
    expect(dirs.map((a) => a.getAttribute('href'))).toEqual([
      'https://www.google.com/maps/dir/?api=1&destination=1%20Main%20St',
      'https://www.google.com/maps/dir/?api=1&destination=Field%202',
      'https://www.google.com/maps/dir/?api=1&destination=Riverside%20Park',
    ]);
    expect(dirs[0]).toHaveAttribute('target', '_blank');
  });

  it('Add all to calendar builds one file with every upcoming, non-cancelled event', async () => {
    const created: Blob[] = [];
    const createObjectURL = vi.fn((b: Blob) => {
      created.push(b);
      return 'blob:x';
    });
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    renderPage('parent');
    await userEvent.click(screen.getByRole('button', { name: 'Add all to calendar' }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const text = await created[0]?.text();
    expect(text).toContain('X-WR-CALNAME:Strikers schedule');
    expect(text).toContain('X-WR-TIMEZONE:America/Chicago');
    expect(text?.match(/BEGIN:VEVENT/g)).toHaveLength(2); // Tigers game + the scheduled practice; cancelled one skipped
    expect(text).not.toContain('game-g0'); // completed games are not in the schedule
    expect(screen.getByRole('status')).toHaveTextContent('2 events ready for your calendar');
  });

  it('shows an empty message per segment', async () => {
    games = [];
    practices = [];
    renderPage();
    expect(screen.getByText('Nothing scheduled. Tap + to add a game or a practice.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Practices' }));
    expect(screen.getByText('No upcoming practices.')).toBeInTheDocument();
  });
});
