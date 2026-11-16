import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SPORTS } from '@/sports/definitions';
import { type Player } from '@/teams/api';
import { type StatEvent } from '../api';
import { EditStatSheet } from '../EditStatSheet';
import { makeNameLookup } from '../names';

const mk = (id: string, first_name: string, n: string): Player => ({
  id,
  team_id: 't',
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
const players = [mk('p1', 'Ada', '1'), mk('p2', 'Bea', '2')];
const names = makeNameLookup(players);
const ev: StatEvent = {
  id: 's1',
  game_id: 'g',
  player_id: 'p1',
  period_index: 1,
  stat_type: 'rebound',
  clock_seconds: null,
  occurred_at: '',
  created_by: null,
  created_at: '',
  updated_at: '',
  updated_by: null,
};

describe('EditStatSheet (D118)', () => {
  it('seeds from the entry, changes the player and the kind, saves a patch; delete asks the page', async () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    render(
      <EditStatSheet
        event={ev}
        onClose={vi.fn()}
        S={SPORTS.basketball}
        periodCount={4}
        players={players}
        names={names}
        tracked={['rebound', 'assist']}
        onSave={onSave}
        onDelete={onDelete}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Edit rebound' });
    expect(within(dialog).getByRole('radio', { name: '#1 Ada' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(within(dialog).getByRole('radio', { name: '#2 Bea' }));
    await userEvent.click(
      within(within(dialog).getByRole('radiogroup', { name: 'Stat' })).getByRole('radio', { name: 'assist' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith({ player_id: 'p2', period_index: 1, stat_type: 'assist' });
    await userEvent.click(within(dialog).getByRole('button', { name: /Delete this/ }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('an entry of a stat no longer tracked still offers its own kind', () => {
    render(
      <EditStatSheet
        event={{ ...ev, stat_type: 'foul' }}
        onClose={vi.fn()}
        S={SPORTS.basketball}
        periodCount={4}
        players={players}
        names={names}
        tracked={['rebound']}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Stat' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['REB', 'FOUL']);
    expect(within(group).getByRole('radio', { name: 'foul' })).toHaveAttribute('aria-checked', 'true');
  });
});
