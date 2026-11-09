import { describe, expect, it } from 'vitest';
import { cn } from '../cn';

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', false, null, undefined, 0, 'b')).toBe('a b');
    expect(cn()).toBe('');
  });
});
