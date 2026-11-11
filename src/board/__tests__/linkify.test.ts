import { describe, expect, it } from 'vitest';
import { linkify, timeAgo } from '../linkify';

describe('linkify', () => {
  it('turns http and www links into link segments, leaving the sentence punctuation outside', () => {
    expect(linkify('Map: https://maps.example.test/field-3, see you there.')).toEqual([
      { kind: 'text', text: 'Map: ' },
      { kind: 'link', text: 'https://maps.example.test/field-3', href: 'https://maps.example.test/field-3' },
      { kind: 'text', text: ', see you there.' },
    ]);
    expect(linkify('go to www.example.test now')).toEqual([
      { kind: 'text', text: 'go to ' },
      { kind: 'link', text: 'www.example.test', href: 'https://www.example.test' },
      { kind: 'text', text: ' now' },
    ]);
  });
  it('returns plain text untouched', () => {
    expect(linkify('no links here')).toEqual([{ kind: 'text', text: 'no links here' }]);
    expect(linkify('')).toEqual([]);
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  it('reads naturally', () => {
    expect(timeAgo('2026-11-10T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-11-10T11:45:00Z', now)).toBe('15 min ago');
    expect(timeAgo('2026-11-10T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-11-09T10:00:00Z', now)).toBe('yesterday');
    expect(timeAgo('2026-11-07T12:00:00Z', now)).toBe('3 days ago');
    expect(timeAgo('2026-10-01T12:00:00Z', now)).toMatch(/Oct 1/);
    expect(timeAgo('nope', now)).toBe('');
  });
});
