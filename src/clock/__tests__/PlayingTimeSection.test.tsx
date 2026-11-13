import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { makeNameLookup } from '@/games/names';
import type * as LineupsApi from '@/lineups/api';
import { type StoredPeriod } from '@/lineups/convert';
import { type Player, type Team } from '@/teams/api';
import { TeamProviderForTests, type TeamContextValue } from '@/teams/TeamContext';
import { type ClockState, type Stint } from '../clock';
import { PlayingTimeSection } from '../PlayingTimeSection';

const correct = vi.fn();
let clock: ClockState = { periodIndex: 2, clockSeconds: 0, runningSince: null, periodLengths: [1500, 1500] };
let stints: Stint[] = [];
vi.mock('../api', () => ({
  useGameClock: () => ({ data: clock, isPending: false }),
  useStints: () => ({ data: stints, isPending: false }),
  useStintCorrections: () => ({ mutate: correct, isPending: false }),
  useFormationChanges: () => ({ data: [], isPending: false }),
}));
vi.mock('@/lineups/api', async () => {
  const actual = await vi.importActual<typeof LineupsApi>('@/lineups/api');
  return {
    ...actual,
    useFormations: () => ({ forms: [], formationFor: () => ({ name: '', w: 0, positions: [] }) }),
  };
});
vi.mock('../useNow', () => ({ useServerNow: () => Date.parse('2026-11-12T15:00:00Z') }));

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
const players = [mk('p1', 'Nolan', '1'), mk('p2', 'Teddy', '2'), mk('p3', 'Jack', '3')];
const names = makeNameLookup(players);
const team = {
  id: 't1',
  sport: 'soccer',
  time_mode: 'clock',
  clock_periods: 2,
  colors: {},
} as unknown as Team;
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
const periods: StoredPeriod[] = [
  {
    lineupId: 'l0',
    formation: '1-1',
    slots: ['p1', 'p2', ''],
    auto: [],
    codes: ['ST', 'SW', 'GK'],
    roles: ['ST', 'DEF', 'GK'],
    bench: [],
  },
  {
    lineupId: 'l1',
    formation: '1-1',
    slots: ['p1', 'p2', ''],
    auto: [],
    codes: ['ST', 'SW', 'GK'],
    roles: ['ST', 'DEF', 'GK'],
    bench: [],
  },
];
const stint = (over: Partial<Stint>): Stint => ({
  id: Math.random().toString(36),
  player_id: 'p1',
  period_index: 0,
  slot_index: 0,
  position_role: 'ST',
  position_code: 'ST',
  clock_start: 0,
  clock_end: 1500,
  ...over,
});

function renderSection(status: 'live' | 'done' = 'done', canEdit = true) {
  render(
    <ToastProvider>
      <TeamProviderForTests value={ctx}>
        <PlayingTimeSection
          gameId="g1"
          status={status}
          players={players}
          names={names}
          periods={periods}
          canEdit={canEdit}
        />
      </TeamProviderForTests>
    </ToastProvider>,
  );
}

describe('PlayingTimeSection (D67, D75)', () => {
  beforeEach(() => {
    correct.mockReset();
    clock = { periodIndex: 2, clockSeconds: 0, runningSince: null, periodLengths: [1500, 1500] };
    stints = [
      stint({ id: 's1', player_id: 'p1', clock_start: 0, clock_end: 1500 }),
      stint({ id: 's2', player_id: 'p1', period_index: 1, clock_start: 0, clock_end: 600 }),
      stint({
        id: 's3',
        player_id: 'p2',
        slot_index: 1,
        position_code: 'SW',
        clock_start: 0,
        clock_end: 900,
      }),
    ];
  });

  it('lists the starters and minutes per player, most first', () => {
    renderSection();
    expect(screen.getByText('Starters · 1-1')).toBeInTheDocument();
    const rows = screen.getAllByRole('button');
    expect(rows[0]).toHaveTextContent('Nolan');
    expect(rows[0]).toHaveTextContent('35 min');
    expect(rows[0]).toHaveTextContent('2 shifts');
    expect(rows[1]).toHaveTextContent('Teddy');
    expect(rows[1]).toHaveTextContent('15 min');
    expect(rows[2]).toHaveTextContent('Jack');
    expect(rows[2]).toHaveTextContent('0 min');
  });

  it('is read-only while live and for parents', () => {
    renderSection('live', true);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Playing time · live')).toBeInTheDocument();
  });

  it('editing a stint checks it before the call; a good edit is one update call', async () => {
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: /Nolan/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Nolan · playing time' });
    const to = within(sheet).getByLabelText('H2 · ST to');
    await userEvent.clear(to);
    await userEvent.type(to, '26:00');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(correct).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/inside the period \(25:00/);
    await userEvent.clear(to);
    await userEvent.type(to, '12:30');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(correct).toHaveBeenCalledWith({ kind: 'update', id: 's2', start: 0, end: 750 }, expect.anything());
  });

  it('adds a stint for a player who had none, and deletes one', async () => {
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: /Jack/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Jack · playing time' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add a stint' }));
    await userEvent.selectOptions(within(sheet).getByLabelText('Half'), '1');
    await userEvent.selectOptions(within(sheet).getByLabelText('Position'), 'GK');
    await userEvent.type(within(sheet).getByLabelText('To (m:ss)'), '10:00');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save stint' }));
    expect(correct).toHaveBeenCalledWith(
      { kind: 'add', playerId: 'p3', period: 1, code: 'GK', start: 0, end: 600 },
      expect.anything(),
    );
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: /Teddy/ }));
    const sheet2 = await screen.findByRole('dialog', { name: 'Teddy · playing time' });
    await userEvent.click(within(sheet2).getByRole('button', { name: 'Delete H1 · SW stint' }));
    expect(correct).toHaveBeenCalledWith({ kind: 'delete', id: 's3' }, expect.anything());
  });
});
