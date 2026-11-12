import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Game } from '@/games/api';
import { SPORTS, formationByName } from '@/sports/definitions';
import { type Player, type Team } from '@/teams/api';
import { TeamProviderForTests, type TeamContextValue } from '@/teams/TeamContext';
import { ChildClockRow } from '../ChildClockRow';
import { type ClockState, type Stint } from '../clock';

let clock: ClockState = { periodIndex: 0, clockSeconds: 600, runningSince: null, periodLengths: [] };
let stints: Stint[] = [];
vi.mock('../api', () => ({
  useGameClock: () => ({ data: clock, isPending: false }),
  useStints: () => ({ data: stints, isPending: false }),
}));
vi.mock('../useNow', () => ({ useServerNow: () => Date.parse('2026-11-12T15:00:00Z') }));

const S = SPORTS.soccer;
const forms = S.formations({ size: 7, gk: true });
const formationFor = (n: string) => formationByName(forms, n);
const child: Player = {
  id: 'c1',
  team_id: 't1',
  first_name: 'Ava',
  last_name: null,
  jersey_number: '1',
  is_available: true,
  batting_order: null,
  sort_order: 0,
  archived_at: null,
  created_at: '',
  updated_at: '',
  updated_by: null,
};
const team = {
  id: 't1',
  sport: 'soccer',
  time_mode: 'clock',
  clock_periods: 2,
  colors: {},
} as unknown as Team;
const ctx: TeamContextValue = {
  teamId: 't1',
  team,
  sport: 'soccer',
  role: 'parent',
  isOwner: false,
  memberships: [],
  switchTeam: () => undefined,
  adminActing: false,
};
const live = { id: 'g1', opponent: 'Tigers' } as Game;
const starters = { formation: '3-3', slots: ['c1', '', '', '', '', '', ''], auto: [] };

function renderRow(liveGame: Game | null) {
  render(
    <TeamProviderForTests value={ctx}>
      <ChildClockRow child={child} live={liveGame} starters={starters} formationFor={formationFor} />
    </TeamProviderForTests>,
  );
}

describe('ChildClockRow (D73)', () => {
  beforeEach(() => {
    clock = { periodIndex: 0, clockSeconds: 600, runningSince: null, periodLengths: [] };
    stints = [];
  });

  it('before a game: the starting position, or not in the lineup', () => {
    renderRow(null);
    expect(screen.getByText('Starting at Left wing')).toBeInTheDocument();
  });

  it('live, on the field: position, minutes and the current shift', () => {
    stints = [
      {
        id: 's1',
        player_id: 'c1',
        period_index: 0,
        slot_index: 0,
        position_role: 'ST',
        position_code: 'LW',
        clock_start: 120,
        clock_end: null,
      },
    ];
    renderRow(live);
    expect(screen.getByText('On the field · Left wing')).toBeInTheDocument();
    expect(screen.getByText('8 min played · 1 shift · this shift 8:00')).toBeInTheDocument();
  });

  it('live, on the bench: minutes so far and the rest', () => {
    stints = [
      {
        id: 's1',
        player_id: 'c1',
        period_index: 0,
        slot_index: 0,
        position_role: 'ST',
        position_code: 'LW',
        clock_start: 0,
        clock_end: 300,
      },
    ];
    renderRow(live);
    expect(screen.getByText('On the bench')).toBeInTheDocument();
    expect(screen.getByText('5 min played · 1 shift · resting 5:00')).toBeInTheDocument();
  });
});
