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
    canEdit: true,
    highlight: new Set<string>(),
    onFormationChange: vi.fn(),
    onAssign: vi.fn(),
    onSwap: vi.fn(),
    benchOrder: ['p3'],
    onBenchSwap: vi.fn(),
    onAutoFill: vi.fn(),
    onRedo: vi.fn(),
    ...over,
  };
  render(<PeriodCard {...props} />);
  return props;
}

describe('PeriodCard', () => {
  it('shows the open count, a bench row of small jerseys in queue order and out players (D77, D79)', () => {
    renderCard({
      activePlayers: [...active, mk('p5', 'Milo', '5')],
      benchOrder: ['p5', 'p3'], // the queue, not a sort
    });
    expect(screen.getByText('5 open', { selector: '.openpill' })).toBeInTheDocument();
    const bench = screen.getByRole('group', { name: 'Bench' });
    expect(bench).toHaveTextContent('Bench · 2');
    expect(bench).toHaveTextContent('Out: Hal');
    const names = within(bench)
      .getAllByRole('button', { name: /^Bench:/ })
      .map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Bench: Milo #5, up next', 'Bench: Jack #3']);
    // the queue is drawn right to left with an "Up Next" label over the next-in jersey (D83, D84)
    expect(bench.querySelector('.benchq')).not.toBeNull();
    expect(bench.querySelector('.upnext')).toHaveTextContent('Up Next');
    expect(document.querySelectorAll('.bslot')).toHaveLength(2);
    expect(screen.queryByText(/Sitting out/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Quarter 1,/ })).toHaveLength(7);
    // the bench row sits above the hint line
    const row = document.querySelector('.benchrow') as HTMLElement;
    const hint = document.querySelector('.taphint') as HTMLElement;
    expect(row.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('nothing is written under a bench jersey: no periods caption, no "halfs" (D99)', () => {
    renderCard({
      title: 'H1',
      activePlayers: [...active, mk('p5', 'Milo', '5')],
      benchOrder: ['p5', 'p3'],
    });
    const bench = screen.getByRole('group', { name: 'Bench' });
    expect(bench.querySelectorAll('.jtime')).toHaveLength(0);
    expect(bench.textContent).not.toMatch(/half|quarter|period|min/i);
    const names = within(bench)
      .getAllByRole('button', { name: /^Bench:/ })
      .map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Bench: Milo #5, up next', 'Bench: Jack #3']);
  });

  it('tapping an open jersey selects it with a hint, then a bench tap fills it; an on-field tap moves there (D86)', async () => {
    const props = renderCard();
    const open = screen.getAllByRole('button', { name: 'Quarter 1, STRIKER: open' })[0] as HTMLElement;
    await userEvent.click(open);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(open).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Tap a bench player for ST')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open the spot' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Bench: Jack/ }));
    expect(props.onAssign).toHaveBeenCalledWith(1, 'p3');
    // the other way round: an on-field player moves into the selected open spot
    await userEvent.click(open);
    await userEvent.click(screen.getByRole('button', { name: 'Quarter 1, STRIKER: Nolan' }));
    expect(props.onAssign).toHaveBeenLastCalledWith(1, 'p1');
  });

  it('select-then-target: field then bench substitutes, two jerseys swap, both get the gold outline (D77)', async () => {
    const props = renderCard();
    const nolan = screen.getByRole('button', { name: 'Quarter 1, STRIKER: Nolan' });
    await userEvent.click(nolan);
    expect(nolan).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Tap a player to swap with Nolan')).toBeInTheDocument();
    const jack = screen.getByRole('button', { name: /^Bench: Jack/ });
    await userEvent.click(jack);
    expect(props.onAssign).toHaveBeenCalledWith(0, 'p3');
    expect(nolan).toHaveAttribute('aria-pressed', 'false');
    // the second tap is confirmed the same way as the first
    expect(nolan).toHaveClass('flash');
    expect(jack).toHaveClass('flash');
    await userEvent.click(nolan);
    await userEvent.click(screen.getByRole('button', { name: 'Quarter 1, GOALIE: Teddy' }));
    expect(props.onSwap).toHaveBeenCalledWith(0, 6);
  });

  it('two bench jerseys swap places in the queue (D79)', async () => {
    const props = renderCard({ activePlayers: [...active, mk('p5', 'Milo', '5')], benchOrder: ['p5', 'p3'] });
    await userEvent.click(screen.getByRole('button', { name: /^Bench: Milo/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Bench: Jack/ }));
    expect(props.onBenchSwap).toHaveBeenCalledWith('p5', 'p3');
    expect(props.onAssign).not.toHaveBeenCalled();
  });

  it('a selected jersey can be opened with no replacement; the same jersey again cancels', async () => {
    const props = renderCard();
    const nolan = screen.getByRole('button', { name: 'Quarter 1, STRIKER: Nolan' });
    await userEvent.click(nolan);
    await userEvent.click(screen.getByRole('button', { name: 'Open the spot' }));
    expect(props.onAssign).toHaveBeenCalledWith(0, '');
    await userEvent.click(nolan);
    await userEvent.click(nolan);
    expect(nolan).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Open the spot' })).not.toBeInTheDocument();
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
  it('the how-to is behind the bench info button; the hint row is empty with nothing to offer (D112)', async () => {
    renderCard({
      period: { formation: '3-3', slots: ['p1', 'p2', 'p3', 'p1', 'p2', 'p3', 'p1'], auto: [] },
      activePlayers: active,
    });
    expect(screen.queryByText(/Tap a jersey, then another/)).not.toBeInTheDocument();
    expect(document.querySelector('.taphint')).toHaveClass('empty');
    await userEvent.click(screen.getByRole('button', { name: 'How to move players' }));
    expect(screen.getByRole('note')).toHaveTextContent(/Tap a jersey, then another, to swap them/);
    await userEvent.click(document.body);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('parents get no info button', () => {
    renderCard({ canEdit: false });
    expect(screen.queryByRole('button', { name: 'How to move players' })).not.toBeInTheDocument();
  });
});
