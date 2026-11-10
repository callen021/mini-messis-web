import { describe, expect, it } from 'vitest';
import { ageOn, SHIRT_SIZES, shirtSizeLabel } from '../api';

describe('player details helpers', () => {
  it('computes whole years, birthday not yet reached this year included', () => {
    const today = new Date(2026, 10, 10); // 10 Nov 2026
    expect(ageOn('2018-05-04', today)).toBe(8);
    expect(ageOn('2018-11-10', today)).toBe(8); // birthday today
    expect(ageOn('2018-11-11', today)).toBe(7); // tomorrow
    expect(ageOn(null, today)).toBeNull();
    expect(ageOn('nope', today)).toBeNull();
    expect(ageOn('2030-01-01', today)).toBeNull();
  });
  it('runs youth XS to adult XL with readable labels', () => {
    expect(SHIRT_SIZES[0]?.value).toBe('YXS');
    expect(SHIRT_SIZES[SHIRT_SIZES.length - 1]?.value).toBe('AXL');
    expect(shirtSizeLabel('YM')).toBe('Youth M');
    expect(shirtSizeLabel(null)).toBe('');
  });
});
