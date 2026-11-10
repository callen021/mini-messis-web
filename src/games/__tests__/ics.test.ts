import { describe, expect, it } from 'vitest';
import { buildIcs, buildPracticeIcs } from '../ics';

describe('ics export', () => {
  const base = {
    id: 'abc',
    teamName: "Mini-Messi's",
    opponent: 'Bears, FC',
    date: '2026-04-12',
    location: 'Field 3; Riverside',
    homeAway: 'home' as const,
    notes: 'Wear white\narrive early',
  };

  it('writes a timed event with DTEND 90 minutes later and escapes text', () => {
    const ics = buildIcs({ ...base, startTime: '09:30:00' }, new Date(Date.UTC(2026, 0, 1)));
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('UID:game-abc@mini-messis');
    expect(ics).toContain('DTSTAMP:20260101T000000Z');
    expect(ics).toContain('DTSTART:20260412T093000');
    expect(ics).toContain('DTEND:20260412T110000');
    expect(ics).toContain("SUMMARY:Mini-Messi's vs Bears\\, FC");
    expect(ics).toContain('LOCATION:Field 3\\; Riverside');
    expect(ics).toContain('DESCRIPTION:Home game\\nWear white\\narrive early');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('writes an all-day event when no start time is set', () => {
    const ics = buildIcs({ ...base, startTime: null, notes: null, homeAway: null });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260412');
    expect(ics).not.toContain('DTEND');
    expect(ics).not.toContain('DESCRIPTION');
  });

  it('folds long lines at 75 octets', () => {
    const ics = buildIcs({ ...base, startTime: null, notes: 'x'.repeat(200) });
    for (const line of ics.split('\r\n')) expect(line.length).toBeLessThanOrEqual(75);
  });
  it('a practice is "<team> practice" with its own end time', () => {
    const ics = buildPracticeIcs(
      {
        id: 'p1',
        teamName: 'Striker',
        date: '2026-11-11',
        startTime: '18:30:00',
        endTime: '19:45:00',
        location: null,
        notes: 'Bring water',
      },
      new Date(Date.UTC(2026, 0, 1)),
    );
    expect(ics).toContain('UID:practice-p1@mini-messis');
    expect(ics).toContain('SUMMARY:Striker practice');
    expect(ics).toContain('DTSTART:20261111T183000');
    expect(ics).toContain('DTEND:20261111T194500');
    expect(ics).toContain('DESCRIPTION:Bring water');
    expect(ics).not.toContain('LOCATION');
  });

  it('a practice without an end time lasts an hour; an end before the start is ignored', () => {
    const base = {
      id: 'p1',
      teamName: 'Striker',
      date: '2026-12-09',
      startTime: '20:30:00',
      location: null,
      notes: null,
    };
    expect(buildPracticeIcs({ ...base, endTime: null })).toContain('DTEND:20261209T213000');
    expect(buildPracticeIcs({ ...base, endTime: '20:00:00' })).toContain('DTEND:20261209T213000');
  });
});
