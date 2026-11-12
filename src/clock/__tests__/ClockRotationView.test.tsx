import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionSheetProvider } from '@/components/Sheet';
import { ToastProvider } from '@/components/Toast';
import { SPORTS } from '@/sports/definitions';
import { type Player, type Team } from '@/teams/api';
import { TeamProviderForTests, type TeamContextValue } from '@/teams/TeamContext';
import { ClockRotationView } from '../ClockRotationView';
import { type ClockState, type Stint } from '../clock';

let liveGame: { id: string; opponent: string } | null = null;
let doneGames: {
  id: string;
  opponent: string;
  status: string;
  game_date: string;
  created_at: string;
  us: number;
  them: number;
}[] = [];
let clock: ClockState = { periodIndex: 0, clockSeconds: 0, runningSince: null, periodLengths: [] };
let stints: Stint[] = [];

vi.mock('@/lineups/api', () => ({ useLiveGame: () => ({ data: liveGame, isPending: false }) }));
vi.mock('@/games/api', () => ({ useGames: () => ({ data: doneGames, isPending: false }) }));
vi.mock('@/roster/api', () => ({
  useSetAvailable: () => ({ mutate: vi.fn() }),
  useEveryoneBack: () => ({ mutate: vi.fn() }),
}));
vi.mock('../api', () => ({
  useGameClock: () => ({ data: clock, isPending: false }),
  useStints: () => ({ data: stints, isPending: false }),
}));
vi.mock('../useNow', () => ({ useServerNow: () => Date.parse('2026-11-12T15:00:00Z') }));

const mk = (id: string, first_name: string, n: string, is_available = true): Player => ({
  id,
  team_id: 't1',
  first_name,
  last_name: null,
  jersey_number: n,
  is_available,
  batting_order: null,
  sort_order: 0,
  archived_at: null,
  created_at: '',
  updated_at: '',
  updated_by: null,
});
const players = [
  mk('p1', 'Nolan', '1'),
  mk('p2', 'Teddy', '2'),
  mk('p3', 'Jack', '3'),
  mk('p4', 'Hal', '4', false),
];
const team: Team = {
  id: 't1',
  name: 'Strikers',
  sport: 'soccer',
  owner_id: 'u1',
  join_code: 'ABCD2345',
  join_code_rotated_at: '',
  join_enabled: true,
  timezone: 'America/Chicago',
  parent_stats: 'own',
  time_mode: 'clock',
  clock_periods: 2,
  period_minutes: 25,
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
const stint = (over: Partial<Stint>): Stint => ({
  id: Math.random().toString(36),
  player_id: 'p',
  period_index: 0,
  slot_index: 0,
  position_role: 'ST',
  position_code: 'LW',
  clock_start: 0,
  clock_end: null,
  ...over,
});

function renderView(canEdit = true, highlight = new Set<string>()) {
  const ctx: TeamContextValue = {
    teamId: 't1',
    team,
    sport: 'soccer',
    role: canEdit ? 'coach' : 'parent',
    isOwner: canEdit,
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
              <ClockRotationView players={players} canEdit={canEdit} highlight={highlight} />
            </TeamProviderForTests>
          </MemoryRouter>
        </ActionSheetProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('ClockRotationView (D72)', () => {
  beforeEach(() => {
    liveGame = { id: 'g1', opponent: 'Tigers' };
    doneGames = [];
    clock = { periodIndex: 0, clockSeconds: 600, runningSince: null, periodLengths: [] };
    stints = [
      stint({ player_id: 'p1', clock_start: 0 }), // on the field for 10:00
      stint({ player_id: 'p2', clock_start: 0, clock_end: 300 }),
      stint({ player_id: 'p2', clock_start: 420, clock_end: 600 }),
    ];
  });

  it('one row per player: minutes as a bar, shifts, on-field dot; a minutes balance', () => {
    renderView();
    expect(screen.getByText('Playing time · vs Tigers · H1 10:00')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Nolan: 10 min, 1 shift, on the field at LW' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Teddy: 8 min, 2 shifts' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Jack: 0 min, 0 shifts' })).toBeInTheDocument();
    const rows = document.querySelectorAll('.minrow');
    expect(rows[0]).toHaveClass('onfield');
    expect(rows[1]).not.toHaveClass('onfield');
    const bars = Array.from(document.querySelectorAll<HTMLElement>('.minbar i')).map((i) => i.style.width);
    expect(bars).toEqual(['100%', '80%', '0%']);
    expect(screen.getByText(/Range/)).toHaveTextContent('0–10');
    expect(
      screen.getByText('Consider giving more time to the players with fewer minutes.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Out this game')).toBeInTheDocument();
    expect(screen.getByText('Hal')).toBeInTheDocument();
  });

  it('parents see it read-only with their own child first', () => {
    renderView(false, new Set(['p3']));
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    const names = Array.from(document.querySelectorAll('.minrow .pname')).map((n) => n.textContent);
    expect(names[0]).toMatch(/^Jack/);
    expect(document.querySelector('.minrow')).toHaveClass('mine');
  });

  it('with no live game it shows the last completed game, and nothing before the first', () => {
    liveGame = null;
    doneGames = [
      {
        id: 'g0',
        opponent: 'Bears',
        status: 'done',
        game_date: '2026-11-01',
        created_at: '',
        us: 1,
        them: 0,
      },
    ];
    clock = { periodIndex: 2, clockSeconds: 0, runningSince: null, periodLengths: [1500, 1500] };
    renderView();
    expect(screen.getByText('Playing time · last game vs Bears')).toBeInTheDocument();
    doneGames = [];
    renderView();
    expect(screen.getByText('Minutes appear here once a game is on the clock.')).toBeInTheDocument();
  });
});
