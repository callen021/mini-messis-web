import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SPORTS, formationByName } from '@/sports/definitions';
import { type Player } from '@/teams/api';
import { PeriodCard } from '../PeriodCard';

const S = SPORTS.soccer;
const forms = S.formations({ size: 7, gk: true });
const f33 = formationByName(forms, '3-3');

const mk = (id: string, first_name: string, n: string, is_available = true): Player => ({
  id,
  team_id: 't',
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
const active = players.filter((p) => p.is_available);

function renderCard(over: Partial<Parameters<typeof PeriodCard>[0]> = {}) {
  const props = {
    sport: 'soccer' as const,
    S,
    view: 'flat' as const,
    title: 'Q1',
    periodIndex: 0,
    period: { formation: '3-3', slots: ['p1', '', '', '', '', '', 'p2'], auto: [6] },
    formation: f33,
    forms,
    players,
    activePlayers: active,
    colors: S.defaultColors as Record<string, string>,
    counts: { p1: 2, p2: 1, p3: 0 },
    periodNoun: 'quarter',
    canEdit: true,
    highlight: new Set<string>(),
    onFormationChange: vi.fn(),
    onAssign: vi.fn(),
    onAutoFill: vi.fn(),
    onRedo: vi.fn(),
    ...over,
  };
  render(<PeriodCard {...props} />);
  return props;
}

describe('PeriodCard', () => {
  it('shows the open count, sitting-out list and out players', () => {
    renderCard();
    expect(screen.getByText('5 open', { selector: '.openpill' })).toBeInTheDocument();
    expect(screen.getByText('Sitting out · 1')).toBeInTheDocument();
    expect(screen.getByText(/Jack/)).toBeInTheDocument();
    expect(screen.getByText(/Out: Hal/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Quarter 1,/ })).toHaveLength(7);
  });

  it('tapping an open jersey lists the bench first, then moves, and assigns the pick', async () => {
    const props = renderCard();
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Quarter 1, STRIKER: open' })[0] as HTMLElement,
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Q1 · STRIKER');
    // bench: Jack (0 quarters); on field: LW · Nolan, GK · Teddy
    const buttons = within(dialog)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(buttons[0]).toContain('#3 Jack · 0 quarters');
    expect(buttons).toContain('LW · Nolan');
    expect(buttons).toContain('GK · Teddy');
    await userEvent.click(within(dialog).getByRole('button', { name: /Jack/ }));
    expect(props.onAssign).toHaveBeenCalledWith(1, 'p3');
  });

  it('an assigned jersey offers Clear and moving another player in', async () => {
    const props = renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'Quarter 1, STRIKER: Nolan' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /Clear jersey · Nolan/ }));
    expect(props.onAssign).toHaveBeenCalledWith(0, '');
  });

  it('formation select and Auto-fill call back', async () => {
    const props = renderCard();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Formation for Quarter 1/ }), '2-3-1');
    expect(props.onFormationChange).toHaveBeenCalledWith('2-3-1');
    await userEvent.click(screen.getByRole('button', { name: 'Auto-fill' }));
    expect(props.onAutoFill).toHaveBeenCalled();
  });

  it('read-only (parent) view: no select, jerseys disabled, own child highlighted', () => {
    renderCard({ canEdit: false, highlight: new Set(['p1']) });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('3-3', { selector: '.pill' })).toBeInTheDocument();
    const nolan = screen.getByRole('button', { name: 'Quarter 1, STRIKER: Nolan' });
    expect(nolan).toBeDisabled();
    expect(nolan).toHaveClass('highlight');
    // D54: a gold star marks the parent's child; the auto-fill dot is for staff only
    expect(nolan.querySelector('.starbadge')).not.toBeNull();
    expect(document.querySelector('.shirt .autobadge')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Auto-fill' })).not.toBeInTheDocument();
  });

  it('shows Redo instead of Auto-fill when the card is full with auto picks', () => {
    renderCard({
      period: { formation: '3-3', slots: ['p1', 'p2', 'p3', 'p1', 'p2', 'p3', 'p1'], auto: [1] },
      activePlayers: active,
    });
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument();
  });
});
