import { beforeEach, describe, expect, it } from 'vitest';
import {
  TUNER_STORAGE_KEY,
  currentRule,
  defaultTuner,
  loadTuner,
  newRule,
  saveTuner,
  tunerSnippet,
  tunerWidth,
} from '../tunerModel';

describe('jersey tuner model (dev-only)', () => {
  beforeEach(() => localStorage.clear());

  it('the proposed default is min(28, 100/maxRow − 3), snapped to 0.5', () => {
    expect([1, 2, 3, 4, 5].map(newRule)).toEqual([28, 28, 28, 22, 17]);
  });

  it('the current rule is min(24, 100/(maxRow+1) − 2), snapped to 0.5', () => {
    expect([1, 2, 3, 4, 5].map(currentRule)).toEqual([24, 24, 23, 18, 14.5]);
  });

  it('rows wider than 5 use the 5 value; rows of 0 use the 1 value', () => {
    const t = defaultTuner();
    expect(tunerWidth(t, 'football', 7)).toBe(t.football[5]);
    expect(tunerWidth(t, 'soccer', 0)).toBe(t.soccer[1]);
  });

  it('round-trips through localStorage and ignores corrupt or partial values', () => {
    const t = defaultTuner();
    t.soccer[4] = 25.5;
    saveTuner(t);
    expect(loadTuner().soccer[4]).toBe(25.5);
    localStorage.setItem(TUNER_STORAGE_KEY, '{"soccer":{"1":1},"baseball":"x"}');
    expect(loadTuner()).toEqual(defaultTuner());
    localStorage.setItem(TUNER_STORAGE_KEY, 'not json');
    expect(loadTuner()).toEqual(defaultTuner());
  });

  it('the snippet is a TypeScript constant with one line per sport', () => {
    const snippet = tunerSnippet(defaultTuner());
    expect(snippet).toContain('export const PERSP_JERSEY_W');
    expect(snippet).toContain('  soccer: { 1: 28, 2: 28, 3: 28, 4: 22, 5: 17 },');
    expect(snippet.trim().endsWith('};')).toBe(true);
  });
});
