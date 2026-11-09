import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from '../Switch';

describe('Switch', () => {
  it('renders as a labelled switch reflecting checked state', () => {
    const { rerender } = render(<Switch label="Goalkeeper" checked={false} onChange={() => undefined} />);
    const sw = screen.getByRole('switch', { name: 'Goalkeeper' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw).not.toHaveClass('on');
    rerender(<Switch label="Goalkeeper" checked onChange={() => undefined} />);
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(sw).toHaveClass('on');
  });

  it('reports the toggled value', async () => {
    const onChange = vi.fn();
    render(<Switch label="Goalkeeper" checked onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('does nothing when disabled', async () => {
    const onChange = vi.fn();
    render(<Switch label="Goalkeeper" checked disabled onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies size classes', () => {
    render(<Switch label="Active" size="sm" checked onChange={() => undefined} />);
    expect(screen.getByRole('switch')).toHaveClass('toggle', 'sm', 'on');
  });
});
