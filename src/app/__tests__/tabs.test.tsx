import { describe, expect, it } from 'vitest';
import { SPORTS } from '@/sports/definitions';
import { homeTabLabel, MAX_TABS, tabsFor } from '../tabs';

describe('tabs per role (D53)', () => {
  it('staff keep the sport tabs; parents get their child first', () => {
    expect(tabsFor(SPORTS.soccer, 'coach', 'Nolan').map((t) => t.to)).toEqual([
      '/field',
      '/team',
      '/games',
      '/stats',
    ]);
    expect(tabsFor(SPORTS.soccer, 'parent', 'Nolan').map((t) => t.label)).toEqual([
      'Nolan',
      'Field',
      'Team',
      'Schedule',
      'Stats',
    ]);
  });

  it('folds Lineup into the Diamond tab for a baseball parent so there are never more than five', () => {
    const staff = tabsFor(SPORTS.baseball, 'assistant', 'x').map((t) => t.to);
    expect(staff).toContain('/lineup');
    const parent = tabsFor(SPORTS.baseball, 'parent', 'Mason');
    expect(parent.length).toBeLessThanOrEqual(MAX_TABS);
    expect(parent.map((t) => t.to)).toEqual(['/home', '/field', '/team', '/games', '/stats']);
    expect(parent[1]?.label).toBe('Diamond');
  });

  it('names the home tab after the child', () => {
    expect(homeTabLabel([{ first_name: 'Nolan' }])).toBe('Nolan');
    expect(homeTabLabel([{ first_name: 'Nolan' }, { first_name: 'Teddy' }])).toBe('My players');
    expect(homeTabLabel([])).toBe('Home');
  });
});
