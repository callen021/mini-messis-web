import { describe, expect, it } from 'vitest';
import { countdown, daysUntil, minutesUntil, timingLabel } from '../timing';

describe('timing badges', () => {
  const today = '2026-11-10';
  it('labels today, tomorrow, this week (2–6 days) and upcoming', () => {
    expect(timingLabel('2026-11-10', today)).toBe('Today');
    expect(timingLabel('2026-11-11', today)).toBe('Tomorrow');
    expect(timingLabel('2026-11-12', today)).toBe('This week');
    expect(timingLabel('2026-11-16', today)).toBe('This week');
    expect(timingLabel('2026-11-17', today)).toBe('Upcoming');
    expect(timingLabel('2027-01-01', today)).toBe('Upcoming');
  });
  it('treats a past date (a game running past midnight) as today and bad input as upcoming', () => {
    expect(timingLabel('2026-11-09', today)).toBe('Today');
    expect(timingLabel('nope', today)).toBe('Upcoming');
  });
  it('counts whole days across a DST change', () => {
    expect(daysUntil('2026-11-02', '2026-10-30')).toBe(3);
    expect(daysUntil('2026-03-09', '2026-03-07')).toBe(2);
  });
});

describe('countdown', () => {
  const now = new Date(2026, 10, 10, 8, 0); // Tue 10 Nov 2026, 08:00 local
  it('counts minutes, hours and days to a timed event', () => {
    expect(countdown('2026-11-10', '08:40:00', now)).toBe('in 40 min');
    expect(countdown('2026-11-10', '10:15:00', now)).toBe('in 2 h 15 min');
    expect(countdown('2026-11-10', '11:00:00', now)).toBe('in 3 h');
    expect(countdown('2026-11-11', '09:00:00', now)).toBe('tomorrow');
    expect(countdown('2026-11-14', '09:00:00', now)).toBe('in 4 days');
    expect(countdown('2026-11-10', '08:00:00', now)).toBe('now');
    expect(countdown('2026-11-10', '07:50:00', now)).toBe('started 10 min ago');
    expect(countdown('2026-11-10', '05:00:00', now)).toBe('earlier today');
  });
  it('falls back to days for all-day events', () => {
    expect(countdown('2026-11-10', null, now)).toBe('today');
    expect(countdown('2026-11-11', null, now)).toBe('tomorrow');
    expect(countdown('2026-11-13', null, now)).toBe('in 3 days');
    expect(minutesUntil('bad', null, now)).toBeNull();
    expect(countdown('bad', null, now)).toBe('');
  });
});
