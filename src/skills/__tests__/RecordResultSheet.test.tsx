import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { type SkillTest } from '../defaults';
import { RecordResultSheet } from '../RecordResultSheet';

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

describe('RecordResultSheet', () => {
  it('records a count for the preselected test', async () => {
    const onSave = vi.fn();
    render(
      <RecordResultSheet
        open
        onClose={vi.fn()}
        playerId="p1"
        playerName="Nolan"
        tests={tests}
        testId="jug"
        onSave={onSave}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('combobox', { name: 'Test' })).toHaveValue('jug');
    expect(within(dialog).getByRole('button', { name: 'Save result' })).toBeDisabled();
    await userEvent.type(within(dialog).getByRole('spinbutton', { name: 'Longest streak value' }), '17');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Note (optional)' }), 'Kept rhythm');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save result' }));
    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({
        player_id: 'p1',
        skill_test_id: 'jug',
        value: 17,
        attempts: null,
        side: null,
        note: 'Kept rhythm',
      }),
    ]);
  });

  it('a two-sided made/attempted test records right and left in one go', async () => {
    const onSave = vi.fn();
    render(
      <RecordResultSheet
        open
        onClose={vi.fn()}
        playerId="p1"
        playerName="Nolan"
        tests={tests}
        testId="pass"
        onSave={onSave}
      />,
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByRole('spinbutton', { name: 'Right side value' }), '4');
    await userEvent.type(within(dialog).getByRole('spinbutton', { name: 'Left side value' }), '2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save result' }));
    const rows = onSave.mock.calls[0]?.[0] as { side: string; value: number; attempts: number }[];
    expect(rows.map((r) => [r.side, r.value, r.attempts])).toEqual([
      ['right', 4, 5],
      ['left', 2, 5],
    ]);
  });

  it('editing shows the stored values, saves a patch and offers delete', async () => {
    const onUpdate = vi.fn();
    const onDelete = vi.fn();
    render(
      <RecordResultSheet
        open
        onClose={vi.fn()}
        playerId="p1"
        playerName="Nolan"
        tests={tests}
        testId="sprint"
        existing={{
          id: 'r1',
          player_id: 'p1',
          skill_test_id: 'sprint',
          tested_on: '2026-10-05',
          value: 4.9,
          attempts: null,
          side: null,
          note: null,
          recorded_by: null,
          created_at: '',
          updated_at: '',
          updated_by: null,
        }}
        onSave={vi.fn()}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('combobox', { name: 'Test' })).toBeDisabled();
    const value = within(dialog).getByRole('spinbutton', { name: 'Time value' });
    expect(value).toHaveValue(4.9);
    await userEvent.clear(value);
    await userEvent.type(value, '4.6');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ value: 4.6, tested_on: '2026-10-05' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete this result' }));
    expect(onDelete).toHaveBeenCalled();
  });
});
