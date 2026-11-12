import { render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { useFocusTrap } from '../useFocusTrap';

function Trap({ tick, onEscape }: { tick: number; onEscape: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onEscape);
  return (
    <div ref={ref} data-tick={tick}>
      <button type="button">First</button>
      <select aria-label="Assist">
        <option>none</option>
      </select>
    </div>
  );
}

describe('useFocusTrap (D95)', () => {
  it('sets initial focus once on open; a re-render with a new escape handler never moves focus', async () => {
    const { rerender } = render(<Trap tick={0} onEscape={() => undefined} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'First' })).toHaveFocus());
    const assist = screen.getByRole('combobox', { name: 'Assist' });
    assist.focus();
    expect(assist).toHaveFocus();
    // the clock ticks: the parent re-renders and hands the trap a new closure
    for (let i = 1; i <= 3; i++) rerender(<Trap tick={i} onEscape={() => undefined} />);
    await new Promise((r) => setTimeout(r, 50)); // past any animation frame the trap might schedule
    expect(assist).toHaveFocus();
  });
});
