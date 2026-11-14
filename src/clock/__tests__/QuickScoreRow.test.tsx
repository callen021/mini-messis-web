import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SPORTS } from '@/sports/definitions';
import { QuickScoreRow } from '../QuickScoreRow';

const S = SPORTS.basketball;

describe('QuickScoreRow (D108): Us arms a scorer pick, Them records at once', () => {
  it('shows +1 +2 +3 for each side and arms the Us button that was tapped', async () => {
    const onUs = vi.fn();
    const onThem = vi.fn();
    render(<QuickScoreRow S={S} pending={null} last={null} onUs={onUs} onThem={onThem} />);
    expect(screen.getAllByRole('button', { name: /^Us \+/ }).map((b) => b.textContent)).toEqual([
      '+1',
      '+2',
      '+3',
    ]);
    expect(screen.getAllByRole('button', { name: /^Them \+/ })).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Us +2, field goal' }));
    expect(onUs).toHaveBeenCalledWith(2);
    await userEvent.click(screen.getByRole('button', { name: 'Them +3, three-pointer' }));
    expect(onThem).toHaveBeenCalledWith(3);
  });

  it('while points are pending the Us button is pressed and the Them buttons wait', () => {
    render(<QuickScoreRow S={S} pending={2} last={null} onUs={vi.fn()} onThem={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Us +2, field goal' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Us +3, three-pointer' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Them +1, free throw' })).toBeDisabled();
  });

  it('the confirmation line names the entry and offers Undo once it has settled', async () => {
    const onUndo = vi.fn();
    const { rerender } = render(
      <QuickScoreRow S={S} pending={null} last={{ text: 'Nolan +2' }} onUs={vi.fn()} onThem={vi.fn()} />,
    );
    expect(screen.getByText('Nolan +2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    rerender(
      <QuickScoreRow
        S={S}
        pending={null}
        last={{ text: 'Nolan +2', onUndo }}
        onUs={vi.fn()}
        onThem={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalled();
  });
  it('no standing hint under the buttons; the confirmation line is hidden until something is scored (D112)', () => {
    render(<QuickScoreRow S={S} pending={null} last={null} onUs={vi.fn()} onThem={vi.fn()} />);
    expect(screen.queryByText(/Tap the points/)).not.toBeInTheDocument();
    expect(document.querySelector('.qslast')).toHaveClass('empty');
  });
});
