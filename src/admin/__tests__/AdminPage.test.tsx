import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { AdminPage } from '../AdminPage';
import { type AdminTeamRow } from '../api';

const duplicate = vi.fn();
vi.mock('../api', () => ({
  useAdminTeams: () => ({ data: teams, isPending: false }),
  useAdminUsers: () => ({ data: [], isPending: false }),
  useDuplicateTeam: () => ({ mutate: duplicate, isPending: false }),
}));
vi.mock('@/teams/TeamContext', () => ({ useOptionalTeam: () => null }));

const teams: AdminTeamRow[] = [
  {
    id: 't1',
    name: 'Source FC',
    sport: 'soccer',
    owner_id: 'u1',
    owner_name: 'Admin Ana',
    owner_email: 'admin@example.test',
    coaches: 1,
    assistants: 0,
    parents: 2,
    pending: 0,
    players: 8,
    created_at: '2026-11-01T00:00:00Z',
    archived_at: null,
  },
];

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/teams/:id" element={<h1>Team page</h1>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('AdminPage · duplicate team (D81)', () => {
  beforeEach(() => duplicate.mockReset());

  it('every team row has a Duplicate action that asks for a name and calls the function', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate Source FC' }));
    const sheet = await screen.findByRole('dialog', { name: 'Duplicate Source FC' });
    const name = within(sheet).getByLabelText('New team name');
    expect(name).toHaveValue('Source FC copy');
    await userEvent.clear(name);
    await userEvent.type(name, 'Test-Source');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Duplicate team' }));
    expect(duplicate).toHaveBeenCalledWith({ sourceId: 't1', name: 'Test-Source' }, expect.anything());
  });

  it('a blank name cannot be submitted; success goes to the new team', async () => {
    duplicate.mockImplementation((_args: unknown, opts?: { onSuccess: (id: string) => void }) =>
      opts?.onSuccess('t2'),
    );
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate Source FC' }));
    const sheet = await screen.findByRole('dialog', { name: 'Duplicate Source FC' });
    const name = within(sheet).getByLabelText('New team name');
    await userEvent.clear(name);
    expect(within(sheet).getByRole('button', { name: 'Duplicate team' })).toBeDisabled();
    await userEvent.type(name, 'Copy{Enter}');
    expect(duplicate).toHaveBeenCalledWith({ sourceId: 't1', name: 'Copy' }, expect.anything());
    expect(await screen.findByRole('heading', { name: 'Team page' })).toBeInTheDocument();
  });
});
