import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type * as Api from '../api';
import { StreakIndicators } from '../StreakIndicator';

const streaks: Record<string, number> = { p1: 4, p2: 0 };
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof Api>('../api');
  return {
    ...actual,
    useStreak: (id: string) => ({ data: { current: streaks[id] ?? 0 }, isPending: false }),
  };
});

const show = (kids: { id: string; first_name: string }[]) =>
  render(
    <MemoryRouter>
      <StreakIndicators kids={kids} />
    </MemoryRouter>,
  );

describe('the dashboard streak indicator (D131)', () => {
  it('shows the count and “Daily Drills”, and opens the child’s Training page', () => {
    show([{ id: 'p1', first_name: 'Sam' }]);
    const link = screen.getByRole('link', { name: 'Sam: 4-day streak. Daily Drills' });
    expect(link).toHaveAttribute('href', '/training/p1');
    expect(link).toHaveTextContent('4');
    expect(link).toHaveTextContent('Daily Drills');
  });
  it('a parent with two children sees one per child, each named', () => {
    show([
      { id: 'p1', first_name: 'Sam' },
      { id: 'p2', first_name: 'Ava' },
    ]);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[1]).toHaveAttribute('href', '/training/p2');
    expect(links[1]).toHaveTextContent('Ava');
    expect(links[1]).toHaveAccessibleName('Ava: 0-day streak. Daily Drills');
  });
  it('shows nothing without a confirmed child', () => {
    show([]);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
