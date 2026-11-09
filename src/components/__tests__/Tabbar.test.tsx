import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { FieldIcon, TeamIcon } from '../icons';
import { Tabbar } from '../Tabbar';

const tabs = [
  { to: '/field', label: 'Field', icon: <FieldIcon /> },
  { to: '/team', label: 'Team', icon: <TeamIcon /> },
];

function App({ position }: { position?: 'top' | 'bottom' }) {
  return (
    <MemoryRouter initialEntries={['/field']}>
      <Tabbar tabs={tabs} position={position} />
      <Routes>
        <Route path="/field" element={<h1>Field page</h1>} />
        <Route path="/team" element={<h1>Team page</h1>} />
        <Route path="/settings" element={<h1>Settings page</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Tabbar', () => {
  it('marks the current tab active and navigates on tap with a haptic tick', async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav).toHaveClass('tabbar');
    expect(screen.getByRole('link', { name: 'Field' })).toHaveClass('active');
    await userEvent.click(screen.getByRole('link', { name: 'Team' }));
    expect(screen.getByRole('heading', { name: 'Team page' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Team' })).toHaveClass('active');
    expect(vibrate).toHaveBeenCalledWith(8);
  });

  it('is at the bottom by default and supports the legacy top position', () => {
    const { unmount } = render(<App />);
    expect(screen.getByRole('navigation')).not.toHaveClass('top');
    unmount();
    render(<App position="top" />);
    expect(screen.getByRole('navigation')).toHaveClass('top');
  });

  it('has a Settings gear', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('link', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Settings page' })).toBeInTheDocument();
  });
});
