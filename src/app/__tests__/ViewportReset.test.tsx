import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewportReset } from '../ViewportReset';

describe('ViewportReset (D111, D112): the window goes back to the top once the keyboard closes', () => {
  let scrollTo: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a field losing focus resets the window, right away and after the keyboard animation', () => {
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

  it('the reset runs even when the window reports no offset (the visual viewport may still be shifted)', () => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    render(
      <>
        <ViewportReset />
        <input aria-label="Team name" />
      </>,
    );
    const input = document.querySelector('input') as HTMLInputElement;
    input.focus();
    input.blur();
    vi.advanceTimersByTime(500);
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it('nothing happens when a button loses focus', () => {
    Object.defineProperty(window, 'scrollY', { value: 44, configurable: true });
    render(
      <>
        <ViewportReset />
        <button type="button">Go</button>
      </>,
    );
    const button = document.querySelector('button') as HTMLButtonElement;
    button.focus();
    button.blur();
    vi.advanceTimersByTime(500);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('focus moving straight from one field to another leaves the page alone: the keyboard is still up (D112)', () => {
    Object.defineProperty(window, 'scrollY', { value: 44, configurable: true });
    render(
      <>
        <ViewportReset />
        <input aria-label="Opponent" />
        <textarea aria-label="Notes" />
        <select aria-label="Home or away">
          <option>Home</option>
        </select>
        <button type="button">Start game</button>
      </>,
    );
    const input = document.querySelector('input') as HTMLInputElement;
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    const select = document.querySelector('select') as HTMLSelectElement;
    input.focus();
    textarea.focus(); // focusout on the input with relatedTarget = the textarea
    select.focus();
    vi.advanceTimersByTime(500);
    expect(scrollTo).not.toHaveBeenCalled();
    // leaving the last field for a button is the keyboard closing
    (document.querySelector('button') as HTMLButtonElement).focus();
    vi.advanceTimersByTime(500);
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });
});
