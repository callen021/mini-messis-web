import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Segmented } from '../Segmented';

const options = [
  { value: 'rotation', label: 'Rotation' },
  { value: 'roster', label: 'Roster' },
  { value: 'skills', label: 'Skills' },
] as const;

describe('Segmented', () => {
  it('exposes a radio group with the selected option checked', () => {
    render(<Segmented label="Team view" options={options} value="roster" onChange={() => undefined} />);
    expect(screen.getByRole('radiogroup', { name: 'Team view' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Roster' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Rotation' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Roster' })).toHaveClass('on');
  });

  it('calls onChange on click', async () => {
    const onChange = vi.fn();
    render(<Segmented label="Team view" options={options} value="rotation" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Skills' }));
    expect(onChange).toHaveBeenCalledWith('skills');
  });

  it('moves with arrow keys and wraps around', async () => {
    const onChange = vi.fn();
    render(<Segmented label="Team view" options={options} value="skills" onChange={onChange} />);
    screen.getByRole('radio', { name: 'Skills' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('rotation');
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('roster');
    await userEvent.keyboard('{Home}');
    expect(onChange).toHaveBeenLastCalledWith('rotation');
  });

  it('only the selected segment is in the tab order', () => {
    render(<Segmented label="Team view" options={options} value="roster" onChange={() => undefined} />);
    expect(screen.getByRole('radio', { name: 'Roster' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Rotation' })).toHaveAttribute('tabindex', '-1');
  });
});
