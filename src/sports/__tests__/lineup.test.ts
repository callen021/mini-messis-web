import { describe, expect, it } from 'vitest';
import { SPORTS, defaultFormation, formationByName } from '../definitions';
import {
  activePlayers,
  assignSlot,
  autoFill,
  autoFillAll,
  balance,
  balanceHint,
  clearAll,
  clearPlayer,
  counts,
  emptyPeriod,
  fixPeriods,
  openCount,
  placePlayer,
  remap,
  resizePeriods,
  samplePlan,
  totalLevel,
} from '../lineup';
import { type EnginePlayer, type Period } from '../types';

const S = SPORTS.soccer;
const forms = S.formations({ size: 7, gk: true });
const f33 = formationByName(forms, '3-3'); // roles: ST ST ST MID MID MID GK (3 forwards drawn first)
const f231 = formationByName(forms, '2-3-1'); // ST, MID×3, DEF×2, GK

const players: EnginePlayer[] = Array.from({ length: 10 }, (_, i) => ({
  id: `p${i + 1}`,
  name: `Player ${i + 1}`,
  active: true,
}));

/** Deterministic "random": returns increasing values so ties break by player order. */
const seq = () => {
  let n = 0;
  return () => (n += 0.01);
};

describe('remap', () => {
  it('keeps players in the same role first, then fills open spots, and clears auto flags', () => {
    // 3-3 is drawn as DEF? no: 3-3 is DEF-ST → roles [ST,ST,ST,DEF,DEF,DEF,GK]
    const roles33 = f33.positions.map((p) => p.role);
    expect(roles33).toEqual(['ST', 'ST', 'ST', 'DEF', 'DEF', 'DEF', 'GK']);
    const period: Period = {
      formation: '3-3',
      slots: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'],
      auto: [0, 1],
    };
    const out = remap(period, f33, f231, players);
    expect(out.formation).toBe('2-3-1');
    expect(out.auto).toEqual([]);
    const roles231 = f231.positions.map((p) => p.role);
    expect(roles231).toEqual(['ST', 'MID', 'MID', 'MID', 'DEF', 'DEF', 'GK']);
    // p1 keeps ST, GK keeps GK, two defenders keep DEF, the rest spill into open MID spots
    expect(out.slots[0]).toBe('p1');
    expect(out.slots[6]).toBe('p7');
    expect(out.slots.slice(4, 6)).toEqual(['p4', 'p5']);
    expect(new Set(out.slots.filter(Boolean)).size).toBe(7);
    expect(out.slots.filter(Boolean).sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
  });

  it('drops players that no longer exist and never duplicates a player', () => {
    const period: Period = { formation: '3-3', slots: ['p1', 'ghost', 'p1', '', 'p2', '', ''], auto: [] };
    const out = remap(period, f33, f231, players);
    expect(out.slots.filter(Boolean).sort()).toEqual(['p1', 'p2']);
  });

  it('shrinking to a smaller formation leaves the extras out', () => {
    const small = S.formations({ size: 5, gk: true });
    const target = formationByName(small, '2-2'); // ST ST DEF DEF GK
    const period: Period = { formation: '3-3', slots: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'], auto: [] };
    const out = remap(period, f33, target, players);
    expect(out.slots).toHaveLength(5);
    expect(out.slots).toEqual(['p1', 'p2', 'p4', 'p5', 'p7']);
  });
});

describe('fixPeriods', () => {
  it('replaces an unknown formation with the sport default and keeps players by index', () => {
    const periods: Period[] = [{ formation: 'bogus', slots: ['p1', 'p2', 'p3'], auto: [0] }];
    const out = fixPeriods(periods, forms, S, players);
    expect(out[0]?.formation).toBe('3-3');
    expect(out[0]?.slots).toEqual(['p1', 'p2', 'p3', '', '', '', '']);
    expect(out[0]?.auto).toEqual([]);
  });

  it('clears players who are marked out or gone, and prunes auto flags', () => {
    const roster = players.map((p) => (p.id === 'p2' ? { ...p, active: false } : p));
    const periods: Period[] = [
      { formation: '3-3', slots: ['p1', 'p2', 'gone', '', '', '', 'p7'], auto: [0, 1, 2, 9] },
    ];
    const out = fixPeriods(periods, forms, S, roster);
    expect(out[0]?.slots).toEqual(['p1', '', '', '', '', '', 'p7']);
    expect(out[0]?.auto).toEqual([0]);
  });

  it('fixes a slot-count mismatch for a known formation name', () => {
    const periods: Period[] = [{ formation: '3-3', slots: ['p1', 'p2'], auto: [] }];
    const out = fixPeriods(periods, forms, S, players);
    expect(out[0]?.slots).toHaveLength(7);
    expect(out[0]?.slots.slice(0, 2)).toEqual(['p1', 'p2']);
  });

  it('leaves a consistent plan untouched (structurally equal)', () => {
    const periods: Period[] = [
      { formation: '2-3-1', slots: ['p1', '', 'p3', '', 'p5', '', 'p7'], auto: [2] },
    ];
    expect(fixPeriods(periods, forms, S, players)).toEqual(periods);
  });
});

describe('resizePeriods', () => {
  it('grows with empty default-formation periods and shrinks by truncating', () => {
    const base = [emptyPeriod(f231)];
    const grown = resizePeriods(base, 3, forms, S);
    expect(grown).toHaveLength(3);
    expect(grown[1]?.formation).toBe('3-3');
    expect(grown[2]?.slots).toEqual(['', '', '', '', '', '', '']);
    expect(resizePeriods(grown, 2, forms, S)).toHaveLength(2);
  });
});

describe('counts / totalLevel / balance', () => {
  const plan: Period[] = [
    { formation: '3-3', slots: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'], auto: [] },
    { formation: '3-3', slots: ['p1', 'p2', 'p3', 'p8', 'p9', 'p10', 'p7'], auto: [] },
    { formation: '3-3', slots: ['p1', 'p1', '', '', '', '', ''], auto: [] }, // duplicate counts once
    { formation: '3-3', slots: ['', '', '', '', '', '', ''], auto: [] },
  ];
  it('counts a player once per period', () => {
    const c = counts(plan, players);
    expect(c.p1).toBe(3);
    expect(c.p2).toBe(2);
    expect(c.p8).toBe(1);
    expect(c.p4).toBe(1);
  });
  it('thresholds: every period = warn, under floor(half) = low, else good', () => {
    expect(totalLevel(4, 4)).toBe('warn');
    expect(totalLevel(5, 4)).toBe('warn');
    expect(totalLevel(1, 4)).toBe('low');
    expect(totalLevel(2, 4)).toBe('good');
    expect(totalLevel(3, 4)).toBe('good');
    expect(totalLevel(0, 3)).toBe('low');
    expect(totalLevel(1, 3)).toBe('good');
  });
  it('balance summarises range/average and flags a spread over one period', () => {
    const b = balance(plan, players);
    expect(b).toEqual({ min: 1, max: 3, average: '1.5', percent: 33, spread: true });
    expect(balanceHint(b, 'quarter')).toBe('Consider giving more time to players with fewer quarters.');
    const even = balance([plan[0] as Period], players.slice(0, 7));
    expect(even?.spread).toBe(false);
    expect(balanceHint(even, 'quarter')).toBe('Playing time is reasonably balanced.');
    expect(balance([], [])).toBeNull();
    expect(balanceHint(null, 'quarter')).toBe('Add players to begin.');
  });
  it('openCount', () => {
    expect(openCount(plan)).toBe(5 + 7);
  });
});

describe('autoFill', () => {
  const plan4 = () => Array.from({ length: 4 }, () => emptyPeriod(f33));

  it('fills every open slot when the bench is big enough and flags them as auto', () => {
    const { periods, filled } = autoFill(plan4(), 0, forms, S, players, { random: seq() });
    expect(filled).toBe(7);
    expect(periods[0]?.slots.every(Boolean)).toBe(true);
    expect(periods[0]?.auto).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(new Set(periods[0]?.slots).size).toBe(7);
    // other periods untouched
    expect(periods[1]).toEqual(emptyPeriod(f33));
  });

  it('never touches hand-picked slots and does not duplicate a player already on the field', () => {
    const plan = plan4();
    plan[0] = { formation: '3-3', slots: ['p3', '', '', '', '', '', 'p1'], auto: [] };
    const { periods, filled } = autoFill(plan, 0, forms, S, players, { random: seq() });
    expect(filled).toBe(5);
    expect(periods[0]?.slots[0]).toBe('p3');
    expect(periods[0]?.slots[6]).toBe('p1');
    expect(periods[0]?.auto).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(periods[0]?.slots).size).toBe(7);
  });

  it('prefers players with the fewest periods so far in this plan', () => {
    const plan = plan4();
    // p1..p7 already play Q1 and Q2; p8, p9, p10 have not played
    plan[0] = { formation: '3-3', slots: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'], auto: [] };
    plan[1] = { formation: '3-3', slots: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'], auto: [] };
    const { periods } = autoFill(plan, 2, forms, S, players, { random: seq() });
    const q3 = periods[2]?.slots ?? [];
    expect(q3).toContain('p8');
    expect(q3).toContain('p9');
    expect(q3).toContain('p10');
  });

  it('fills the goalie slot first and prefers players without a turn in that position group', () => {
    const plan = plan4();
    // p1 was GK in Q1; everyone else sat. In Q2 everybody has 0 or 1 periods: p2..p10 (0) tie, p1 has 1.
    plan[0] = { formation: '3-3', slots: ['', '', '', '', '', '', 'p1'], auto: [] };
    // Make p2..p10 all have 1 period as strikers in Q3 so Q2's pick is by group history:
    plan[2] = { formation: '3-3', slots: ['p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'], auto: [] };
    // Now counts: p1=1 (GK), p2..p8=1, p9=0, p10=0. Open Q2 → GK first: fewest periods → p9 or p10.
    const { periods } = autoFill(plan, 1, forms, S, players, { random: seq() });
    const gk = periods[1]?.slots[6];
    expect(['p9', 'p10']).toContain(gk);
    // ST slots (0..2) go to the remaining fewest-played players; p8 (GK in Q3) prefers a non-GK turn later
    expect(periods[1]?.slots.every(Boolean)).toBe(true);
  });

  it('redo clears only auto-picked slots and re-picks them', () => {
    const plan = plan4();
    plan[0] = { formation: '3-3', slots: ['p3', '', '', '', '', '', 'p1'], auto: [] };
    const first = autoFill(plan, 0, forms, S, players, { random: seq() }).periods;
    const redo = autoFill(first, 0, forms, S, players, { redo: true, random: seq() });
    expect(redo.filled).toBe(5);
    expect(redo.periods[0]?.slots[0]).toBe('p3');
    expect(redo.periods[0]?.slots[6]).toBe('p1');
    expect(redo.periods[0]?.auto).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns 0 when nothing is open or nobody is left on the bench', () => {
    const full: Period[] = [
      { formation: '3-3', slots: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'], auto: [] },
    ];
    expect(autoFill(full, 0, forms, S, players).filled).toBe(0);
    const few = players.slice(0, 2);
    const r = autoFill(plan4(), 0, forms, S, few, { random: seq() });
    expect(r.filled).toBe(2);
    expect(r.periods[0]?.slots.filter(Boolean)).toHaveLength(2);
  });

  it('skips players marked out', () => {
    const roster = players.map((p) => (p.id === 'p1' ? { ...p, active: false } : p));
    const { periods } = autoFill(plan4(), 0, forms, S, roster, { random: seq() });
    expect(periods[0]?.slots).not.toContain('p1');
  });

  it('autoFillAll spreads periods evenly across the roster (visibility, not enforcement)', () => {
    const { periods, filled } = autoFillAll(plan4(), forms, S, players, { random: seq() });
    expect(filled).toBe(28);
    const c = counts(periods, players);
    const vals = Object.values(c);
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(1); // 28 slots / 10 players → 2 or 3 each
  });
});

describe('slot edits', () => {
  const period: Period = { formation: '3-3', slots: ['p1', 'p2', '', '', '', '', 'p7'], auto: [1] };

  it('assignSlot moves a player already on the field and clears auto flags on touched slots', () => {
    const r = assignSlot(period, 3, 'p2');
    expect(r.period.slots).toEqual(['p1', '', '', 'p2', '', '', 'p7']);
    expect(r.movedFrom).toBe(1);
    expect(r.bumped).toBeNull();
    expect(r.period.auto).toEqual([]);
  });
  it('assignSlot replaces the occupant and reports the bump', () => {
    const r = assignSlot(period, 0, 'p5');
    expect(r.period.slots[0]).toBe('p5');
    expect(r.bumped).toBe('p1');
  });
  it('assignSlot with "" clears the slot', () => {
    const r = assignSlot(period, 1, '');
    expect(r.period.slots[1]).toBe('');
    expect(r.period.auto).toEqual([]);
  });
  it('placePlayer swaps in and leaves the previous occupant unassigned; null sits the player', () => {
    const r = placePlayer(period, 'p7', 0);
    expect(r.period.slots).toEqual(['p7', 'p2', '', '', '', '', '']);
    expect(r.bumped).toBe('p1');
    expect(r.movedFrom).toBe(6);
    const sit = placePlayer(period, 'p2', null);
    expect(sit.period.slots[1]).toBe('');
    expect(sit.period.auto).toEqual([]);
  });
  it('clearPlayer / clearAll', () => {
    const plan = [period, { ...period, slots: ['p7', '', '', '', '', '', ''] }];
    expect(clearPlayer(plan, 'p7').map((q) => q.slots.includes('p7'))).toEqual([false, false]);
    expect(clearAll(plan).every((q) => q.slots.every((s) => s === '') && q.auto.length === 0)).toBe(true);
  });
  it('activePlayers filters unnamed and out players', () => {
    expect(
      activePlayers([
        { id: 'a', name: ' ', active: true },
        { id: 'b', name: 'B', active: false },
        { id: 'c', name: 'C', active: true },
      ]).map((p) => p.id),
    ).toEqual(['c']);
  });
});

describe('samplePlan', () => {
  it('rotates players through the slots like the legacy example team', () => {
    const ids = players.map((p) => p.id); // 10 players, 7 slots
    const plan = samplePlan(4, defaultFormation(forms, S), ids);
    expect(plan).toHaveLength(4);
    expect(plan[0]?.slots).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
    // start for period 1 = (1*(10-7)) % 10 = 3 → p4..p10
    expect(plan[1]?.slots).toEqual(['p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10']);
    const c = counts(plan, players);
    expect(Math.max(...Object.values(c)) - Math.min(...Object.values(c))).toBeLessThanOrEqual(1);
  });
  it('leaves slots open when there are fewer players than positions', () => {
    const plan = samplePlan(1, f33, ['a', 'b']);
    expect(plan[0]?.slots).toEqual(['a', 'b', '', '', '', '', '']);
  });
});
