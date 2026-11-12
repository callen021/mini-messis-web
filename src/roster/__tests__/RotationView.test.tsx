import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionSheetProvider } from '@/components/Sheet';
import { ToastProvider } from '@/components/Toast';
import type * as LineupsApi from '@/lineups/api';
import { type StoredPeriod } from '@/lineups/convert';
import { SPORTS, formationByName } from '@/sports/definitions';
import { type Period } from '@/sports/types';
import { type Player, type Team } from '@/teams/api';
import { TeamProviderForTests, type TeamContextValue } from '@/teams/TeamContext';
import { RotationView } from '../RotationView';

const saveMutate = vi.fn();
const setAvailableMutate = vi.fn();
let periods: StoredPeriod[] = [];

vi.mock('@/lineups/api', async () => {
  const actual = await vi.importActual<typeof LineupsApi>('@/lineups/api');
  const S = SPORTS.soccer;
  const forms = S.formations({ size: 7, gk: true });
  return {
    ...actual,
    useCurrentPlan: () => ({ gameId: null, liveGame: null, periods, isPending: false, error: null }),
    useSavePlan: () => ({ mutate: saveMutate, isPending: false }),
    useFormations: () => ({ forms, formationFor: (n: string) => formationByName(forms, n) }),
  };
});
vi.mock('../api', () => ({
  useSetAvailable: () => ({ mutate: setAvailableMutate }),
  useEveryoneBack: () => ({ mutate: vi.fn() }),
}));

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
const ctx: TeamContextValue = {
  teamId: 't1',
  team,
  sport: 'soccer',
  role: 'coach',
  isOwner: true,
  memberships: [],
  switchTeam: () => undefined,
  adminActing: false,
};
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

const stored = (q: Period, i: number): StoredPeriod => {
  const f = formationByName(SPORTS.soccer.formations({ size: 7, gk: true }), q.formation);
  return {
    ...q,
    lineupId: `l${i}`,
    codes: f.positions.map((p) => p.code),
    roles: f.positions.map((p) => p.role),
    bench: [],
  };
};

function renderView(canEdit = true, highlight = new Set<string>()) {
  return render(
    <ToastProvider>
      <ActionSheetProvider>
        <TeamProviderForTests value={ctx}>
          <RotationView players={players} canEdit={canEdit} highlight={highlight} />
        </TeamProviderForTests>
      </ActionSheetProvider>
    </ToastProvider>,
  );
}

describe('RotationView', () => {
  beforeEach(() => {
    saveMutate.mockReset();
    setAvailableMutate.mockReset();
    periods = [
      stored({ formation: '3-3', slots: ['p1', 'p2', '', '', '', '', 'p3'], auto: [1] }, 0),
      stored({ formation: '3-3', slots: ['p1', '', '', '', '', '', ''], auto: [] }, 1),
      stored({ formation: '3-3', slots: ['', '', '', '', '', '', ''], auto: [] }, 2),
      stored({ formation: '3-3', slots: ['', '', '', '', '', '', ''], auto: [] }, 3),
    ];
  });

  it('renders a chip per period with codes, auto marks, number totals and the balance meter', () => {
    renderView();
    expect(screen.getByRole('button', { name: 'Nolan, Quarter 1: Left wing' })).toHaveClass('on');
    expect(screen.getByRole('button', { name: 'Teddy, Quarter 1: Striker' })).toHaveClass('auto');
    expect(screen.getByRole('button', { name: 'Jack, Quarter 2: sitting out' })).toHaveClass('empty');
    expect(screen.getByLabelText('2 of 4 quarters')).toHaveClass('good'); // Nolan: 2 of 4
    // the bubble shows just the number; "of 4" lives in the column header and the label (D64)
    expect(screen.getByLabelText('2 of 4 quarters')).toHaveTextContent(/^2$/);
    expect(screen.getAllByLabelText('1 of 4 quarters')[0]).toHaveClass('low'); // under half
    expect(document.querySelector('.rothead .total')).toHaveTextContent('Qtrs');
    expect(screen.getByText(/Range/)).toHaveTextContent('1–2');
    expect(screen.getByText('Playing time is reasonably balanced.')).toBeInTheDocument();
    expect(screen.getByText('Out this game')).toBeInTheDocument();
    expect(screen.getByText('Hal')).toBeInTheDocument();
  });

  it('tapping a chip opens the position picker; choosing a taken spot swaps and saves', async () => {
    renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Jack, Quarter 1: Goalkeeper' }));
    const dialog = await screen.findByRole('dialog', { name: 'Jack · Quarter 1' });
    expect(within(dialog).getByRole('button', { name: '* Sitting out' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'LW · Nolan' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'LW · Nolan' }));
    expect(saveMutate).toHaveBeenCalledTimes(1);
    const next = saveMutate.mock.calls[0]?.[0] as Period[];
    expect(next[0]?.slots).toEqual(['p3', 'p2', '', '', '', '', '']); // Jack took LW, Nolan unassigned
    expect(screen.getByRole('status')).toHaveTextContent('Jack in at LW · Nolan unassigned');
  });

  it('"Sitting out" clears the player from that period', async () => {
    renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Nolan, Quarter 2: Left wing' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '* Sitting out' }));
    const next = saveMutate.mock.calls[0]?.[0] as Period[];
    expect(next[1]?.slots).toEqual(['', '', '', '', '', '', '']);
  });

  it('Auto-fill open spots fills every open slot', async () => {
    renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Auto-fill open spots' }));
    const next = saveMutate.mock.calls[0]?.[0] as Period[];
    expect(next.every((q) => q.slots.filter(Boolean).length === 3)).toBe(true); // 3 active players
    expect(screen.getByRole('status')).toHaveTextContent('filled');
  });

  it('the switch marks a player out', async () => {
    renderView();
    await userEvent.click(screen.getByRole('switch', { name: /Teddy is playing today/ }));
    expect(setAvailableMutate).toHaveBeenCalledWith({ id: 'p2', available: false }, expect.anything());
  });

  it('parents get no switches or toolbar, their child is listed first, and a chip tap names the position', async () => {
    renderView(false, new Set(['p3']));
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Auto-fill open spots' })).not.toBeInTheDocument();
    const names = Array.from(document.querySelectorAll('.prow:not(.rothead) .pname')).map(
      (el) => el.textContent ?? '',
    );
    expect(names[0]?.startsWith('Jack')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Nolan, Quarter 1: Left wing' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('LW · Left wing');
    // the auto-fill dot is for staff; parents do not see it (D53)
    expect(screen.getByRole('button', { name: 'Teddy, Quarter 1: Striker' })).not.toHaveClass('auto');
  });

  it('lists only the codes in the plan in the Position key, with the auto-fill note for staff', () => {
    renderView();
    expect(screen.getByText('Position key')).toBeInTheDocument();
    const key = document.querySelector('.poskey') as HTMLElement;
    expect(key).toHaveTextContent('Left wing');
    expect(key).toHaveTextContent('Goalkeeper');
    expect(key).toHaveTextContent('Sweeper');
    expect(key).not.toHaveTextContent('Center back'); // not in a 3-3
    expect(key).toHaveTextContent('dot = picked by Auto-fill');
  });
});
