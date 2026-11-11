import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { type Player } from '@/teams/api';
import { type SkillTest } from '../defaults';
import { RecordSessionSheet } from '../RecordSessionSheet';

const mk = (over: Partial<SkillTest>): SkillTest => ({
  id: 't1',
  team_id: 'team',
  key: 'k',
  name: 'Test',
  instructions: '',
  metric: 'count',
  unit: null,
  has_sides: false,
  higher_is_better: true,
  attempts: 5,
  sort_order: 0,
  is_active: true,
  created_at: '',
  updated_at: '',
  updated_by: null,
  ...over,
});
const tests = [
  mk({ id: 'jug', key: 'juggling', name: 'Juggling' }),
  mk({ id: 'pass', key: 'passing', name: 'Passing accuracy', metric: 'made_of_attempted', has_sides: true }),
  mk({ id: 'sprint', key: 'sprint', name: 'Sprint speed', metric: 'time_seconds', higher_is_better: false }),
];
const player = (id: string, first_name: string, n: string): Player => ({
  id,
  team_id: 'team',
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
const players = [player('a', 'Ava', '1'), player('b', 'Ben', '2'), player('c', 'Cal', '3')];

describe('RecordSessionSheet (D62)', () => {
  it('lists every player for a count test, skips blank rows and saves the rest in one go', async () => {
    const onSave = vi.fn();
    render(
      <RecordSessionSheet
        open
        onClose={vi.fn()}
        tests={tests}
        players={players}
        testId="jug"
        onSave={onSave}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Record results' });
    expect(within(dialog).getByRole('combobox', { name: 'Test' })).toHaveValue('jug');
    expect(within(dialog).getAllByRole('spinbutton')).toHaveLength(3);
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    const ava = within(dialog).getByRole('spinbutton', { name: 'Ava value' });
    await userEvent.type(ava, '12');
    // Enter moves to the next player
    await userEvent.keyboard('{Enter}');
    expect(within(dialog).getByRole('spinbutton', { name: 'Ben value' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.type(within(dialog).getByRole('spinbutton', { name: 'Cal value' }), '7');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save 2 results' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const rows = onSave.mock.calls[0]?.[0] as { player_id: string; value: number; side: null }[];
    expect(rows.map((r) => [r.player_id, r.value])).toEqual([
      ['a', 12],
      ['c', 7],
    ]);
    expect(rows.every((r) => r.side === null)).toBe(true);
  });

  it('a two-sided made-of-attempted test gets right and left inputs with attempts', async () => {
    const onSave = vi.fn();
    render(
      <RecordSessionSheet
        open
        onClose={vi.fn()}
        tests={tests}
        players={players.slice(0, 1)}
        onSave={onSave}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Record results' });
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Test' }), 'pass');
    expect(within(dialog).getByRole('spinbutton', { name: 'Ava right value' })).toBeInTheDocument();
    expect(within(dialog).getByRole('spinbutton', { name: 'Ava left attempts' })).toHaveValue(5);
    await userEvent.type(within(dialog).getByRole('spinbutton', { name: 'Ava right value' }), '4');
    await userEvent.type(within(dialog).getByRole('spinbutton', { name: 'Ava left value' }), '3');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save 2 results' }));
    const rows = onSave.mock.calls[0]?.[0] as { side: string; value: number; attempts: number }[];
    expect(rows).toEqual([
      expect.objectContaining({ side: 'right', value: 4, attempts: 5 }),
      expect.objectContaining({ side: 'left', value: 3, attempts: 5 }),
    ]);
  });

  it('a time test takes decimals', async () => {
    const onSave = vi.fn();
    render(
      <RecordSessionSheet
        open
        onClose={vi.fn()}
        tests={tests}
        players={players.slice(0, 1)}
        testId="sprint"
        onSave={onSave}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Record results' });
    const input = within(dialog).getByRole('spinbutton', { name: 'Ava value' });
    expect(input).toHaveAttribute('inputmode', 'decimal');
    await userEvent.type(input, '12.4');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save 1 result' }));
    expect(onSave.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ value: 12.4, skill_test_id: 'sprint' }),
    ]);
  });
});
