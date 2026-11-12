import { describe, expect, it } from 'vitest';
import {
  type ClockState,
  type Stint,
  cumulativeSeconds,
  elapsedAt,
  formatClock,
  formatMinutes,
  isFullTime,
  minuteLabel,
  minutesBalance,
  onFieldBySlot,
  playerTimes,
  remainingAt,
  starters,
  stintSeconds,
} from '../clock';

const T0 = Date.parse('2026-11-12T15:00:00Z');
const at = (s: number) => T0 + s * 1000;
const iso = (s: number) => new Date(at(s)).toISOString();

const stint = (over: Partial<Stint>): Stint => ({
  id: Math.random().toString(36),
  player_id: 'p',
  period_index: 0,
  slot_index: 0,
  position_role: 'ST',
  position_code: 'ST',
  clock_start: 0,
  clock_end: null,
  ...over,
});

describe('clock maths (D66): elapsed from server timestamps, never a counter', () => {
  it('paused: elapsed is the banked seconds whatever the time', () => {
    const s: ClockState = { periodIndex: 0, clockSeconds: 90, runningSince: null, periodLengths: [] };
    expect(elapsedAt(s, at(0))).toBe(90);
    expect(elapsedAt(s, at(3600))).toBe(90);
  });

  it('running: banked seconds plus the time since running_since; the phone locking changes nothing', () => {
    const s: ClockState = { periodIndex: 0, clockSeconds: 90, runningSince: iso(0), periodLengths: [] };
    expect(elapsedAt(s, at(0))).toBe(90);
    expect(elapsedAt(s, at(30))).toBe(120);
    expect(elapsedAt(s, at(30.9))).toBe(120); // whole seconds, rounded down
    expect(elapsedAt(s, at(1800))).toBe(1890); // 30 minutes later, straight from the timestamp
    // a second device with the same row reads the same number
    expect(elapsedAt({ ...s }, at(1800))).toBe(1890);
  });

  it('a clock skewed into the future never goes negative', () => {
    const s: ClockState = { periodIndex: 0, clockSeconds: 10, runningSince: iso(5), periodLengths: [] };
    expect(elapsedAt(s, at(0))).toBe(10);
  });

  it('pause/resume across period changes: lengths accumulate', () => {
    const s: ClockState = { periodIndex: 1, clockSeconds: 0, runningSince: iso(0), periodLengths: [1500] };
    expect(cumulativeSeconds(s, 1, elapsedAt(s, at(60)))).toBe(1560);
    expect(cumulativeSeconds(s, 0, 100)).toBe(100);
    expect(isFullTime({ ...s, periodIndex: 2 }, 2)).toBe(true);
    expect(isFullTime(s, 2)).toBe(false);
  });

  it('remaining time with a period length, and none without', () => {
    const s: ClockState = { periodIndex: 0, clockSeconds: 1190, runningSince: null, periodLengths: [] };
    expect(remainingAt(s, 20, at(0))).toBe(10);
    expect(remainingAt({ ...s, clockSeconds: 1230 }, 20, at(0))).toBe(-30);
    expect(remainingAt(s, null, at(0))).toBeNull();
  });

  it('formats', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(-30)).toBe('-0:30');
    expect(formatClock(1890)).toBe('31:30');
    expect(formatMinutes(59)).toBe('0 min');
    expect(formatMinutes(725)).toBe('12 min');
    expect(minuteLabel(0)).toBe("1'");
    expect(minuteLabel(59)).toBe("1'");
    expect(minuteLabel(60)).toBe("2'");
    expect(minuteLabel(1345)).toBe("23'");
  });
});

describe('minutes derived from stints (D67)', () => {
  const running: ClockState = { periodIndex: 1, clockSeconds: 0, runningSince: iso(0), periodLengths: [600] };

  it('closed stints are fixed; an open stint in the current period runs with the clock', () => {
    expect(stintSeconds(stint({ clock_start: 120, clock_end: 300 }), running, at(999))).toBe(180);
    expect(stintSeconds(stint({ period_index: 1, clock_start: 60 }), running, at(100))).toBe(40);
    // an open stint from an earlier period never counts (the server closes them at the break)
    expect(stintSeconds(stint({ period_index: 0, clock_start: 0 }), running, at(100))).toBe(0);
  });

  it('per-player totals, shifts, on-field, current shift and rest', () => {
    const stints = [
      stint({ player_id: 'a', period_index: 0, clock_start: 0, clock_end: 600 }),
      stint({ player_id: 'a', period_index: 1, clock_start: 0 }),
      stint({ player_id: 'b', period_index: 0, clock_start: 0, clock_end: 200 }),
      stint({ player_id: 'b', period_index: 0, clock_start: 400, clock_end: 600 }),
      stint({ player_id: 'c', period_index: 0, clock_start: 200, clock_end: 400 }),
    ];
    const t = playerTimes(stints, running, at(120), ['a', 'b', 'c', 'd']);
    expect(t.get('a')).toMatchObject({
      seconds: 720,
      shifts: 2,
      onField: true,
      shiftSeconds: 120,
      restSeconds: 0,
      slot: 0,
    });
    expect(t.get('b')).toMatchObject({
      seconds: 400,
      shifts: 2,
      onField: false,
      shiftSeconds: 0,
      restSeconds: 120,
    });
    // c came off at 6:40 of the first half: resting 200 s of the first half plus 120 s of the second
    expect(t.get('c')).toMatchObject({ seconds: 200, shifts: 1, onField: false, restSeconds: 320 });
    // d never played: resting since kickoff
    expect(t.get('d')).toMatchObject({ seconds: 0, shifts: 0, onField: false, restSeconds: 720 });
  });

  it('balance in minutes, starters and the on-field map', () => {
    expect(minutesBalance([600, 900, 1500])).toMatchObject({
      min: 10,
      max: 25,
      average: '16.7',
      spread: true,
    });
    expect(minutesBalance([600, 660])).toMatchObject({ spread: false, percent: 91 });
    expect(minutesBalance([])).toBeNull();
    const stints = [
      stint({ player_id: 'a', slot_index: 0, clock_start: 0, clock_end: 50 }),
      stint({ player_id: 'b', slot_index: 1, clock_start: 0 }),
      stint({ player_id: 'c', slot_index: 0, clock_start: 50 }),
      stint({ player_id: 'd', slot_index: 2, period_index: 1, clock_start: 0 }),
    ];
    expect([...starters(stints).entries()]).toEqual([
      [0, 'a'],
      [1, 'b'],
    ]);
    const on = onFieldBySlot(stints, 0);
    expect([...on.keys()].sort()).toEqual([0, 1]);
    expect(on.get(0)?.player_id).toBe('c');
  });
});
