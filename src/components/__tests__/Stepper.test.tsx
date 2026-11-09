import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Stepper } from '../Stepper';

describe('Stepper', () => {
  it('increments and decrements within bounds', async () => {
    const onChange = vi.fn();
    render(<Stepper label="Players" value={7} min={3} max={11} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Increase Players' }));
    expect(onChange).toHaveBeenLastCalledWith(8);
    await userEvent.click(screen.getByRole('button', { name: 'Decrease Players' }));
    expect(onChange).toHaveBeenLastCalledWith(6);
  });

  it('disables the buttons at the limits', () => {
    const { rerender } = render(
      <Stepper label="Players" value={3} min={3} max={11} onChange={() => undefined} />,
    );
    expect(screen.getByRole('button', { name: 'Decrease Players' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Increase Players' })).toBeEnabled();
    rerender(<Stepper label="Players" value={11} min={3} max={11} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Increase Players' })).toBeDisabled();
  });

  it('shows a custom display string (index-based stepping)', () => {
    render(<Stepper label="Quarters" value={1} min={0} max={2} display="4" onChange={() => undefined} />);
    expect(screen.getByRole('group', { name: 'Quarters' })).toHaveTextContent('4');
  });
});
