import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActionSheetProvider } from '@/components/Sheet';
import { useUIStore } from '@/lib/ui-store';
import { trainingTabs } from '@/training/tabs';
import { ChildSwitcher } from '../children';
import { pickChild } from '../useMyKids';

const sam = { id: 'p1', first_name: 'Sam' };
const ava = { id: 'p2', first_name: 'Ava' };

describe('the selected child (D135)', () => {
  it('is the remembered one while it is still mine, else the first', () => {
    expect(pickChild([sam, ava], 'p2')).toBe(ava);
    expect(pickChild([sam, ava], 'gone')).toBe(sam);
    expect(pickChild([sam, ava], undefined)).toBe(sam);
    expect(pickChild([], 'p1')).toBeNull();
  });

  it('is remembered per team on the device', () => {
    useUIStore.getState().setChild('t1', 'p2');
    useUIStore.getState().setChild('t2', 'p9');
    expect(useUIStore.getState().childByTeam).toEqual({ t1: 'p2', t2: 'p9' });
    const raw = JSON.parse(localStorage.getItem('mm-ui') ?? '{}') as { state: { childByTeam: unknown } };
    expect(raw.state.childByTeam).toEqual({ t1: 'p2', t2: 'p9' });
  });
});

describe('the child switcher (D135)', () => {
  const show = (kids: (typeof sam)[], onSelect = vi.fn()) => {
    render(
      <ActionSheetProvider>
        <ChildSwitcher kids={kids} child={kids[0] ?? sam} onSelect={onSelect} />
      </ActionSheetProvider>,
    );
    return onSelect;
  };

  it('with one child the name is plain text, not a button', () => {
    show([sam]);
    expect(screen.getByText('Sam')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('with two it opens the list and selects the other child', async () => {
    const onSelect = show([sam, ava]);
    await userEvent.click(screen.getByRole('button', { name: 'Sam. Switch child' }));
    const dialog = await screen.findByRole('dialog', { name: 'Which child?' });
    expect(dialog).toHaveTextContent('Sam ✓');
    await userEvent.click(screen.getByRole('button', { name: 'Ava' }));
    expect(onSelect).toHaveBeenCalledWith('p2');
  });
});

describe('the sections of the Training tab (D135)', () => {
  it('soccer with a confirmed child: Daily Drills, Skill Tests, Library', () => {
    expect(trainingTabs('soccer', true)).toEqual(['drills', 'tests', 'library']);
  });
  it('soccer without one (a coach, or an unconfirmed parent): no Daily Drills', () => {
    expect(trainingTabs('soccer', false)).toEqual(['tests', 'library']);
  });
  it('other sports: Skill Tests only', () => {
    expect(trainingTabs('basketball', true)).toEqual(['tests']);
    expect(trainingTabs('hockey', false)).toEqual(['tests']);
  });
});
