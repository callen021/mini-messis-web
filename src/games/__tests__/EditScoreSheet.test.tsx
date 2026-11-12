import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SPORTS } from '@/sports/definitions';
import { type Player } from '@/teams/api';
import { type ScoreEvent } from '../api';
import { EditScoreSheet } from '../EditScoreSheet';
import { makeNameLookup } from '../names';

const S = SPORTS.soccer;
const players: Player[] = [
  {
    id: 'p1',
    team_id: 't',
    first_name: 'Nolan',
    last_name: null,
    jersey_number: '1',
    is_available: true,
    batting_order: null,
    sort_order: 0,
    archived_at: null,
    created_at: '',
    updated_at: '',
    updated_by: null,
  },
];
const ev = (over: Partial<ScoreEvent>): ScoreEvent => ({
  id: 'e1',
  game_id: 'g',
  side: 'us',
  period_index: 1,
  event_type: 'goal',
  points: 1,
  scorer_player_id: 'p1',
  assist_player_id: null,
  occurred_at: '',
  created_by: null,
  created_at: '',
  updated_at: '',
  updated_by: null,
  clock_seconds: 1345, // 23rd minute of the second half
  ...over,
});

function renderSheet(event: ScoreEvent, clockMode: boolean) {
  const onSave = vi.fn();
  render(
    <EditScoreSheet
      event={event}
      onClose={() => undefined}
      S={S}
      opponent="Tigers"
      periodCount={2}
      players={players}
      names={makeNameLookup(players)}
      onSave={onSave}
      onDelete={() => undefined}
      clockMode={clockMode}
    />,
  );
  return onSave;
}

describe('EditScoreSheet · clock minute (D74)', () => {
  it('period mode shows no minute field and never sends clock_seconds', async () => {
    const onSave = renderSheet(ev({}), false);
    expect(screen.queryByLabelText('Minute')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty('clock_seconds');
  });

  it('clock mode seeds the minute; an unchanged minute keeps the exact second', async () => {
    const onSave = renderSheet(ev({}), true);
    expect(screen.getByLabelText('Minute')).toHaveValue(23);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ clock_seconds: 1345, period_index: 1 }));
  });

  it('a new minute starts at :00 of that minute; clearing it drops the stamp', async () => {
    const onSave = renderSheet(ev({}), true);
    const minute = screen.getByLabelText('Minute');
    await userEvent.clear(minute);
    await userEvent.type(minute, '31');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ clock_seconds: 1800 }));
    await userEvent.clear(minute);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ clock_seconds: null }));
  });
});
