import { describe, expect, it } from 'vitest';
import { SPORTS } from '@/sports/definitions';
import { foldsLineup, homeTabLabel, MAX_TABS, tabsFor } from '../tabs';

describe('tabs per role (D53, D135)', () => {
  it('staff without a child: Field, Team, Schedule, Training, and no Stats tab', () => {
    const tabs = tabsFor(SPORTS.soccer, 'coach', 'Home');
    expect(tabs.map((t) => t.to)).toEqual(['/field', '/team', '/games', '/training']);
    expect(tabs.map((t) => t.label)).not.toContain('Stats');
  });

  it('parents get their child first, then the same tabs', () => {
    expect(tabsFor(SPORTS.soccer, 'parent', 'Nolan', true).map((t) => t.label)).toEqual([
      'Nolan',
      'Field',
      'Team',
      'Schedule',
      'Training',
    ]);
    // a parent with no child linked yet still has the first tab
    expect(tabsFor(SPORTS.soccer, 'parent', 'Home').map((t) => t.to)[0]).toBe('/home');
  });

  it('a coach or assistant with a linked child gets the same bar as a parent', () => {
    for (const role of ['coach', 'assistant'] as const) {
      expect(tabsFor(SPORTS.soccer, role, 'Nolan', true).map((t) => t.label)).toEqual([
        'Nolan',
        'Field',
        'Team',
        'Schedule',
        'Training',
      ]);
    }
  });

  it('folds Lineup into the Diamond tab whenever the child’s tab would make six', () => {
    const staff = tabsFor(SPORTS.baseball, 'assistant', 'x').map((t) => t.to);
    expect(staff).toEqual(['/field', '/lineup', '/team', '/games', '/training']);
    for (const [role, hasChild] of [
      ['parent', true],
      ['parent', false],
      ['coach', true],
    ] as const) {
      const tabs = tabsFor(SPORTS.baseball, role, 'Mason', hasChild);
      expect(tabs.length).toBeLessThanOrEqual(MAX_TABS);
      expect(tabs.map((t) => t.to)).toEqual(['/home', '/field', '/team', '/games', '/training']);
      expect(tabs[1]?.label).toBe('Diamond');
      expect(foldsLineup(SPORTS.baseball, role, hasChild)).toBe(true);
    }
    expect(foldsLineup(SPORTS.baseball, 'coach', false)).toBe(false);
    expect(foldsLineup(SPORTS.soccer, 'parent', true)).toBe(false);
  });

  it('the Library’s own pages belong to the Training tab (D136)', () => {
    const training = tabsFor(SPORTS.soccer, 'parent', 'Nolan', true).find((t) => t.to === '/training');
    expect(training?.also).toEqual(['/library']);
  });

  it('names the first tab after the selected child', () => {
    expect(homeTabLabel({ first_name: 'Nolan' })).toBe('Nolan');
    expect(homeTabLabel(null)).toBe('Home');
  });
});
