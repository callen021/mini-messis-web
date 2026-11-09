import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ActionSheetProvider, FormSheet, useActionSheet } from '../Sheet';

function Harness() {
  const sheet = useActionSheet();
  const [result, setResult] = useState('idle');
  const ask = async () => {
    const v = await sheet({
      title: 'Remove player?',
      message: 'Past results keep their name.',
      actions: [
        { label: 'Remove', value: 'remove', destructive: true },
        { label: 'Keep', value: 'keep' },
      ],
    });
    setResult(v ?? 'null');
  };
  return (
    <>
      <button type="button" onClick={ask}>
        Open
      </button>
      <output>{result}</output>
    </>
  );
}

const renderHarness = () =>
  render(
    <ActionSheetProvider>
      <Harness />
    </ActionSheetProvider>,
  );

describe('ActionSheet', () => {
  it('resolves with the chosen action value', async () => {
    renderHarness();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove player?' });
    expect(dialog).toHaveTextContent('Past results keep their name.');
    expect(screen.getByRole('button', { name: 'Remove' })).toHaveClass('destructive');
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('remove'));
  });

  it('resolves null on Cancel', async () => {
    renderHarness();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('null'));
  });

  it('resolves null on Escape and unmounts after the exit animation', async () => {
    renderHarness();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('null'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 1500 });
  });

  it('moves focus into the sheet and back to the opener', async () => {
    renderHarness();
    const opener = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(opener);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    // Cancel is the initial focus target, as on iOS.
    expect(document.activeElement).toHaveTextContent('Cancel');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('keeps Tab inside the dialog', async () => {
    renderHarness();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    for (let i = 0; i < 6; i++) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });
});

describe('FormSheet', () => {
  it('renders title, children and a cancel button that calls onClose', async () => {
    let closed = 0;
    const { rerender } = render(
      <FormSheet open title="New game" onClose={() => closed++}>
        <input aria-label="Opponent" />
      </FormSheet>,
    );
    expect(screen.getByRole('dialog', { name: 'New game' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Opponent' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(closed).toBe(1);
    act(() => {
      rerender(
        <FormSheet open={false} title="New game" onClose={() => closed++}>
          <input aria-label="Opponent" />
        </FormSheet>,
      );
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 1500 });
  });
});
