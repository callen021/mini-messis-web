import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, act as reactAct, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionSheetProvider } from '@/components/Sheet';
import { ToastProvider } from '@/components/Toast';
import type * as Guards from '@/auth/guards';
import type * as LineupsApi from '@/lineups/api';
import type * as TeamsApi from '@/teams/api';
import type * as UseNow from '../useNow';
import { type StoredPeriod } from '@/lineups/convert';
import { SPORTS, formationByName } from '@/sports/definitions';
import { type Player, type Team } from '@/teams/api';
import { TeamProviderForTests, type TeamContextValue } from '@/teams/TeamContext';
import { todayISO } from '@/games/format';
import { ClockFieldPage } from '../ClockFieldPage';
import { type ClockState, type Stint } from '../clock';

const S = SPORTS.soccer;
const forms = S.formations({ size: 7, gk: true });
const f33 = formationByName(forms, '3-3');

const saveStarters = vi.fn();
const act = vi.fn();
let staff = true;
let liveGame: { id: string; opponent: string } | null = null;
let periods: StoredPeriod[] = [];
let clock: ClockState = { periodIndex: 0, clockSeconds: 0, runningSince: null, periodLengths: [] };
let stints: Stint[] = [];
let seasonMinutes = new Map<string, { seconds: number; byGroup: Record<string, number> }>();

vi.mock('@/auth/guards', async () => {
  const actual = await vi.importActual<typeof Guards>('@/auth/guards');
  return { ...actual, useIsStaff: () => staff, useIsCoach: () => staff };
});
vi.mock('@/lineups/api', async () => {
  const actual = await vi.importActual<typeof LineupsApi>('@/lineups/api');
  return {
    ...actual,
    useCurrentPlan: () => ({
      gameId: liveGame?.id ?? null,
      liveGame,
      periods,
      isPending: false,
      error: null,
    }),
    useFormations: () => ({ forms, formationFor: (n: string) => formationByName(forms, n) }),
    useMyChildren: () => ({ data: new Set<string>(['p2']), isPending: false }),
  };
});
vi.mock('@/teams/api', async () => {
  const actual = await vi.importActual<typeof TeamsApi>('@/teams/api');
  return { ...actual, usePlayers: () => ({ data: players, isPending: false }) };
});
vi.mock('@/teams/teamMutations', () => ({ useRenameTeam: () => ({ mutate: vi.fn() }) }));
let scoreEvents: Record<string, unknown>[] = [];
vi.mock('@/games/api', () => ({
  useScoreEvents: () => ({ data: scoreEvents }),
  useAddScoreEvent: () => ({ mutate: vi.fn() }),
  useDeleteScoreEvent: () => ({ mutate: vi.fn() }),
  useCreateGame: () => ({ mutate: vi.fn(), isPending: false }),
  useStartGame: () => ({ mutate: startGame, isPending: false }),
}));
vi.mock('../api', () => ({
  useClockAction: () => ({ mutate: act, isPending: false }),
  useGameClock: () => ({ data: clock, isPending: false }),
  useStints: () => ({ data: stints, isPending: false }),
  useServerTimeSync: () => undefined,
  useSeasonMinutes: () => ({ data: seasonMinutes, isPending: false }),
}));
vi.mock('../template', () => ({ useSaveStarters: () => ({ mutate: saveStarters, isPending: false }) }));
const FIXED_NOW = Date.parse('2026-11-12T15:00:00Z');
let useNowImpl: (active: boolean, stepMs?: number) => number = () => FIXED_NOW;
vi.mock('../useNow', () => ({
  useServerNow: (active: boolean, stepMs?: number) => useNowImpl(active, stepMs),
}));
vi.mock('../useWakeLock', () => ({ useWakeLock: () => undefined }));
let plannedGame: {
  id: string;
  opponent: string;
  game_date: string;
  start_time: string | null;
  status: 'upcoming';
} | null = null;
const startGame = vi.fn();
vi.mock('@/rsvp/api', () => ({
  usePlannedGame: () => ({
    game: plannedGame,
    replies: new Map(),
    parentOut: new Set<string>(),
    byParent: new Set<string>(),
    isPending: false,
  }),
  useSetRsvp: () => ({ mutate: vi.fn(), isPending: false }),
  useRsvps: () => ({ data: [], isPending: false }),
}));

const mk = (id: string, first_name: string, n: string, is_available = true): Player => ({
  id,
  team_id: 't1',
  first_name,
  last_name: null,
  jersey_number: n,
  is_available,
  batting_order: null,
  sort_order: 0,
  archived_at: null,
  created_at: '',
  updated_at: '',
  updated_by: null,
});
const players = [
  mk('p1', 'Nolan', '1'),
  mk('p2', 'Teddy', '2'),
  mk('p3', 'Jack', '3'),
  mk('p4', 'Weston', '4'),
  mk('p5', 'Sam', '5'),
  mk('p6', 'Milo', '6'),
  mk('p7', 'Quincy', '7'),
  mk('p8', 'Hal', '8'),
  mk('p9', 'Nick', '9'),
  mk('p10', 'Atlas', '10', false),
];
const team: Team = {
  id: 't1',
  name: 'Strikers',
  sport: 'soccer',
  owner_id: 'u1',
  join_code: 'ABCD2345',
  join_code_rotated_at: '',
  join_enabled: true,
  require_approval: false,
  timezone: 'America/Chicago',
  parent_stats: 'own',
  time_mode: 'clock',
  clock_periods: 2,
  period_minutes: 25,
  side_size: 7,
  has_gk: true,
  periods_count: 4,
  colors: S.defaultColors,
  last_batter_player_id: null,
  archived_at: null,
  created_at: '',
  updated_at: '',
  updated_by: null,
};
const stored = (slots: string[], i: number): StoredPeriod => ({
  lineupId: `l${i}`,
  formation: '3-3',
  slots,
  auto: [],
  bench: [],
  codes: f33.positions.map((p) => p.code),
  roles: f33.positions.map((p) => p.role),
});
const stint = (over: Partial<Stint>): Stint => ({
  id: Math.random().toString(36),
  player_id: 'p',
  period_index: 0,
  slot_index: 0,
  position_role: 'ST',
  position_code: 'LW',
  clock_start: 0,
  clock_end: null,
  ...over,
});
const STARTERS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];

function renderPage() {
  const ctx: TeamContextValue = {
    teamId: 't1',
    team,
    sport: 'soccer',
    role: staff ? 'coach' : 'parent',
    isOwner: staff,
    memberships: [],
    switchTeam: () => undefined,
    adminActing: false,
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <ActionSheetProvider>
          <MemoryRouter>
            <TeamProviderForTests value={ctx}>
              <ClockFieldPage />
            </TeamProviderForTests>
          </MemoryRouter>
        </ActionSheetProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}
const field = (name: string) => screen.getByRole('button', { name: new RegExp(`^[A-Z ]+: ${name}`) });
const bench = (name: string) => screen.getByRole('button', { name: new RegExp(`^Bench: ${name}`) });

describe('ClockFieldPage · starters on the template (D70)', () => {
  beforeEach(() => {
    saveStarters.mockReset();
    act.mockReset();
    staff = true;
    liveGame = null;
    periods = [stored(STARTERS, 0), stored(STARTERS, 1), stored(STARTERS, 2), stored(STARTERS, 3)];
  });

  it('shows one field of starters and a bench row of the other available players, two-thirds size', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 2, name: 'Starters' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^[A-Z ]+: / })).toHaveLength(7);
    const benchRow = screen.getByRole('group', { name: 'Bench' });
    expect(benchRow).toHaveTextContent('Bench · 2');
    expect(within(benchRow).getByRole('button', { name: /Bench: Hal #8/ })).toBeInTheDocument();
    expect(within(benchRow).getByRole('button', { name: /Bench: Nick #9/ })).toBeInTheDocument();
    // marked out: not on the bench
    expect(screen.queryByRole('button', { name: /Atlas/ })).not.toBeInTheDocument();
    expect(document.querySelectorAll('.bslot')).toHaveLength(2);
    expect(document.querySelector('.benchrow .upnext')).toHaveTextContent('Up Next');
    // the jerseys come before the hint text (D77)
    const row = document.querySelector('.benchrow') as HTMLElement;
    const hint = document.querySelector('.taphint') as HTMLElement;
    expect(row.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('field then bench swaps those two players; the hint names the selected player', async () => {
    renderPage();
    await userEvent.click(field('Nolan'));
    expect(field('Nolan')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Tap a player to swap with Nolan')).toBeInTheDocument();
    await userEvent.click(bench('Hal'));
    expect(saveStarters).toHaveBeenCalledTimes(1);
    // both jerseys of the completed tap get the gold outline for a moment (D77)
    expect(bench('Hal')).toHaveClass('flash');
    expect(field('Nolan')).toHaveClass('flash'); // the save is mocked, so Nolan still stands there
    const arg = saveStarters.mock.calls[0]?.[0] as { starters: { slots: string[] }; count: number };
    expect(arg.starters.slots[0]).toBe('p8');
    expect(arg.starters.slots).not.toContain('p1');
    expect(arg.count).toBe(4);
  });

  it('bench then field works the same way; two on-field jerseys swap positions', async () => {
    renderPage();
    await userEvent.click(bench('Nick'));
    await userEvent.click(field('Teddy'));
    let arg = saveStarters.mock.calls[0]?.[0] as { starters: { slots: string[] } };
    expect(arg.starters.slots[1]).toBe('p9');
    saveStarters.mockReset();
    await userEvent.click(field('Nolan'));
    await userEvent.click(field('Jack'));
    arg = saveStarters.mock.calls[0]?.[0] as { starters: { slots: string[] } };
    expect(arg.starters.slots[0]).toBe('p3');
    expect(arg.starters.slots[2]).toBe('p1');
  });

  it('tapping the selected jersey again cancels; two bench jerseys swap places in line (D79)', async () => {
    renderPage();
    await userEvent.click(field('Nolan'));
    await userEvent.click(field('Nolan'));
    expect(field('Nolan')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/Tap a player to swap/)).not.toBeInTheDocument();
    await userEvent.click(bench('Hal'));
    await userEvent.click(bench('Nick'));
    expect(bench('Hal')).toHaveAttribute('aria-pressed', 'false');
    const arg = saveStarters.mock.calls[0]?.[0] as { starters: { bench: string[] } };
    expect(arg.starters.bench).toEqual(['p9', 'p8']);
  });

  it('a selected starter can be taken off with nobody on (Open the spot)', async () => {
    renderPage();
    await userEvent.click(field('Nolan'));
    await userEvent.click(screen.getByRole('button', { name: 'Open the spot' }));
    const arg = saveStarters.mock.calls[0]?.[0] as { starters: { slots: string[] } };
    expect(arg.starters.slots[0]).toBe('');
  });

  it('an empty spot is selected by a tap and filled by the next bench tap; no picker sheet (D86)', async () => {
    periods = [stored(['', ...STARTERS.slice(1)], 0)];
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'STRIKER: open' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Tap a bench player for LW')).toBeInTheDocument();
    await userEvent.click(bench('Hal'));
    const arg = saveStarters.mock.calls[0]?.[0] as { starters: { slots: string[] } };
    expect(arg.starters.slots[0]).toBe('p8');
  });
});

describe('ClockFieldPage · live game on the clock (D66, D70)', () => {
  beforeEach(() => {
    act.mockReset();
    staff = true;
    liveGame = { id: 'g1', opponent: 'Tigers' };
    periods = [stored(STARTERS, 0), stored(STARTERS, 1)];
    clock = { periodIndex: 0, clockSeconds: 120, runningSince: null, periodLengths: [] };
    stints = STARTERS.map((id, i) =>
      stint({ player_id: id, slot_index: i, position_code: f33.positions[i]?.code ?? '' }),
    );
  });

  it('a ticking clock never moves focus out of the open goal sheet, nor remounts it (D95)', async () => {
    const real = await vi.importActual<typeof UseNow>('../useNow');
    useNowImpl = real.useServerNow;
    try {
      clock = {
        periodIndex: 0,
        clockSeconds: 120,
        runningSince: new Date().toISOString(),
        periodLengths: [],
      };
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: /Add a goal/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Goal · vs Tigers' });
      // the trap's one initial focus (an animation frame after open) lands first; then the coach moves on
      await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
      const assist = within(within(dialog).getByRole('radiogroup', { name: 'Assist' })).getByRole('radio', {
        name: '#3 Jack',
      });
      assist.focus();
      expect(assist).toHaveFocus();
      // three clock ticks while the sheet is open
      await reactAct(async () => {
        await new Promise((r) => setTimeout(r, 1300));
      });
      expect(screen.getByRole('dialog', { name: 'Goal · vs Tigers' })).toBe(dialog);
      expect(
        within(within(dialog).getByRole('radiogroup', { name: 'Assist' })).getByRole('radio', {
          name: '#3 Jack',
        }),
      ).toBe(assist);
      expect(assist).toHaveFocus();
    } finally {
      useNowImpl = () => FIXED_NOW;
    }
  });

  it('one period: a continuous clock with Start and Pause, Finish game instead of End, no period label (D97)', () => {
    team.clock_periods = 1;
    try {
      periods = [stored(STARTERS, 0)];
      renderPage();
      expect(screen.getByRole('heading', { level: 2, name: 'Game' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^End / })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Suggest starters' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Finish game' })).toBeInTheDocument();
      expect(screen.getByText(/one period on the clock|Live vs Tigers/)).toBeInTheDocument();
    } finally {
      team.clock_periods = 2;
    }
  });

  it('shows the period, the clock and each shift; nothing under the bench jerseys (D99)', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 2, name: 'H1' })).toBeInTheDocument();
    // 25-minute halves, 2:00 played and paused → 23:00 left
    expect(screen.getByLabelText('23:00 left, paused')).toHaveTextContent('23:00');
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End H1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(field('Nolan')).toHaveAccessibleName(/2:00 this shift/);
    expect(bench('Hal')).toHaveAccessibleName('Bench: Hal #8, up next');
    expect(screen.getByRole('group', { name: 'Bench' }).querySelectorAll('.jtime')).toHaveLength(0);
  });

  it('a substitution and a swap are single server calls', async () => {
    renderPage();
    await userEvent.click(bench('Hal'));
    await userEvent.click(field('Nolan'));
    expect(act).toHaveBeenCalledWith({ kind: 'sub', off: 'p1', on: 'p8' }, expect.anything());
    await userEvent.click(field('Teddy'));
    await userEvent.click(field('Jack'));
    expect(act).toHaveBeenCalledWith({ kind: 'swap', a: 'p2', b: 'p3' }, expect.anything());
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(act).toHaveBeenCalledWith({ kind: 'start' }, expect.anything());
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(act).toHaveBeenCalledWith({ kind: 'undo' }, expect.anything());
    // in a live game, opening a selected spot empties it on the clock (an injury with no sub)
    await userEvent.click(field('Nolan'));
    await userEvent.click(screen.getByRole('button', { name: 'Open the spot' }));
    expect(act).toHaveBeenCalledWith({ kind: 'empty', off: 'p1' }, expect.anything());
  });

  it("the bench is the lineup row's queue, not a sort (D79)", async () => {
    stints = [
      ...stints,
      stint({ player_id: 'p8', slot_index: 0, clock_start: 0, clock_end: 60 }), // Hal played a minute
    ];
    periods = [{ ...stored(STARTERS, 0), bench: ['p8', 'p9'] }, stored(STARTERS, 1)];
    renderPage();
    const names = within(screen.getByRole('group', { name: 'Bench' }))
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'));
    expect(names[0]).toBe('Bench: Hal #8, up next'); // first in line though he has played more
    expect(names[1]).toMatch(/^Bench: Nick/);
    await userEvent.click(bench('Hal'));
    await userEvent.click(bench('Nick'));
    expect(act).toHaveBeenCalledWith({ kind: 'bench', a: 'p8', b: 'p9' }, expect.anything());
  });

  it('the safety stop shows a short note on the game (D105)', () => {
    clock = {
      periodIndex: 0,
      clockSeconds: 3300,
      runningSince: null,
      periodLengths: [],
      limitSeconds: 3300,
      autoPaused: true,
    };
    renderPage();
    expect(screen.getByText(/Clock paused automatically/)).toHaveTextContent(
      'Clock paused automatically at 55:00 · it ran 30 minutes past the 25-minute period length.',
    );
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    clock = { periodIndex: 0, clockSeconds: 120, runningSince: null, periodLengths: [] };
  });

  it('a running clock reads from the timestamp and "Pause" is offered', () => {
    clock = { ...clock, clockSeconds: 0, runningSince: '2026-11-12T14:58:30Z' };
    renderPage();
    expect(screen.getByLabelText('23:30 left, running')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('parents see the clock and the bench read-only, with their child starred', () => {
    staff = false;
    renderPage();
    expect(screen.getByLabelText('23:00 left, paused')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Resume|Pause|End H1|Undo|Auto-fill|Suggest/ }),
    ).not.toBeInTheDocument();
    expect(field('Nolan')).toBeDisabled();
    expect(bench('Hal')).toBeDisabled();
    expect(field('Teddy')).toHaveClass('highlight');
    expect(screen.queryByText(/Tap a jersey/)).not.toBeInTheDocument();
  });

  it('before kickoff, Auto-fill fills open spots by season minutes in one lineup call (D71)', async () => {
    stints = stints.slice(0, 6); // the goalie spot is open
    clock = { periodIndex: 0, clockSeconds: 0, runningSince: null, periodLengths: [] };
    seasonMinutes = new Map([
      ['p7', { seconds: 2000, byGroup: {} }],
      ['p8', { seconds: 3000, byGroup: {} }],
      ['p9', { seconds: 100, byGroup: {} }],
    ]);
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Auto-fill' }));
    const call = act.mock.calls.find((c) => (c[0] as { kind: string }).kind === 'lineup')?.[0] as {
      slots: { player_id: string | null; auto_picked: boolean }[];
    };
    expect(call.slots[6]).toEqual(expect.objectContaining({ player_id: 'p9', auto_picked: true }));
    expect(call.slots[0]).toEqual(expect.objectContaining({ player_id: 'p1', auto_picked: false }));
  });

  it('at halftime, Suggest starters re-picks everyone by minutes this game', async () => {
    clock = { periodIndex: 1, clockSeconds: 0, runningSince: null, periodLengths: [1500] };
    stints = [
      ...STARTERS.map((id, i) => stint({ player_id: id, slot_index: i, clock_start: 0, clock_end: 1500 })),
      ...STARTERS.map((id, i) => stint({ player_id: id, slot_index: i, period_index: 1, clock_start: 0 })),
    ];
    renderPage();
    expect(screen.getByRole('heading', { level: 2, name: 'H2' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Suggest starters' }));
    const call = act.mock.calls.find((c) => (c[0] as { kind: string }).kind === 'lineup')?.[0] as {
      slots: { player_id: string | null }[];
    };
    const picked = call.slots.map((s) => s.player_id);
    expect(picked).toContain('p8'); // the two who sat out the first half start the second
    expect(picked).toContain('p9');
    expect(picked.filter(Boolean)).toHaveLength(7);
  });

  it('full time: FT, no clock controls, a link to finish', () => {
    clock = { periodIndex: 2, clockSeconds: 0, runningSince: null, periodLengths: [1500, 1500] };
    renderPage();
    expect(screen.getByRole('heading', { level: 2, name: 'Full time' })).toBeInTheDocument();
    expect(screen.getByLabelText('Full time')).toHaveTextContent('FT');
    expect(screen.getByRole('button', { name: 'Finish on the game page' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /End H/ })).not.toBeInTheDocument();
  });
});

describe('ClockFieldPage · the live game round (D108)', () => {
  beforeEach(() => {
    act.mockReset();
    startGame.mockReset();
    staff = true;
    plannedGame = null;
    liveGame = { id: 'g1', opponent: 'Lions' };
    periods = [stored(STARTERS, 0), stored(STARTERS, 1)];
    stints = STARTERS.map((id, i) =>
      stint({ player_id: id, slot_index: i, position_code: f33.positions[i]?.code ?? '' }),
    );
    clock = { periodIndex: 0, clockSeconds: 0, runningSince: null, periodLengths: [] };
    scoreEvents = [];
  });

  it('the bar reads Start clock at 0:00 and Resume past it; the chip is never a button (D109)', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Start clock' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start the clock/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset clock' })).not.toBeInTheDocument();
    cleanup();
    clock = { periodIndex: 0, clockSeconds: 120, runningSince: null, periodLengths: [] };
    renderPage();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.getByLabelText('23:00 left, paused')).toBeInTheDocument();
  });

  it('paused past 0:00 in the first period with no score: Reset clock asks, then resets (D109)', async () => {
    clock = { periodIndex: 0, clockSeconds: 120, runningSince: null, periodLengths: [] };
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Reset clock' }));
    const confirm = await screen.findByRole('dialog', { name: 'Reset the clock to 0:00?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Reset clock' }));
    expect(act).toHaveBeenCalledWith({ kind: 'reset' }, expect.anything());
  });

  it('no Reset clock while running, in a later period, or once a score is in (D109)', () => {
    clock = { periodIndex: 0, clockSeconds: 120, runningSince: '2026-11-12T14:59:00Z', periodLengths: [] };
    renderPage();
    expect(screen.queryByRole('button', { name: 'Reset clock' })).not.toBeInTheDocument();
    cleanup();
    clock = { periodIndex: 1, clockSeconds: 120, runningSince: null, periodLengths: [1500] };
    renderPage();
    expect(screen.queryByRole('button', { name: 'Reset clock' })).not.toBeInTheDocument();
    cleanup();
    clock = { periodIndex: 0, clockSeconds: 120, runningSince: null, periodLengths: [] };
    scoreEvents = [
      {
        id: 'e1',
        game_id: 'g1',
        side: 'us',
        points: 1,
        event_type: 'goal',
        period_index: 0,
        scorer_player_id: null,
        assist_player_id: null,
        occurred_at: '2026-11-12T14:00:00Z',
        clock_seconds: 30,
      },
    ];
    renderPage();
    expect(screen.queryByRole('button', { name: 'Reset clock' })).not.toBeInTheDocument();
  });

  it('before a start the lineup check lists open spots: Fix lineup stops, Start anyway starts (D109)', async () => {
    liveGame = null;
    plannedGame = {
      id: 'g9',
      opponent: 'Bears',
      game_date: todayISO(),
      start_time: null,
      status: 'upcoming',
    };
    periods = [stored(['p1', '', 'p3', 'p4', 'p5', 'p6', 'p7'], 0), stored(STARTERS, 1)];
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Start a game and record/ }));
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Start a game' })).getByRole('button', {
        name: /Start vs Bears/,
      }),
    );
    const warn = await screen.findByRole('dialog', { name: 'Check the lineup' });
    expect(warn).toHaveTextContent('1 open spot (ST)');
    await userEvent.click(within(warn).getByRole('button', { name: 'Fix lineup' }));
    expect(startGame).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Start a game and record/ }));
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Start a game' })).getByRole('button', {
        name: /Start vs Bears/,
      }),
    );
    const warn2 = await screen.findByRole('dialog', { name: 'Check the lineup' });
    await userEvent.click(within(warn2).getByRole('button', { name: 'Start anyway' }));
    expect(startGame).toHaveBeenCalledWith('g9', expect.anything());
  });

  it('soccer, paused mid-period: the formation select changes shape with the same players (nearest spots)', async () => {
    clock = { periodIndex: 0, clockSeconds: 600, runningSince: null, periodLengths: [] };
    renderPage();
    const select = screen.getByRole('combobox', { name: 'Formation' });
    await userEvent.selectOptions(select, '2-3-1');
    expect(act).toHaveBeenCalledTimes(1);
    const call = act.mock.calls[0]?.[0] as {
      kind: string;
      formation: string;
      slots: { player_id: string | null; position_role: string }[];
    };
    expect(call.kind).toBe('formation');
    expect(call.formation).toBe('2-3-1');
    expect(
      call.slots
        .map((x) => x.player_id)
        .filter(Boolean)
        .sort(),
    ).toEqual([...STARTERS].sort());
    // the keeper stays in goal
    const gk = call.slots.findIndex((x) => x.position_role === 'GK');
    expect(call.slots[gk]?.player_id).toBe('p7');
  });

  it('while the clock runs the formation is a pill, not a select', () => {
    clock = { periodIndex: 0, clockSeconds: 600, runningSince: '2026-11-12T14:59:00Z', periodLengths: [] };
    renderPage();
    expect(screen.queryByRole('combobox', { name: 'Formation' })).not.toBeInTheDocument();
    expect(screen.getByText('3-3', { selector: '.pill' })).toBeInTheDocument();
  });

  it('the score tap with no live game offers the next scheduled game, then confirms when it is not today', async () => {
    liveGame = null;
    plannedGame = {
      id: 'g9',
      opponent: 'Bears',
      game_date: '2099-01-02',
      start_time: '10:00',
      status: 'upcoming',
    };
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Start a game and record/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Start a game' });
    expect(within(sheet).getByRole('button', { name: /^New game$/ })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: /Start vs Bears · .*10:00 AM/ }));
    const confirm = await screen.findByRole('dialog', { name: 'Start it now?' });
    expect(confirm).toHaveTextContent('This game is scheduled for');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Start game' }));
    expect(startGame).toHaveBeenCalledWith('g9', expect.anything());
  });

  it('with nothing scheduled the sheet offers only New game, which opens the form', async () => {
    liveGame = null;
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Start a game and record/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Start a game' });
    expect(within(sheet).queryByRole('button', { name: /Start vs/ })).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: /^New game$/ }));
    expect(
      await screen.findByRole('dialog', { name: 'Start a game to record the score' }),
    ).toBeInTheDocument();
  });
});
