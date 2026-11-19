import { describe, expect, it } from 'vitest';
import { tabsFor } from '@/app/tabs';
import { statColumns } from '@/games/stats';
import { DEFAULT_SKILL_TESTS } from '@/skills/defaults';
import { ENABLED_SPORTS, SPORTS, chipLabel, shortPeriod } from '../definitions';
import { STANDING, fieldImage } from '../field';
import { positionName } from '../positions';

describe('volleyball (D121)', () => {
  const S = SPORTS.volleyball;

  it('is an enabled sport: six on the court, sets as the periods, no goalie, no eligibility screen', () => {
    expect(ENABLED_SPORTS).toContain('volleyball');
    expect(S.field).toBe('Court');
    expect(S.sizes).toEqual([6]);
    expect(S.defaultSize).toBe(6);
    expect(S.hasGK).toBe(false);
    expect(S.defaultPeriods).toBe(3);
    expect(S.periodOptions).toEqual([1, 3, 5]);
    expect(S.periodName(3)).toBe('Set');
    expect(shortPeriod(S, 3, 1)).toBe('Set 2');
    expect(chipLabel(S, 3, 1)).toBe('2');
    expect(S.eligibility).toBeUndefined();
    expect(tabsFor(S, 'coach', 'Home').map((t) => t.label)).toEqual([
      'Court',
      'Team',
      'Schedule',
      'Training',
    ]);
  });

  it('one formation: the six rotation spots, slot i = spot i + 1, the server right back', () => {
    const forms = S.formations({ size: 6, gk: false });
    expect(forms).toHaveLength(1);
    const f = forms[0];
    expect(f?.name).toBe('Rotation');
    expect(f?.positions.map((p) => p.code)).toEqual(['RB', 'RF', 'MF', 'LF', 'LB', 'MB']);
    expect(f?.positions.map((p) => S.group(p.role))).toEqual(['B', 'F', 'F', 'F', 'B', 'B']);
    // the front row is near the net (y 0), the back row near our end line
    expect(f?.positions.filter((p) => S.group(p.role) === 'F').every((p) => p.y < 50)).toBe(true);
    expect(f?.positions.filter((p) => S.group(p.role) === 'B').every((p) => p.y > 50)).toBe(true);
    expect(positionName(S, 'RB')).toBe('Right back · spot 1');
    expect(S.label('MF')).toBe('MIDDLE FRONT');
  });

  it('has its own court with the net on the far line, points as the score and points/sets played as the stats', () => {
    expect(fieldImage('volleyball', 'persp').src).toMatch(/volleyball-persp/);
    expect(fieldImage('volleyball', 'flat').src).toMatch(/volleyball-flat/);
    expect(STANDING.volleyball.map((s) => s[0])).toEqual(['net']);
    expect(S.scoring.events.map((e) => e.type)).toEqual(['point']);
    expect(S.scoring.assists).toBe(false);
    expect(statColumns(S, true).map((c) => c.label)).toEqual(['GP', 'SETS', 'PTS']);
    expect(DEFAULT_SKILL_TESTS.volleyball.map((t) => t.key)).toEqual([
      'serves',
      'passing',
      'setting',
      'wallvolley',
      'sprint',
    ]);
  });
});
