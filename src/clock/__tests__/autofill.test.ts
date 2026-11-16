import { describe, expect, it } from 'vitest';
import { SPORTS, formationByName } from '@/sports/definitions';
import { type Period } from '@/sports/types';
import { type TimeRank, fillByTime, rankFromStints, suggestStarters } from '../autofill';

const S = SPORTS.soccer;
const forms = S.formations({ size: 7, gk: true });
const f33 = formationByName(forms, '3-3'); // ST ST ST DEF DEF DEF GK
const ids = Array.from({ length: 10 }, (_, i) => ({ id: `p${i + 1}` }));
const seq = () => {
  let n = 0;
  return () => (n += 0.01);
};
const rank = (entries: Record<string, Partial<TimeRank>>): Map<string, TimeRank> =>
  new Map(
    Object.entries(entries).map(([id, r]) => [id, { seconds: r.seconds ?? 0, byGroup: r.byGroup ?? {} }]),
  );

describe('auto-fill by minutes (D71)', () => {
  it('fills open spots with the fewest seconds first, goalie first, hand picks untouched', () => {
    const period: Period = { formation: '3-3', slots: ['p1', '', '', '', '', '', ''], auto: [] };
    const r = rank({
      p1: { seconds: 0 },
      p2: { seconds: 3000 },
      p3: { seconds: 100 },
      p4: { seconds: 200 },
      p5: { seconds: 300 },
      p6: { seconds: 400 },
      p7: { seconds: 500 },
      p8: { seconds: 600 },
      p9: { seconds: 700, byGroup: { GK: 700 } },
      p10: { seconds: 800 },
    });
    const { period: out, filled } = fillByTime(period, f33, S, ids, r, { random: seq() });
    expect(filled).toBe(6);
    expect(out.slots[0]).toBe('p1'); // hand pick stays
    expect(out.slots[6]).toBe('p3'); // goalie spot first, to the least-used player
    expect(out.slots).not.toContain('p2'); // the most-used player sits
    expect(out.auto).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(out.slots).size).toBe(7);
  });

  it('breaks a seconds tie by fewest seconds in that position group (rotating groups), then random', () => {
    const period: Period = { formation: '3-3', slots: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', ''], auto: [] };
    const r = rank({
      p7: { seconds: 600, byGroup: { GK: 600 } },
      p8: { seconds: 600, byGroup: { DEF: 600 } },
    });
    const { period: out } = fillByTime(period, f33, S, ids.slice(0, 8), r, { random: seq() });
    expect(out.slots[6]).toBe('p8'); // same minutes; p8 has not yet had a turn in goal
  });

  it('nobody left on the bench leaves spots open; a full field fills nothing', () => {
    const period: Period = { formation: '3-3', slots: ['', '', '', '', '', '', ''], auto: [] };
    const { period: out, filled } = fillByTime(period, f33, S, ids.slice(0, 3), new Map(), { random: seq() });
    expect(filled).toBe(3);
    expect(out.slots.filter(Boolean)).toHaveLength(3);
    const full: Period = { formation: '3-3', slots: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'], auto: [] };
    expect(fillByTime(full, f33, S, ids, new Map()).filled).toBe(0);
  });

  it('suggestStarters re-picks every spot by minutes this game', () => {
    const r = rank({ p1: { seconds: 1500 }, p2: { seconds: 1500 }, p3: { seconds: 1500 } });
    const out = suggestStarters(f33, S, ids, r, { random: seq() }).period;
    expect(out.slots.filter(Boolean)).toHaveLength(7);
    expect(out.slots).not.toContain('p1');
    expect(out.slots).not.toContain('p2');
    expect(out.slots).not.toContain('p3');
    expect(out.auto).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('rankFromStints', () => {
  it('sums seconds per player and per position group', () => {
    const r = rankFromStints(
      [
        { player_id: 'a', position_role: 'GK', seconds: 100 },
        { player_id: 'a', position_role: 'ST', seconds: 50 },
        { player_id: 'b', position_role: 'DEF', seconds: 20 },
      ],
      (role) => role,
    );
    expect(r.get('a')).toEqual({ seconds: 150, byGroup: { GK: 100, ST: 50 } });
    expect(r.get('b')).toEqual({ seconds: 20, byGroup: { DEF: 20 } });
  });
});

describe('eligible positions (D117)', () => {
  it('never places a player in a group marked never, and flags a spot nobody eligible can take', () => {
    const period: Period = { formation: '3-3', slots: ['', '', '', '', '', '', ''], auto: [] };
    // p1 has the fewest seconds but never plays in goal
    const r = rank({
      p1: { seconds: 0 },
      p2: { seconds: 10 },
      p3: { seconds: 20 },
      p4: { seconds: 30 },
      p5: { seconds: 40 },
      p6: { seconds: 50 },
      p7: { seconds: 60 },
    });
    const eligible = (id: string, g: string) => !(id === 'p1' && g === 'GK');
    const out = fillByTime(period, f33, S, ids.slice(0, 7), r, { random: seq(), eligible });
    expect(out.filled).toBe(7);
    expect(out.skipped).toEqual([]);
    expect(out.period.slots[6]).toBe('p2'); // the keeper spot skips p1
    expect(out.period.slots).toContain('p1'); // but p1 still plays, elsewhere
    // nobody may keep goal: the spot stays open and is named
    const none = fillByTime(period, f33, S, ids.slice(0, 3), r, {
      random: seq(),
      eligible: (_, g) => g !== 'GK',
    });
    expect(none.filled).toBe(3);
    expect(none.period.slots[6]).toBe('');
    expect(none.skipped).toEqual(['GK']);
  });

  it('suggestStarters honours it too', () => {
    const out = suggestStarters(f33, S, ids.slice(0, 7), new Map(), {
      random: seq(),
      eligible: (id, g) => !(g === 'ST' && ['p1', 'p2', 'p3', 'p4', 'p5'].includes(id)),
    });
    // only p6 and p7 may play up front: two strikers filled, the third flagged
    expect(out.period.slots.slice(0, 3).filter(Boolean).sort()).toEqual(['p6', 'p7']);
    expect(out.skipped).toHaveLength(1);
    expect(out.filled).toBe(6);
  });
});
