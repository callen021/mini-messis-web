import { describe, expect, it } from 'vitest';
import { JOIN_CODE_ALPHABET, formatCode, isCompleteCode, normalizeCode } from '../join-code';

describe('join codes', () => {
  it('normalizes what the user types', () => {
    expect(normalizeCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(normalizeCode('abcd 2345 6789')).toBe('ABCD2345');
    expect(normalizeCode('')).toBe('');
  });
  it('accepts only complete codes in the server alphabet', () => {
    expect(isCompleteCode('ABCD2345')).toBe(true);
    expect(isCompleteCode('ABCD234')).toBe(false);
    expect(isCompleteCode('abcd2345')).toBe(false);
    expect(isCompleteCode('ABCD0145')).toBe(false); // 0 and 1 are never issued
  });
  it('alphabet has no ambiguous characters', () => {
    for (const ch of 'ILOU01') expect(JOIN_CODE_ALPHABET).not.toContain(ch);
    expect(JOIN_CODE_ALPHABET).toHaveLength(30);
    for (const ch of JOIN_CODE_ALPHABET) expect(isCompleteCode(ch.repeat(8))).toBe(true);
  });
  it('formats for display', () => {
    expect(formatCode('ABCD2345')).toBe('ABCD 2345');
    expect(formatCode('ABC')).toBe('ABC');
  });
});
