import { describe, expect, it } from 'vitest';
import { type Stint } from '../clock';
import { parseClock, stintProblem } from '../stintEdit';

const st = (over: Partial<Stint>): Stint => ({
  id: 'x',
  player_id: 'a',
  period_index: 0,
  slot_index: 0,
  position_role: 'ST',
  position_code: 'ST',
  clock_start: 0,
  clock_end: 600,
  ...over,
});

describe('corrections after a game (D67)', () => {
  it('parses minutes:seconds and whole minutes', () => {
    expect(parseClock('12:30')).toBe(750);
    expect(parseClock('12')).toBe(720);
    expect(parseClock('0:05')).toBe(5);
    expect(parseClock('')).toBeNull();
    expect(parseClock('12:75')).toBeNull();
    expect(parseClock('abc')).toBeNull();
  });

  it('a stint must end after it starts and stay inside its period', () => {
    const lengths = [1500, 1500];
    expect(stintProblem({ id: null, playerId: 'a', period: 0, start: 100, end: 100 }, [], lengths)).toMatch(
      /end after/,
    );
    expect(stintProblem({ id: null, playerId: 'a', period: 0, start: 0, end: 1501 }, [], lengths)).toMatch(
      /inside the period \(25:00/,
    );
    expect(stintProblem({ id: null, playerId: 'a', period: 2, start: 0, end: 10 }, [], lengths)).toMatch(
      /no recorded length/,
    );
    expect(stintProblem({ id: null, playerId: 'a', period: 1, start: 0, end: 1500 }, [], lengths)).toBeNull();
  });

  it("never overlaps the same player's other stints, ignoring itself and other players", () => {
    const others = [
      st({ id: 's1', clock_start: 0, clock_end: 600 }),
      st({ id: 's2', player_id: 'b', clock_start: 0, clock_end: 1500 }),
    ];
    const lengths = [1500];
    expect(
      stintProblem({ id: null, playerId: 'a', period: 0, start: 500, end: 700 }, others, lengths),
    ).toMatch(/overlaps 0:00–10:00/);
    expect(
      stintProblem({ id: 's1', playerId: 'a', period: 0, start: 0, end: 700 }, others, lengths),
    ).toBeNull();
    expect(
      stintProblem({ id: null, playerId: 'a', period: 0, start: 600, end: 700 }, others, lengths),
    ).toBeNull();
  });
});
