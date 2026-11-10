import { describe, expect, it } from 'vitest';
import {
  bestOf,
  DEFAULT_SKILL_TESTS,
  defaultsPayload,
  fmtResult,
  mainSide,
  metricLabel,
  scoreOf,
  type SkillResult,
  type SkillTest,
  sortResults,
  sparkPoints,
  trend,
} from '../defaults';

const test = (over: Partial<SkillTest>): SkillTest => ({
  id: 't',
  team_id: 'team',
  key: 'k',
  name: 'Test',
  instructions: '',
  metric: 'count',
  unit: null,
  has_sides: false,
  higher_is_better: true,
  attempts: 5,
  sort_order: 0,
  is_active: true,
  created_at: '',
  updated_at: '',
  updated_by: null,
  ...over,
});
let n = 0;
const result = (value: number, over: Partial<SkillResult> = {}): SkillResult => ({
  id: `r${++n}`,
  player_id: 'p',
  skill_test_id: 't',
  tested_on: `2026-10-${String(n).padStart(2, '0')}`,
  value,
  attempts: null,
  side: null,
  note: null,
  recorded_by: null,
  created_at: String(n),
  updated_at: '',
  updated_by: null,
  ...over,
});

describe('default test sets', () => {
  it('ships the soccer set with the coach wording and drafts for the other sports', () => {
    expect(DEFAULT_SKILL_TESTS.soccer.map((t) => t.key)).toEqual([
      'ticktocks',
      'juggling',
      'dribble',
      'passing',
      'shooting',
      'kickdist',
      'sprint',
    ]);
    expect(DEFAULT_SKILL_TESTS.soccer.every((t) => !t.draft)).toBe(true);
    expect(DEFAULT_SKILL_TESTS.baseball.every((t) => t.draft)).toBe(true);
    const sprint = DEFAULT_SKILL_TESTS.soccer.find((t) => t.key === 'sprint');
    expect(sprint?.higher_is_better).toBe(false);
    expect(DEFAULT_SKILL_TESTS.soccer.find((t) => t.key === 'passing')?.has_sides).toBe(true);
  });
  it('strips the draft flag from the database payload', () => {
    expect(defaultsPayload('baseball')[0]).not.toHaveProperty('draft');
    expect(defaultsPayload('baseball')[0]).toMatchObject({ key: 'throwacc', attempts: 10 });
  });
});

describe('formatting and bests', () => {
  it('formats by metric', () => {
    expect(fmtResult(test({ metric: 'made_of_attempted' }), result(4, { attempts: 5, side: 'right' }))).toBe(
      '4/5 R',
    );
    expect(
      fmtResult(test({ metric: 'made_of_attempted' }), result(4, { attempts: 5, side: 'right' }), false),
    ).toBe('4/5');
    expect(fmtResult(test({ metric: 'time_seconds' }), result(12.44))).toBe('12.4 s');
    expect(fmtResult(test({ metric: 'distance', unit: 'yd' }), result(25))).toBe('25 yd');
    expect(fmtResult(test({ metric: 'count' }), result(20))).toBe('20');
    expect(fmtResult(test({}), null)).toBe('–');
    expect(metricLabel(test({ metric: 'made_of_attempted', has_sides: true }))).toBe(
      'Made of 5 · L/R · higher wins',
    );
    expect(metricLabel(test({ metric: 'time_seconds', higher_is_better: false }))).toBe(
      'Time (s) · lower wins',
    );
  });

  it('made/attempted compares as a ratio', () => {
    const t = test({ metric: 'made_of_attempted' });
    expect(scoreOf(t, result(4, { attempts: 5 }))).toBeCloseTo(0.8);
    expect(scoreOf(t, result(7, { attempts: 10 }))).toBeCloseTo(0.7);
  });

  it('personal best honours higher/lower and the right side for two-sided tests', () => {
    const higher = test({});
    const list = sortResults([result(12), result(17), result(20), result(15)]);
    expect(bestOf(higher, list)?.value).toBe(20);
    const lower = test({ metric: 'time_seconds', higher_is_better: false });
    expect(bestOf(lower, [result(14.8), result(13.1), result(12.4)])?.value).toBe(12.4);
    const sided = test({ metric: 'made_of_attempted', has_sides: true });
    const both = [result(1, { attempts: 5, side: 'left' }), result(4, { attempts: 5, side: 'right' })];
    expect(mainSide(sided, both)).toHaveLength(1);
    expect(bestOf(sided, mainSide(sided, both))?.side).toBe('right');
    expect(bestOf(higher, [])).toBeNull();
  });

  it('trend arrow compares the last two results in the right direction', () => {
    expect(trend(test({}), [result(3), result(5)])).toBe(1);
    expect(trend(test({}), [result(5), result(3)])).toBe(-1);
    expect(trend(test({ higher_is_better: false }), [result(5), result(3)])).toBe(1);
    expect(trend(test({}), [result(5), result(5)])).toBe(0);
    expect(trend(test({}), [result(5)])).toBe(0);
  });

  it('sparkline needs two points and keeps the best value at the top', () => {
    expect(sparkPoints(test({}), [result(1)])).toBeNull();
    const up = sparkPoints(test({}), [result(1), result(3)]);
    expect(up?.[1]?.[1]).toBeLessThan(up?.[0]?.[1] ?? 0);
    const lowerBetter = sparkPoints(test({ higher_is_better: false }), [result(3), result(1)]);
    expect(lowerBetter?.[1]?.[1]).toBeLessThan(lowerBetter?.[0]?.[1] ?? 0);
  });
});
