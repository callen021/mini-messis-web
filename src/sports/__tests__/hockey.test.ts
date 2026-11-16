import { describe, expect, it } from 'vitest';
import { tabsFor } from '@/app/tabs';
import { fillByTime } from '@/clock/autofill';
import { statColumns } from '@/games/stats';
import { DEFAULT_SKILL_TESTS } from '@/skills/defaults';
import { ENABLED_SPORTS, SPORTS, shortPeriod } from '../definitions';
import { STANDING, fieldImage } from '../field';
import { autoFill } from '../lineup';
import { positionName } from '../positions';

describe('hockey (D122)', () => {
  const S = SPORTS.hockey;
  const f = S.formations({ size: 6, gk: true })[0];

  it('is an enabled clock sport: six on the ice, three periods, a goalie, lines as the one formation', () => {
    expect(ENABLED_SPORTS).toContain('hockey');
    expect(S.field).toBe('Rink');
    expect(S.sizes).toEqual([6]);
    expect(S.hasGK).toBe(true);
    expect(S.defaultPeriods).toBe(3);
    expect(S.periodName(3)).toBe('Period');
    expect(shortPeriod(S, 3, 2)).toBe('P3');
    expect(tabsFor(S, 'coach', 'Home').map((t) => t.label)).toEqual(['Rink', 'Team', 'Schedule', 'Stats']);
    expect(f?.name).toBe('Lines');
    expect(f?.positions.map((p) => p.code)).toEqual(['G', 'LD', 'RD', 'LW', 'C', 'RW']);
    expect(f?.positions.map((p) => S.group(p.role))).toEqual(['G', 'D', 'D', 'F', 'F', 'F']);
    expect(S.eligibility?.map(([, l]) => l)).toEqual(['Goalie', 'Defense', 'Forward']);
    expect(positionName(S, 'LD')).toBe('Left defense');
    expect(S.label('RW')).toBe('RIGHT WING');
  });

  it('has its own rink with our net on the goal line, goals with an assist, minutes in clock mode', () => {
    expect(fieldImage('hockey', 'persp').src).toMatch(/hockey-persp/);
    expect(STANDING.hockey.map((s) => s[0])).toEqual(['goal-near']);
    expect(S.scoring.events.map((e) => e.type)).toEqual(['goal']);
    expect(S.scoring.assists).toBe(true);
    expect(statColumns(S, true).map((c) => c.label)).toEqual(['G', 'A', 'MIN']);
    expect(DEFAULT_SKILL_TESTS.hockey.map((t) => t.key)).toEqual([
      'skate',
      'puckweave',
      'shooting',
      'passing',
      'sprint',
    ]);
  });

  it('Auto-fill with skipRoles leaves the goalie spot alone, open or filled, without flagging it', () => {
    if (!f) throw new Error('no formation');
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
    const rank = new Map(ids.map((id) => [id, { seconds: 0, byGroup: {} }]));
    const empty = { formation: f.name, slots: f.positions.map(() => ''), auto: [] };
    const r = fillByTime(
      empty,
      f,
      S,
      ids.map((id) => ({ id })),
      rank,
      { random: () => 0.5, skipRoles: ['G'] },
    );
    expect(r.filled).toBe(5);
    expect(r.period.slots[0]).toBe('');
    expect(r.period.slots.slice(1).every(Boolean)).toBe(true);
    expect(r.skipped).toEqual([]);
    // the template engine honours it too
    const players = ids.map((id) => ({ id, name: id, active: true }));
    const t = autoFill([empty], 0, [f], S, players, { random: () => 0.5, skipRoles: ['G'] });
    expect(t.filled).toBe(5);
    expect(t.periods[0]?.slots[0]).toBe('');
    expect(t.skipped).toEqual([]);
    // without the option the goalie is filled first, as for any sport with a keeper
    const all = fillByTime(
      empty,
      f,
      S,
      ids.map((id) => ({ id })),
      rank,
      { random: () => 0.5 },
    );
    expect(all.filled).toBe(6);
  });
});
