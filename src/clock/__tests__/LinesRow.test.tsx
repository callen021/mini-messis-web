import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { type Line } from '@/lines/api';
import { LinesRow } from '../LinesRow';

const mk = (kind: Line['kind'], slot: number, name: string, players: string[]): Line => ({
  id: `${kind}${slot}`,
  team_id: 't1',
  kind,
  slot,
  name,
  player_ids: players,
  created_at: '',
  updated_at: '',
  updated_by: null,
});

describe('LinesRow (D122)', () => {
  it('shows the saved lines in order, named or by slot, and a tap hands the line over', async () => {
    const onChange = vi.fn();
    const lines = [
      mk('defense', 1, '', ['a', 'b']),
      mk('forward', 2, 'Second', ['c', 'd', 'e']),
      mk('forward', 1, '', []),
    ];
    render(<LinesRow lines={lines} onChange={onChange} />);
    expect(screen.getByRole('group', { name: 'Lines' })).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['F1', 'Second', 'D1']);
    expect(screen.getByRole('button', { name: 'Forward line F1 on' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Forward line Second on' }));
    expect(onChange).toHaveBeenCalledWith(lines[1]);
    await userEvent.click(screen.getByRole('button', { name: 'Defense pair D1 on' }));
    expect(onChange).toHaveBeenCalledWith(lines[0]);
  });

  it('renders nothing with no lines', () => {
    const { container } = render(<LinesRow lines={[]} onChange={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
