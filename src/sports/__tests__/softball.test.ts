import { describe, expect, it } from 'vitest';
import { tabsFor } from '@/app/tabs';
import { statColumns } from '@/games/stats';
import { DEFAULT_SKILL_TESTS } from '@/skills/defaults';
import { ENABLED_SPORTS, SPORTS } from '../definitions';
import { fieldImage } from '../field';
import { positionName } from '../positions';

describe('softball (D119) reuses the baseball model', () => {
  const B = SPORTS.baseball;
  const S = SPORTS.softball;

  it('is an enabled sport of its own with the diamond, innings and a batting order', () => {
    expect(ENABLED_SPORTS).toContain('softball');
    expect(S.key).toBe('softball');
    expect(S.name).toBe('Softball');
    expect(S.field).toBe('Diamond');
    expect(S.lineup).toBe(true);
    expect(S.periodName(6)).toBe('Inning');
    expect(S.sizes).toEqual(B.sizes);
    expect(S.defaultSize).toBe(9);
    expect(tabsFor(S, 'coach', 'Home').map((t) => t.label)).toEqual([
      'Diamond',
      'Lineup',
      'Team',
      'Schedule',
      'Training',
    ]);
  });

  it('shares the formations, the artwork, the position names, the scoring and the skill tests', () => {
    for (const size of S.sizes) {
      expect(S.formations({ size, gk: false }).map((f) => f.name)).toEqual(
        B.formations({ size, gk: false }).map((f) => f.name),
      );
    }
    expect(S.formations({ size: 10, gk: false })[0]?.name).toBe('4 outfielders');
    expect(fieldImage('softball', 'persp')).toEqual(fieldImage('baseball', 'persp'));
    expect(fieldImage('softball', 'flat')).toEqual(fieldImage('baseball', 'flat'));
    expect(positionName(S, 'LCF')).toBe('Left-center field');
    expect(S.scoring).toBe(B.scoring);
    expect(statColumns(S, false).map((c) => c.label)).toEqual(statColumns(B, false).map((c) => c.label));
    expect(DEFAULT_SKILL_TESTS.softball).toBe(DEFAULT_SKILL_TESTS.baseball);
    expect(S.eligibility?.map(([, l]) => l)).toEqual(['Pitcher', 'Catcher', 'Infield', 'Outfield']);
    expect(S.jersey).toBe('baseball');
  });
});
