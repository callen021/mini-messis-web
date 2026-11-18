import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as Api from '../api';
import { CoachTraining } from '../CoachTraining';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof Api>('../api');
  return {
    ...actual,
    useStreak: () => ({
      data: { current: 6, longest: 14, todayCounts: true, misses: 1, celebrate: null },
      isPending: false,
      isError: false,
    }),
  };
});

describe('a coach’s view of at-home training (D133)', () => {
  it('shows the child’s streak and longest streak, read only', () => {
    render(<CoachTraining playerId="p1" playerName="Sam" />);
    expect(screen.getByText('Streak: 6 days · today counts')).toBeInTheDocument();
    expect(screen.getByText('Longest: 14 days')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
