import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseContent } from '@/library/types';
import type * as Api from '../api';
import { CoachTraining } from '../CoachTraining';

const level = (mode: string) => ({ text: 'Say it.', challenge: { mode, seconds: 60 } });
const drill = (slug: string, title: string, mode: string) => ({
  id: `id-${slug}`,
  slug,
  title,
  home: parseContent({ home: { levels: [level(mode), level(mode), level(mode)] } }).home,
});

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof Api>('../api');
  return {
    ...actual,
    useStreak: () => ({
      data: { current: 6, longest: 14, todayCounts: true, misses: 1, celebrate: null },
      isPending: false,
      isError: false,
    }),
    useHomeDrills: () => ({
      data: [drill('toe-taps', 'Toe Taps', 'timer'), drill('cone-dribbling', 'Cone Dribbling', 'stopwatch')],
    }),
    useBests: () => ({
      data: new Map([
        ['id-toe-taps:1', { reps: 52, seconds: null, attempts: 4 }],
        ['id-cone-dribbling:2', { reps: null, seconds: 8.4, attempts: 1 }],
      ]),
    }),
  };
});
vi.mock('@/teams/TeamContext', () => ({ useCurrentTeam: () => ({ sport: 'soccer' }) }));

describe('a coach’s view of at-home training (D133)', () => {
  it('shows the child’s streak and longest streak, read only', () => {
    render(<CoachTraining playerId="p1" playerName="Sam" />);
    expect(screen.getByText('Streak: 6 days · today counts')).toBeInTheDocument();
    expect(screen.getByText('Longest: 14 days')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('and the child’s personal bests, per drill and level (D140)', () => {
    render(<CoachTraining playerId="p1" playerName="Sam" />);
    expect(screen.getByText('Personal bests at home')).toBeInTheDocument();
    expect(screen.getByText('Toe Taps · Level 1').closest('.row')).toHaveTextContent('4 scores');
    expect(screen.getByText('Toe Taps · Level 1').closest('.row')).toHaveTextContent('52');
    expect(screen.getByText('Cone Dribbling · Level 2').closest('.row')).toHaveTextContent('8.40 s');
    expect(screen.queryByText('Toe Taps · Level 2')).toBeNull(); // no score there yet
  });
});
