import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type SkillTest } from '@/skills/defaults';
import { RecordResultSheet } from '@/skills/RecordResultSheet';
import { RecordSessionSheet } from '@/skills/RecordSessionSheet';
import { type Player } from '@/teams/api';
import { HomeResultSheet } from '../HomeResultSheet';
import { timeFieldValue } from '../times';

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
const sprint = mk({
  id: 'sprint',
  key: 'sprint',
  name: 'Sprint speed',
  metric: 'time_seconds',
  higher_is_better: false,
});
const custom = mk({
  id: 'lap',
  key: 'custom_lap',
  name: 'Lap of the field',
  metric: 'time_seconds',
  higher_is_better: false,
});
const juggling = mk({ id: 'jug', key: 'juggling', name: 'Juggling' });
const passing = mk({ id: 'pass', name: 'Passing accuracy', metric: 'made_of_attempted', has_sides: true });
const longPass = mk({ id: 'long', name: 'Long pass', metric: 'distance', unit: 'yd' });

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

describe('the stopwatch on a timed skill result (D137)', () => {
  let now = 0;
  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const timeRun = async (user: ReturnType<typeof userEvent.setup>, ms: number) => {
    await user.click(screen.getByRole('button', { name: /^Start/ }));
    now += ms;
    await user.click(screen.getByRole('button', { name: 'Stop' }));
  };

  it('fills the field as the field takes it: plain seconds to a tenth', () => {
    expect(timeFieldValue(8.4)).toBe('8.4');
    expect(timeFieldValue(12)).toBe('12.0');
    expect(timeFieldValue(62.3)).toBe('62.3');
  });

  describe('Record at home (a Home result)', () => {
    const show = (test: SkillTest) => {
      const onSave = vi.fn();
      render(
        <HomeResultSheet
          open
          onClose={vi.fn()}
          playerId="a"
          playerName="Ava"
          test={test}
          today="2026-03-10"
          onSave={onSave}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />,
      );
      return onSave;
    };

    it('Stop fills Time; the field stays editable; starting again replaces it; only Save saves', async () => {
      const user = userEvent.setup();
      const onSave = show(sprint);
      const field = screen.getByLabelText('Time value');
      expect(field).toHaveValue(null);
      expect(screen.getByRole('timer')).toHaveTextContent('0.0');
      await timeRun(user, 8_460);
      expect(screen.getByRole('timer')).toHaveTextContent('8.4');
      expect(field).toHaveValue(8.4);
      expect(onSave).not.toHaveBeenCalled();
      // corrected by hand
      await user.clear(field);
      await user.type(field, '8.9');
      expect(field).toHaveValue(8.9);
      // another attempt replaces what is in the field
      await timeRun(user, 7_930);
      expect(field).toHaveValue(7.9);
      expect(onSave).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Save home result' }));
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave.mock.calls[0]?.[0]).toEqual([
        expect.objectContaining({ player_id: 'a', skill_test_id: 'sprint', value: 7.9, source: 'home' }),
      ]);
    });

    it('a time over a minute goes in as seconds, and a tap too quick to be a run changes nothing', async () => {
      const user = userEvent.setup();
      show(custom);
      const field = screen.getByLabelText('Time value');
      await timeRun(user, 40);
      expect(field).toHaveValue(null);
      expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
      await timeRun(user, 62_300);
      expect(screen.getByRole('timer')).toHaveTextContent('1:02.3');
      expect(field).toHaveValue(62.3);
    });

    it.each([juggling, passing, longPass])('no stopwatch on a test that is not timed: $name', (test) => {
      show(test);
      expect(screen.queryByRole('timer')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    });
  });

  describe('the coach’s result sheet (a Coach result)', () => {
    it('shows on a timed test only, follows the Test picker, and saves through Save result', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(
        <RecordResultSheet
          open
          onClose={vi.fn()}
          playerId="a"
          playerName="Ava"
          tests={[juggling, sprint, custom]}
          testId="jug"
          onSave={onSave}
        />,
      );
      expect(screen.queryByRole('timer')).toBeNull();
      await user.selectOptions(screen.getByRole('combobox'), 'sprint');
      await timeRun(user, 9_120);
      expect(screen.getByLabelText('Time value')).toHaveValue(9.1);
      // another test: a clean stopwatch and an empty field
      await user.selectOptions(screen.getByRole('combobox'), 'lap');
      expect(screen.getByRole('timer')).toHaveTextContent('0.0');
      expect(screen.getByLabelText('Time value')).toHaveValue(null);
      await timeRun(user, 30_000);
      expect(onSave).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Save result' }));
      expect(onSave).toHaveBeenCalledTimes(1);
      const row = (onSave.mock.calls[0]?.[0] as Record<string, unknown>[])[0];
      expect(row).toMatchObject({ player_id: 'a', skill_test_id: 'lap', value: 30 });
      // a Coach result: the sheet sets no source, so the database default applies as before
      expect(row).not.toHaveProperty('source');
    });
  });

  describe('the coach’s whole-team sheet', () => {
    it('times one player at a time: Stop fills their row, Next moves on, a focused row is the one timed', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(
        <RecordSessionSheet
          open
          onClose={vi.fn()}
          tests={[juggling, sprint]}
          players={players}
          testId="sprint"
          onSave={onSave}
        />,
      );
      const watch = () => screen.getByRole('group', { name: 'Stopwatch' });
      expect(watch()).toHaveTextContent('Timing Ava');
      await timeRun(user, 5_500);
      expect(screen.getByLabelText('Ava value')).toHaveValue(5.5);
      // another attempt for the same player replaces it
      await timeRun(user, 5_200);
      expect(screen.getByLabelText('Ava value')).toHaveValue(5.2);
      await user.click(within(watch()).getByRole('button', { name: 'Next: Ben' }));
      expect(watch()).toHaveTextContent('Timing Ben');
      expect(screen.getByRole('timer')).toHaveTextContent('0.0');
      await timeRun(user, 6_010);
      expect(screen.getByLabelText('Ben value')).toHaveValue(6);
      expect(screen.getByLabelText('Ava value')).toHaveValue(5.2);
      // tapping a player's field points the stopwatch at them
      await user.click(screen.getByLabelText('Cal value'));
      expect(watch()).toHaveTextContent('Timing Cal');
      expect(within(watch()).queryByRole('button', { name: /^Next/ })).toBeNull();
      await user.type(screen.getByLabelText('Cal value'), '7.3');
      expect(onSave).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Save 3 results' }));
      expect(onSave.mock.calls[0]?.[0]).toEqual([
        expect.objectContaining({ player_id: 'a', value: 5.2 }),
        expect.objectContaining({ player_id: 'b', value: 6 }),
        expect.objectContaining({ player_id: 'c', value: 7.3 }),
      ]);
    });

    it('no stopwatch for a count test', () => {
      render(
        <RecordSessionSheet
          open
          onClose={vi.fn()}
          tests={[juggling, sprint]}
          players={players}
          testId="jug"
          onSave={vi.fn()}
        />,
      );
      expect(screen.queryByRole('timer')).toBeNull();
    });
  });
});
