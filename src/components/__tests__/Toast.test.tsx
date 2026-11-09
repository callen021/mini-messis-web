import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_DURATION_MS, ToastProvider, useToast } from '../Toast';

function Harness() {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast('Goal! Q2 · Nolan')}>
      Fire
    </button>
  );
}

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows the message in a live region and hides it after the duration', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    const status = screen.getByRole('status');
    expect(status).not.toHaveClass('show');
    act(() => screen.getByRole('button', { name: 'Fire' }).click());
    expect(status).toHaveTextContent('Goal! Q2 · Nolan');
    expect(status).toHaveClass('show');
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 1));
    expect(status).toHaveClass('show');
    act(() => vi.advanceTimersByTime(1));
    expect(status).not.toHaveClass('show');
  });

  it('a second toast restarts the timer', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    act(() => screen.getByRole('button', { name: 'Fire' }).click());
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 100));
    act(() => screen.getByRole('button', { name: 'Fire' }).click());
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole('status')).toHaveClass('show');
  });

  it('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Harness />)).toThrow(/ToastProvider/);
  });
});
