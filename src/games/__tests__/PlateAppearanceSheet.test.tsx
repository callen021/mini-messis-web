import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SPORTS } from '@/sports/definitions';
import { type Player } from '@/teams/api';
import { type ScoreEvent } from '../api';
import { LineScore } from '../LineScore';
import { makeNameLookup } from '../names';
import { PlateAppearanceSheet } from '../PlateAppearanceSheet';

const mk = (id: string, first_name: string): Player => ({
  id,
  team_id: 't',
  first_name,
  last_name: null,
  jersey_number: null,
  is_available: true,
  batting_order: null,
  sort_order: 0,
  archived_at: null,
  created_at: '',
  updated_at: '',
  updated_by: null,
});
const players = [mk('p1', 'Mason'), mk('p2', 'Owen')];
const names = makeNameLookup(players);

describe('PlateAppearanceSheet', () => {
  it('saves a plain "batted" with no result in one tap', async () => {
    const onSave = vi.fn();
    render(
      <PlateAppearanceSheet
        open
        onClose={vi.fn()}
        batterId="p1"
        players={players}
        names={names}
        inning={3}
        inningCount={6}
        onSave={onSave}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Mason batted');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save · batted, no result' }));
    expect(onSave).toHaveBeenCalledWith({ player_id: 'p1', inning: 3, result: 'none', rbi: 0 });
  });

  it('records a result and RBI; tapping the result again clears it', async () => {
    const onSave = vi.fn();
    render(
      <PlateAppearanceSheet
        open
        onClose={vi.fn()}
        batterId="p2"
        players={players}
        names={names}
        inning={1}
        inningCount={6}
        onSave={onSave}
      />,
    );
    const dialog = screen.getByRole('dialog');
    const hr = within(dialog).getByRole('button', { name: /HR/ });
    await userEvent.click(hr);
    expect(hr).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(dialog).getByRole('button', { name: /Increase Runs batted in/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: /Increase Runs batted in/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save · Home run' }));
    expect(onSave).toHaveBeenCalledWith({ player_id: 'p2', inning: 1, result: 'home_run', rbi: 2 });
    await userEvent.click(hr);
    expect(hr).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('LineScore', () => {
  const ev = (side: 'us' | 'them', period: number): ScoreEvent => ({
    id: `${side}${period}${Math.random()}`,
    game_id: 'g',
    side,
    period_index: period,
    event_type: 'run',
    points: 1,
    scorer_player_id: null,
    assist_player_id: null,
    occurred_at: '',
    created_by: null,
    created_at: '',
    updated_at: '',
    updated_by: null,
  });
  it('renders one column per inning plus totals', () => {
    render(
      <LineScore
        S={SPORTS.baseball}
        events={[ev('us', 0), ev('us', 0), ev('them', 2)]}
        periodCount={3}
        opponent="Cubs"
      />,
    );
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(
      within(rows[1] as HTMLElement)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['2', '0', '0', '2']);
    expect(
      within(rows[2] as HTMLElement)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['0', '0', '1', '1']);
    expect(screen.getByRole('columnheader', { name: 'R' })).toBeInTheDocument();
  });
});
