import { describe, expect, it } from 'vitest';
import { type ScoreEvent } from '@/games/api';
import { matchDecided, pointsLabel, setTarget, setWon, setsState } from '../volleyball';

const rules = { vb_set_points: 25, vb_deciding_points: 15, vb_win_by_two: true };
const ev = (side: 'us' | 'them', set: number): ScoreEvent =>
  ({
    id: Math.random().toString(36),
    game_id: 'g1',
    side,
    period_index: set,
    event_type: 'point',
    points: 1,
    scorer_player_id: null,
    assist_player_id: null,
    clock_seconds: null,
    occurred_at: '',
    created_by: null,
    created_at: '',
    updated_at: '',
    updated_by: null,
  }) as ScoreEvent;
const points = (us: number, them: number, set = 0) => [
  ...Array.from({ length: us }, () => ev('us', set)),
  ...Array.from({ length: them }, () => ev('them', set)),
];

describe('volleyball sets (D121)', () => {
  it('the deciding set is the last possible one and has its own target; one set uses the set target', () => {
    expect(setTarget(rules, 0, 3)).toBe(25);
    expect(setTarget(rules, 1, 3)).toBe(25);
    expect(setTarget(rules, 2, 3)).toBe(15);
    expect(setTarget(rules, 4, 5)).toBe(15);
    expect(setTarget(rules, 0, 1)).toBe(25);
  });

  it('a set is won at the target with a two-point lead, or at the target alone without win-by-two', () => {
    expect(setWon(25, 23, 25, true)).toBe('us');
    expect(setWon(25, 24, 25, true)).toBeNull();
    expect(setWon(26, 24, 25, true)).toBe('us');
    expect(setWon(24, 26, 25, true)).toBe('them');
    expect(setWon(25, 24, 25, false)).toBe('us');
    expect(setWon(14, 15, 15, false)).toBe('them');
    expect(setWon(10, 3, 25, true)).toBeNull();
  });

  it('sets won count the sets that have ended; the current set shows its points', () => {
    const log = [...points(25, 20, 0), ...points(18, 25, 1), ...points(7, 5, 2)];
    const s = setsState(log, 3, 2);
    expect(s).toMatchObject({ us: 1, them: 1, setUs: 7, setThem: 5 });
    expect(s.line.us).toEqual([25, 18, 7]);
    // a set still in progress is not counted, even when a side leads
    expect(setsState(log, 3, 1)).toMatchObject({ us: 1, them: 0, setUs: 18, setThem: 25 });
    expect(setsState([], 3, 0)).toMatchObject({ us: 0, them: 0, setUs: 0, setThem: 0 });
  });

  it('the match is decided at more than half the sets, or once every set has been played', () => {
    expect(matchDecided({ us: 2, them: 0 }, 3, 2)).toBe(true);
    expect(matchDecided({ us: 1, them: 1 }, 3, 2)).toBe(false);
    expect(matchDecided({ us: 1, them: 2 }, 3, 3)).toBe(true);
    expect(matchDecided({ us: 1, them: 0 }, 1, 1)).toBe(true);
    expect(matchDecided({ us: 0, them: 0 }, 1, 0)).toBe(false);
    expect(matchDecided({ us: 2, them: 2 }, 5, 4)).toBe(false);
  });

  it('points read "1 pt" / "4 pts"', () => {
    expect(pointsLabel(1)).toBe('1 pt');
    expect(pointsLabel(4)).toBe('4 pts');
    expect(pointsLabel(0)).toBe('0 pts');
  });
});
