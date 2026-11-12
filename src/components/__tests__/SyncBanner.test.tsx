import { QueryClientProvider, onlineManager, useMutation } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { makeQueryClient } from '@/lib/query-client';
import { SyncBanner } from '../SyncBanner';

const resolvers: (() => void)[] = [];
function SaveButton() {
  const m = useMutation({
    mutationFn: () =>
      new Promise<void>((resolve) => {
        resolvers.push(resolve);
      }),
  });
  return (
    <button type="button" onClick={() => m.mutate()}>
      Save
    </button>
  );
}

function App() {
  const qc = makeQueryClient();
  return (
    <QueryClientProvider client={qc}>
      <SyncBanner savingDelayMs={0} />
      <SaveButton />
    </QueryClientProvider>
  );
}

afterEach(() => {
  onlineManager.setOnline(true);
  resolvers.length = 0;
});

describe('SyncBanner', () => {
  it('is hidden while online with nothing in flight', () => {
    render(<App />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says offline, counts queued changes, and clears when they send after reconnecting', async () => {
    render(<App />);
    act(() => onlineManager.setOnline(false));
    expect(screen.getByRole('status')).toHaveTextContent(/^Offline · changes you make will send/);

    act(() => screen.getByRole('button', { name: 'Save' }).click());
    act(() => screen.getByRole('button', { name: 'Save' }).click());
    await screen.findByText(/Offline · 2 unsaved changes will send/);
    expect(screen.getByRole('status')).toHaveClass('offline');
    expect(resolvers).toHaveLength(0); // nothing was sent while offline

    act(() => onlineManager.setOnline(true));
    // back online: the paused mutations start and the banner reports saving
    await screen.findByText(/Saving 2 unsaved changes/);
    expect(screen.getByRole('status')).toHaveClass('saving');
    await waitFor(() => expect(resolvers).toHaveLength(2)); // both were sent, in order
    await act(async () => {
      resolvers.splice(0).forEach((r) => r());
      await new Promise((res) => setTimeout(res, 0));
    });
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
});

describe('SyncBanner · saving never moves the page (D78)', () => {
  it('a quick online save shows nothing; a slow one shows a floating pill after the delay', async () => {
    const qc = makeQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <SyncBanner savingDelayMs={50} />
        <SaveButton />
      </QueryClientProvider>,
    );
    act(() => screen.getByRole('button', { name: 'Save' }).click());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await screen.findByText(/Saving 1 unsaved change/);
    expect(screen.getByRole('status')).toHaveClass('saving');
    await act(async () => {
      resolvers.splice(0).forEach((r) => r());
    });
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
});
