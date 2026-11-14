import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewportReset } from '../ViewportReset';

describe('ViewportReset (D111): the window goes back to the top once the keyboard closes', () => {
  let scrollTo: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a field losing focus resets a leftover window offset, right away and after the keyboard animation', () => {
    Object.defineProperty(window, 'scrollY', { value: 44, configurable: true });
    render(
      <>
        <ViewportReset />
        <input aria-label="Team name" />
      </>,
    );
    const input = document.querySelector('input') as HTMLInputElement;
    input.focus();
    input.blur();
    expect(scrollTo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(70);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    vi.advanceTimersByTime(400);
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it('nothing happens when there is no offset, or when a button loses focus', () => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    render(
      <>
        <ViewportReset />
        <input aria-label="Team name" />
        <button type="button">Go</button>
      </>,
    );
    const input = document.querySelector('input') as HTMLInputElement;
    input.focus();
    input.blur();
    vi.advanceTimersByTime(500);
    expect(scrollTo).not.toHaveBeenCalled();
    Object.defineProperty(window, 'scrollY', { value: 44, configurable: true });
    const button = document.querySelector('button') as HTMLButtonElement;
    button.focus();
    button.blur();
    vi.advanceTimersByTime(500);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
