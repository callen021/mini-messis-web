import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionSheetProvider } from '@/components/Sheet';
import { ToastProvider } from '@/components/Toast';
import { type Person } from '../api';
import { PeopleSection } from '../PeopleSection';

const merge = vi.fn();
const mergeAsync = vi.fn(async () => undefined);
let people: Person[] = [];
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'coach' } }) }));
vi.mock('../api', () => ({
  usePlayerPeople: () => ({ data: people, isPending: false }),
  useSaveContact: () => ({ mutateAsync: vi.fn(), mutate: vi.fn() }),
  useSetContactShared: () => ({ mutate: vi.fn() }),
  useDeleteContact: () => ({ mutate: vi.fn() }),
  useMergeContacts: () => ({ mutate: merge, mutateAsync: mergeAsync }),
}));

const person = (over: Partial<Person> & { contact_id: string | null; name: string }): Person => ({
  user_id: null,
  relationship: null,
  email: null,
  phone: null,
  share_with_team: true,
  in_app: false,
  link_status: null,
  can_edit: true,
  ...over,
});

function renderSection(isStaff = true) {
  render(
    <ToastProvider>
      <ActionSheetProvider>
        <PeopleSection
          playerId="p1"
          childName="Ann"
          teamName="Strikers"
          canEdit
          selfLinked={false}
          isStaff={isStaff}
        />
      </ActionSheetProvider>
    </ToastProvider>,
  );
}

describe('PeopleSection duplicates (D116)', () => {
  beforeEach(() => {
    merge.mockReset();
    mergeAsync.mockClear();
    people = [
      person({ contact_id: 'c1', name: 'Dana', relationship: 'Mother', phone: '+15550100201' }),
      person({ contact_id: 'c2', name: 'dana', user_id: 'u1', in_app: true, email: 'dana@example.test' }),
      person({ contact_id: 'c3', name: 'Eli', relationship: 'Father' }),
    ];
  });

  it('a name-only match shows the coaches a "Possible duplicate" prompt; Merge keeps the coach entry', async () => {
    renderSection();
    const prompt = screen.getByRole('button', { name: /Possible duplicate: Dana and dana/ });
    expect(prompt).toHaveTextContent('They have the same name. Merge?');
    await userEvent.click(prompt);
    const sheet = screen.getByRole('dialog', { name: 'Merge dana into Dana?' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Merge' }));
    expect(merge).toHaveBeenCalledWith({ keepId: 'c1', dropId: 'c2' }, expect.anything());
  });

  it('parents get no prompt', () => {
    renderSection(false);
    expect(screen.queryByText(/Possible duplicate/)).not.toBeInTheDocument();
  });

  it('the contact edit screen offers "Merge with…" the other contacts', async () => {
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: /^Eli/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit contact' });
    const select = within(dialog).getByRole('combobox', { name: 'Merge with' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['—', 'Dana · Mother', 'dana']);
    await userEvent.selectOptions(select, 'c2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Merge into Eli' }));
    expect(mergeAsync).toHaveBeenCalledWith({ keepId: 'c3', dropId: 'c2' });
    expect(screen.queryByRole('dialog', { name: 'Edit contact' })).not.toBeInTheDocument();
  });
});
