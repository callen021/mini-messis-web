import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppCrash, ErrorBoundary } from '../ErrorBoundary';

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error('kaboom');
  return <p>all good</p>;
}

describe('ErrorBoundary', () => {
  it('shows the fallback with the message and recovers on Try again', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Harness() {
      const [explode, setExplode] = useState(true);
      return (
        <ErrorBoundary
          fallback={(error, reset) => (
            <AppCrash
              error={error}
              reset={() => {
                setExplode(false);
                reset();
              }}
            />
          )}
        >
          <Bomb explode={explode} />
        </ErrorBoundary>
      );
    }
    render(<Harness />);
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByText('kaboom')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('all good')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('resets when a reset key changes', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ui = (explode: boolean, key: string) => (
      <ErrorBoundary resetKeys={[key]} fallback={(e) => <p>failed: {e.message}</p>}>
        <Bomb explode={explode} />
      </ErrorBoundary>
    );
    const { rerender } = render(ui(true, '/field'));
    expect(screen.getByText('failed: kaboom')).toBeInTheDocument();
    rerender(ui(false, '/field'));
    expect(screen.getByText('failed: kaboom')).toBeInTheDocument(); // same key: stays failed
    rerender(ui(false, '/team'));
    expect(screen.getByText('all good')).toBeInTheDocument();
    spy.mockRestore();
  });
});
