import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SPORTS } from '@/sports/definitions';
import { type Player } from '@/teams/api';
import { type ScoreEvent } from '../api';
import { makeNameLookup } from '../names';
import { ScorePanel } from '../ScorePanel';
import { describeEvent, resetScoreTapGuard } from '../scoring';

const mk = (id: string, first_name: string, n: string): Player => ({
  id,
  team_id: 't',
  first_name,
  last_name: null,
  jersey_number: n,
  is_available: true,
  batting_order: null,
  sort_order: 0,
  archived_at: null,
  created_at: '',
  updated_at: '',
  updated_by: null,
});
const players = [mk('p1', 'Nolan', '1'), mk('p2', 'Teddy', '2')];
const names = makeNameLookup(players);
const ev = (over: Partial<ScoreEvent>): ScoreEvent => ({
  id: 'e1',
  game_id: 'g',
  side: 'us',
  period_index: 0,
  event_type: 'goal',
  points: 1,
  scorer_player_id: 'p2',
  assist_player_id: null,
  occurred_at: '',
  created_by: null,
  created_at: '',
  updated_at: '',
  updated_by: null,
  clock_seconds: null,
  ...over,
});

describe('ScorePanel', () => {
  beforeEach(() => {
    resetScoreTapGuard();
  });

  it('soccer: defaults the scorer to the last scorer, records goal + assist, offers undo', async () => {
    const onAdd = vi.fn();
    const onUndo = vi.fn();
    const onClose = vi.fn();
    render(
      <ScorePanel
        open
        onClose={onClose}
        S={SPORTS.soccer}
        opponent="Bears"
        periodCount={4}
        initialPeriod={2}
        players={players}
        names={names}
        events={[ev({})]}
        onAdd={onAdd}
        onUndo={onUndo}
      />,
    );
    const dialog = screen.getByRole('dialog');
    const scorer = within(dialog).getByRole('radiogroup', { name: 'Scorer' });
    const assist = within(dialog).getByRole('radiogroup', { name: 'Assist' });
    expect(within(scorer).getByRole('radio', { name: '#2 Teddy' })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: 'Quarter 3' })).toBeChecked();
    // the scorer is greyed out in the assist row: a kid cannot assist their own goal
    expect(within(assist).getByRole('radio', { name: '#2 Teddy' })).toBeDisabled();
    await userEvent.click(within(assist).getByRole('radio', { name: '#1 Nolan' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add our goal' }));
    expect(onAdd).toHaveBeenCalledWith({
      side: 'us',
      period_index: 2,
      event_type: 'goal',
      points: 1,
      scorer_player_id: 'p2',
      assist_player_id: 'p1',
    });
    expect(onClose).toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: /Undo last · Q1 · Teddy/ })).toBeInTheDocument();
  });

  it('basketball: +1/+2/+3 per side; opponent events carry no player; double taps are swallowed', async () => {
    const onAdd = vi.fn();
    render(
      <ScorePanel
        open
        onClose={vi.fn()}
        S={SPORTS.basketball}
        opponent="Hawks"
        periodCount={4}
        initialPeriod={0}
        players={players}
        names={names}
        events={[]}
        onAdd={onAdd}
        onUndo={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('radiogroup', { name: 'Assist' })).not.toBeInTheDocument();
    await userEvent.click(
      within(within(dialog).getByRole('radiogroup', { name: 'Scorer' })).getByRole('radio', {
        name: '#1 Nolan',
      }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Our field goal, +2' }));
    expect(onAdd).toHaveBeenLastCalledWith(
      expect.objectContaining({ side: 'us', event_type: 'field_goal', points: 2, scorer_player_id: 'p1' }),
    );
    // the sheet closes after a tap; a second immediate tap on the still-mounted panel is ignored
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hawks three-pointer, +3' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('on-field players first, the bench behind a toggle, the same player never both (D96)', async () => {
    const onAdd = vi.fn();
    const roster = [...players, mk('p3', 'Jack', '3'), mk('p4', 'Hal', '4')];
    render(
      <ScorePanel
        open
        onClose={vi.fn()}
        S={SPORTS.soccer}
        opponent="Bears"
        periodCount={2}
        initialPeriod={0}
        players={roster}
        onField={['p2', 'p1']}
        bench={['p4', 'p3']}
        stamp="H1 · 12:34"
        names={makeNameLookup(roster)}
        events={[]}
        onAdd={onAdd}
        onUndo={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('H1 · 12:34')).toBeInTheDocument();
    const scorer = within(dialog).getByRole('radiogroup', { name: 'Scorer' });
    // field order first, then Unknown; the bench is hidden until asked for
    expect(
      within(scorer)
        .getAllByRole('radio')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['#2 Teddy', '#1 Nolan', 'Unknown']);
    expect(within(scorer).getByRole('radio', { name: 'Unknown' })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Show bench players (2)' }));
    expect(
      within(scorer)
        .getAllByRole('radio')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['#2 Teddy', '#1 Nolan', '#4 Hal', '#3 Jack', 'Unknown']);
    const assist = within(dialog).getByRole('radiogroup', { name: 'Assist' });
    await userEvent.click(within(assist).getByRole('radio', { name: '#1 Nolan' }));
    // picking Nolan as the scorer clears him as the assist and greys him out there
    await userEvent.click(within(scorer).getByRole('radio', { name: '#1 Nolan' }));
    expect(within(scorer).getByRole('radio', { name: '#1 Nolan' })).toBeChecked();
    expect(within(assist).getByRole('radio', { name: '#1 Nolan' })).toBeDisabled();
    expect(within(assist).getByRole('radio', { name: 'No assist' })).toBeChecked();
    await userEvent.click(within(assist).getByRole('radio', { name: '#4 Hal' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add our goal' }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ scorer_player_id: 'p1', assist_player_id: 'p4' }),
    );
  });

  it('describes events for toasts and the log', () => {
    expect(describeEvent(SPORTS.soccer, 4, 'Bears', ev({}), names)).toBe('Q1 · Teddy');
    expect(describeEvent(SPORTS.soccer, 4, 'Bears', ev({ side: 'them', period_index: 3 }), names)).toBe(
      'Q4 · Bears goal',
    );
    expect(
      describeEvent(SPORTS.basketball, 4, 'Hawks', ev({ event_type: 'three_pointer', points: 3 }), names),
    ).toBe('Q1 · Teddy · three-pointer');
    expect(describeEvent(SPORTS.baseball, 6, 'Cubs', ev({ event_type: 'run', period_index: 4 }), names)).toBe(
      'Inn 5 · Teddy',
    );
  });
});
