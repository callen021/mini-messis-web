import { describe, expect, it } from 'vitest';
import { DEFAULT_SKILL_TESTS } from '../defaults';

import sql from '../../../supabase/migrations/20261109000800_skills_defaults.sql?raw';

describe('default_skill_tests() in SQL mirrors src/skills/defaults.ts', () => {
  it('every TS default appears in the SQL set with the same key, name, metric and attempts', () => {
    for (const [sport, tests] of Object.entries(DEFAULT_SKILL_TESTS)) {
      if (!tests.length) continue;
      for (const t of tests) {
        expect(sql, `${sport}/${t.key}`).toContain(`"key":"${t.key}","name":"${t.name}"`);
        expect(sql, `${sport}/${t.key} metric`).toContain(
          `"key":"${t.key}","name":"${t.name}","instructions":"${t.instructions}","metric":"${t.metric}"`,
        );
        expect(sql, `${sport}/${t.key} attempts`).toMatch(
          new RegExp(`"key":"${t.key}"[^\n]*"attempts":${t.attempts ?? 5}`),
        );
      }
    }
  });
  it('every enabled sport has a sprint-speed test', () => {
    for (const sport of ['soccer', 'baseball', 'basketball', 'lacrosse'] as const) {
      expect(DEFAULT_SKILL_TESTS[sport].find((t) => t.key === 'sprint')?.name).toBe('Sprint speed');
    }
  });
});
