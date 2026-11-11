import { describe, expect, it } from 'vitest';
import { formatPhone, normalizePhone, smsHref, telHref } from '../phone';

describe('phone numbers', () => {
  it('normalises US numbers to +1 E.164 whatever the punctuation', () => {
    expect(normalizePhone('(555) 010-0001')).toBe('+15550100001');
    expect(normalizePhone('555.010.0001')).toBe('+15550100001');
    expect(normalizePhone('1 555 010 0001')).toBe('+15550100001');
    expect(normalizePhone('+1 555-010-0001')).toBe('+15550100001');
  });
  it('keeps international numbers with their + and rejects junk', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('call me')).toBeNull();
    expect(normalizePhone('+12')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
  });
  it('formats +1 numbers for display and leaves others alone', () => {
    expect(formatPhone('+15550100001')).toBe('(555) 010-0001');
    expect(formatPhone('+442079460958')).toBe('+442079460958');
    expect(formatPhone(null)).toBe('');
  });
  it('builds tel: and sms: targets', () => {
    expect(telHref('+15550100001')).toBe('tel:+15550100001');
    expect(smsHref('+1 (555) 010-0001')).toBe('sms:+15550100001');
  });
});
