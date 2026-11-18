import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionSheetProvider } from '@/components/Sheet';
import { ToastProvider } from '@/components/Toast';
import { bestOf, coachResults, type SkillResult, type SkillTest, sourceOf } from '@/skills/defaults';
import { SkillTestsTab } from '../SkillTestsTab';

const TODAY = '2026-10-20';
const test = (o: Partial<SkillTest>): SkillTest => ({
  id: 'jug',
  team_id: 't1',
  key: 'juggling',
  name: 'Juggling',
  instructions: 'Count touches.',
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
  ...o,
});
let n = 0;
const result = (value: number, o: Partial<SkillResult> = {}): SkillResult => ({
  id: `r${++n}`,
  player_id: 'p1',
  skill_test_id: 'jug',
  tested_on: `2026-10-${String(n + 1).padStart(2, '0')}`,
  value,
  attempts: null,
  side: null,
  note: null,
  source: 'coach',
  conditions: null,
  recorded_by: 'coach',
  created_at: String(n).padStart(3, '0'),
  updated_at: '',
  updated_by: null,
  ...o,
});

const api = vi.hoisted(() => ({
  tests: [] as unknown[],
  results: [] as unknown[],
  add: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
}));
vi.mock('@/skills/api', () => ({
  useSkillTests: () => ({ data: api.tests, isPending: false, isError: false }),
  useSkillResults: () => ({ data: api.results, isPending: false, isError: false }),
  useAddSkillResults: () => ({ mutate: api.add }),
  useUpdateSkillResult: () => ({ mutate: api.update }),
  useDeleteSkillResult: () => ({ mutate: api.del }),
}));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

const show = () =>
  render(
    <ToastProvider>
      <ActionSheetProvider>
        <SkillTestsTab teamId="t1" playerId="p1" playerName="Sam" today={TODAY} />
      </ActionSheetProvider>
    </ToastProvider>,
  );

describe('Home and Coach results', () => {
  it('a result without a source is the coach’s; coach numbers leave Home results out', () => {
    const coach = result(12);
    const home = result(30, { source: 'home' });
    expect(sourceOf(coach)).toBe('coach');
    expect(sourceOf(home)).toBe('home');
    expect(coachResults([coach, home])).toEqual([coach]);
    expect(bestOf(test({}), coachResults([coach, home]))).toBe(coach); // 30 at home is not the coach's best
  });
});

describe('Skill Tests tab', () => {
  beforeEach(() => {
    n = 0;
    api.tests = [test({}), test({ id: 'hidden', name: 'Hidden one', is_active: false })];
    api.results = [];
    api.add.mockReset();
    api.update.mockReset();
    api.del.mockReset();
  });

  it('uses the team’s shown tests', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Juggling' })).toBeInTheDocument();
    expect(screen.queryByText('Hidden one')).toBeNull();
    expect(screen.getAllByText('No results yet')).toHaveLength(2); // one line for Home, one for Coach
  });

  it('shows both sources together, labelled, each with its own best', () => {
    api.results = [
      result(12),
      result(15),
      result(30, { source: 'home', recorded_by: 'me', conditions: 'backyard' }),
      result(22, { source: 'home', recorded_by: 'me' }),
    ];
    show();
    const bests = screen.getByRole('heading', { name: 'Juggling' }).closest('li') as HTMLElement;
    const home = bests.querySelector('.srcbests .home') as HTMLElement;
    const coach = bests.querySelector('.srcbests .coach') as HTMLElement;
    expect(home).toHaveTextContent('HomeBest 30 · latest 22');
    expect(coach).toHaveTextContent('CoachBest 15 · latest 15');
    const rows = within(screen.getByRole('list', { name: 'Juggling results' })).getAllByRole('listitem');
    expect(
      rows.map((r) => `${r.querySelector('.v')?.textContent} ${r.querySelector('.chip')?.textContent}`),
    ).toEqual(['22 Home', '30 Home', '15 Coach', '12 Coach']);
    expect(rows[1]).toHaveTextContent('backyard');
  });

  it('records at home: source Home, with the date, result and conditions', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Record at home' }));
    await user.type(screen.getByLabelText('Count value'), '18');
    await user.type(screen.getByLabelText('Test conditions (optional)'), 'backyard, size 3 ball');
    await user.click(screen.getByRole('button', { name: 'Save home result' }));
    expect(api.add).toHaveBeenCalledWith(
      [
        {
          player_id: 'p1',
          skill_test_id: 'jug',
          tested_on: TODAY,
          value: 18,
          attempts: null,
          side: null,
          note: null,
          source: 'home',
          conditions: 'backyard, size 3 ball',
        },
      ],
      expect.anything(),
    );
  });

  it('only the parent’s own Home results can be opened to edit or delete', async () => {
    api.results = [
      result(12),
      result(30, { source: 'home', recorded_by: 'me' }),
      result(31, { source: 'home', recorded_by: 'other-parent' }),
    ];
    const user = userEvent.setup();
    show();
    const edits = screen.getAllByRole('button', { name: /Edit home result/ });
    expect(edits).toHaveLength(1);
    await user.click(edits[0] as HTMLElement);
    const value = screen.getByLabelText('Count value');
    expect(value).toHaveValue(30);
    await user.clear(value);
    await user.type(value, '33');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(api.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'r2', value: 33, conditions: null }),
      expect.anything(),
    );
    expect(api.update.mock.calls[0]?.[0]).not.toHaveProperty('source');
  });
});
