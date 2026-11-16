import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Guards from '@/auth/guards';
import { ToastProvider } from '@/components/Toast';
import { NO_ELIGIBILITY, withLevel } from '@/players/eligibility';
import { type Team } from '@/teams/api';
import { TeamProviderForTests, type TeamContextValue } from '@/teams/TeamContext';
import { EligibilitySection } from '@/players/EligibilitySection';
import { PositionsPage } from '../PositionsPage';

let staff = true;
let elig = withLevel(NO_ELIGIBILITY, 'p1', 'GK', 'never');
const set = vi.fn();

vi.mock('@/auth/guards', async () => {
  const actual = await vi.importActual<typeof Guards>('@/auth/guards');
  return { ...actual, useIsStaff: () => staff };
});
vi.mock('@/teams/api', () => ({
  usePlayers: () => ({
    data: [
      { id: 'p1', first_name: 'Nolan', jersey_number: '7', is_available: true, archived_at: null },
      { id: 'p2', first_name: 'Ava', jersey_number: null, is_available: false, archived_at: null },
    ],
    isPending: false,
  }),
}));
vi.mock('@/players/api', () => ({
  useEligibility: () => ({ data: elig, isPending: false }),
  useSetEligibility: () => ({ mutate: set, isPending: false }),
}));

const team = { id: 't1', sport: 'soccer', name: 'Strikers' } as unknown as Team;
const ctx = (sport: 'soccer' | 'basketball'): TeamContextValue => ({
  teamId: 't1',
  team: { ...team, sport },
  sport,
  role: staff ? 'coach' : 'parent',
  isOwner: true,
  memberships: [],
  switchTeam: () => undefined,
  statKeeper: false,
  adminActing: false,
});
const renderPage = (sport: 'soccer' | 'basketball' = 'soccer') =>
  render(
    <MemoryRouter initialEntries={['/team/positions']}>
      <ToastProvider>
        <TeamProviderForTests value={ctx(sport)}>
          <Routes>
            <Route path="/team/positions" element={<PositionsPage />} />
            <Route path="/team" element={<p>Team tab</p>} />
          </Routes>
        </TeamProviderForTests>
      </ToastProvider>
    </MemoryRouter>,
  );

describe('PositionsPage (D117)', () => {
  beforeEach(() => {
    staff = true;
    elig = withLevel(NO_ELIGIBILITY, 'p1', 'GK', 'never');
    set.mockReset();
  });

  it('shows the roster down and the sport’s groups across, in the coach’s words', () => {
    renderPage();
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['Player', 'Goalie', 'Defense', 'Midfield', 'Forward']);
    expect(screen.getByRole('rowheader', { name: /Nolan/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nolan Goalie: never' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Nolan Defense: can play' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Ava Goalie: can play' })).toBeInTheDocument();
  });

  it('a tap toggles the cell: can play → never, never → can play', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Ava Forward: can play' }));
    expect(set).toHaveBeenCalledWith({ playerId: 'p2', group: 'ST', level: 'never' }, expect.anything());
    await userEvent.click(screen.getByRole('button', { name: 'Nolan Goalie: never' }));
    expect(set).toHaveBeenCalledWith({ playerId: 'p1', group: 'GK', level: 'can' }, expect.anything());
  });

  it('basketball has Guard, Forward, Center', () => {
    renderPage('basketball');
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Player',
      'Guard',
      'Forward',
      'Center',
    ]);
  });

  it('a parent is sent back to the Team tab', () => {
    staff = false;
    renderPage();
    expect(screen.getByText('Team tab')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('EligibilitySection on the player card (D117)', () => {
  beforeEach(() => {
    elig = withLevel(NO_ELIGIBILITY, 'p1', 'GK', 'never');
    set.mockReset();
  });

  it('one chip per group, off for never; a tap flips it', async () => {
    render(
      <ToastProvider>
        <EligibilitySection playerId="p1" playerName="Nolan" teamId="t1" sport="soccer" />
      </ToastProvider>,
    );
    const chips = screen.getByRole('group', { name: 'Nolan’s positions' });
    expect(chips.querySelectorAll('.achip')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Goalie: never' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Forward: can play' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Forward: can play' }));
    expect(set).toHaveBeenCalledWith({ playerId: 'p1', group: 'ST', level: 'never' }, expect.anything());
  });
});
