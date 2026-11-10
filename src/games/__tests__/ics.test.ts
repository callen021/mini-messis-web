import { describe, expect, it } from 'vitest';
import {
  buildIcs,
  buildIcsCalendar,
  buildPracticeIcs,
  gameEvent,
  isValidTimezone,
  practiceEvent,
  zonedToUtc,
} from '../ics';

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
  const jan1 = new Date(Date.UTC(2026, 0, 1));

  it('writes a timed event in UTC from the team timezone, DTEND 90 minutes later, text escaped', () => {
    // 9:30 in Chicago on 12 April (CDT, UTC-5) is 14:30Z
    const ics = buildIcs({ ...base, startTime: '09:30:00' }, jan1, 'America/Chicago');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('UID:game-abc@mini-messis');
    expect(ics).toContain('DTSTAMP:20260101T000000Z');
    expect(ics).toContain('DTSTART:20260412T143000Z');
    expect(ics).toContain('DTEND:20260412T160000Z');
    expect(ics).toContain("SUMMARY:Mini-Messi's vs Bears\\, FC");
    expect(ics).toContain('LOCATION:Field 3\\; Riverside');
    expect(ics).toContain('DESCRIPTION:Home game\\nWear white\\narrive early');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('follows the timezone setting, including standard time and other zones', () => {
    expect(
      buildIcs({ ...base, date: '2026-01-10', startTime: '09:30:00' }, jan1, 'America/Chicago'),
    ).toContain(
      'DTSTART:20260110T153000Z', // CST, UTC-6
    );
    expect(buildIcs({ ...base, startTime: '09:30:00' }, jan1, 'Europe/London')).toContain(
      'DTSTART:20260412T083000Z', // BST, UTC+1
    );
    expect(zonedToUtc('2026-07-04', 12, 0, 'Asia/Kolkata').toISOString()).toBe('2026-07-04T06:30:00.000Z');
  });

  it('writes an all-day event when no start time is set', () => {
    const ics = buildIcs({ ...base, startTime: null, notes: null, homeAway: null });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260412');
    expect(ics).not.toContain('DTEND');
    expect(ics).not.toContain('DESCRIPTION');
  });

  it('joins location and address for LOCATION', () => {
    const ics = buildIcs({ ...base, startTime: null, address: '120 River Rd, Austin' });
    expect(ics).toContain('LOCATION:Field 3\\; Riverside — 120 River Rd\\, Austin');
    expect(gameEvent({ ...base, startTime: null, location: null, address: '1 Main St' }).location).toBe(
      '1 Main St',
    );
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
      jan1,
      'America/Chicago',
    );
    expect(ics).toContain('UID:practice-p1@mini-messis');
    expect(ics).toContain('SUMMARY:Striker practice');
    expect(ics).toContain('DTSTART:20261112T003000Z'); // 18:30 CST = 00:30Z next day
    expect(ics).toContain('DTEND:20261112T014500Z');
    expect(ics).toContain('DESCRIPTION:Bring water');
    expect(ics).not.toContain('LOCATION');
  });

  it('a practice without an end time lasts an hour; an end before the start is ignored', () => {
    const p = {
      id: 'p1',
      teamName: 'Striker',
      date: '2026-12-09',
      startTime: '20:30:00',
      location: null,
      notes: null,
    };
    expect(buildPracticeIcs({ ...p, endTime: null }, jan1, 'UTC')).toContain('DTEND:20261209T213000Z');
    expect(buildPracticeIcs({ ...p, endTime: '20:00:00' }, jan1, 'UTC')).toContain('DTEND:20261209T213000Z');
  });

  it('a whole schedule is one calendar with an event per item and a calendar name', () => {
    const ics = buildIcsCalendar(
      [
        gameEvent({ ...base, startTime: '09:30:00' }),
        practiceEvent({
          id: 'p1',
          teamName: 'Striker',
          date: '2026-04-14',
          startTime: '18:00:00',
          endTime: null,
          location: 'Field 2',
          notes: null,
        }),
      ],
      'America/Chicago',
      jan1,
      'Striker schedule',
    );
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
    expect(ics).toContain('X-WR-CALNAME:Striker schedule');
    expect(ics).toContain('X-WR-TIMEZONE:America/Chicago');
    expect(ics).toContain('UID:game-abc@mini-messis');
    expect(ics).toContain('UID:practice-p1@mini-messis');
  });

  it('knows which timezone names are real', () => {
    expect(isValidTimezone('America/Chicago')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
  });
});
