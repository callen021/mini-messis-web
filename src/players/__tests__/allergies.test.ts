import { describe, expect, it } from 'vitest';
import { ALLERGENS, UNANSWERED_NOTE, allergenLabel, summaryLine, summaryList } from '../allergies';

describe('allergies (D114)', () => {
  it('lists the nine allergens with labels', () => {
    expect(ALLERGENS.map((a) => a.label)).toEqual([
      'Peanuts',
      'Tree nuts',
      'Dairy',
      'Eggs',
      'Wheat/Gluten',
      'Soy',
      'Sesame',
      'Fish',
      'Shellfish',
    ]);
    expect(allergenLabel('tree_nuts')).toBe('Tree nuts');
    expect(allergenLabel('kiwi')).toBe('kiwi');
  });

  it('the team summary keeps list order, puts the Other names last and never a note', () => {
    expect(summaryList({ allergens: ['dairy', 'peanuts'], others: ['Kiwi'], unanswered: false })).toEqual([
      'Peanuts',
      'Dairy',
      'Kiwi',
    ]);
    expect(summaryLine({ allergens: ['dairy', 'peanuts'], others: ['Kiwi'], unanswered: true })).toBe(
      'Peanuts, Dairy, Kiwi',
    );
    expect(summaryLine({ allergens: [], others: [], unanswered: true })).toBe('No allergies reported yet');
    expect(summaryLine({ allergens: [], others: [], unanswered: false })).toBe('No allergies on the team');
    expect(summaryLine(null)).toBe('');
    expect(UNANSWERED_NOTE).toBe('Not every family has answered.');
  });
});
