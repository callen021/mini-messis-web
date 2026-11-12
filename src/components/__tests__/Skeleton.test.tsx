import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ShellSkeleton, SkeletonPage } from '../Skeleton';

describe('ShellSkeleton (D89)', () => {
  it('shows the frame (status strip, top bar, tab bar) before any data', () => {
    render(
      <MemoryRouter>
        <ShellSkeleton label="Loading your team…" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading your team…');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav.querySelectorAll('.tab')).toHaveLength(4);
    expect(document.querySelector('.statusbar-bg')).not.toBeNull();
    expect(document.querySelector('.topbar')).not.toBeNull();
  });

  it('a page skeleton announces once and draws the rows', () => {
    render(<SkeletonPage rows={2} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(document.querySelectorAll('.skel-row')).toHaveLength(2);
  });
});
