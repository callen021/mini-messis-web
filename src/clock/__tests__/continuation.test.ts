import { describe, expect, it } from 'vitest';
import { type ClockState, type Stint, playerTimes, starters } from '../clock';

const NOW = Date.parse('2026-11-13T10:30:00Z');
const stint = (over: Partial<Stint>): Stint => ({
  id: 's',
  player_id: 'a',
  period_index: 0,
  slot_index: 0,
  position_role: 'ST',
  position_code: 'ST',
  clock_start: 0,
  clock_end: null,
  ...over,
});

describe('a formation change continues the stint (D108)', () => {
  const paused: ClockState = { periodIndex: 0, clockSeconds: 900, runningSince: null, periodLengths: [] };

  it('minutes add up, the shift count stays at one, the shift time runs from the first stint', () => {
    const stints = [
      stint({ id: '1', clock_start: 0, clock_end: 600, position_code: 'ST' }),
      stint({ id: '2', clock_start: 600, clock_end: null, position_code: 'MID', continues: true }),
    ];
    const t = playerTimes(stints, paused, NOW, ['a']).get('a');
    expect(t?.seconds).toBe(900);
    expect(t?.shifts).toBe(1);
    expect(t?.shiftSeconds).toBe(900);
    expect(t?.onField).toBe(true);
    expect(t?.code).toBe('MID');
  });

  it('a real substitution still counts a new shift and restarts the shift time', () => {
    const stints = [
      stint({ id: '1', clock_start: 0, clock_end: 600 }),
      stint({ id: '2', clock_start: 700, clock_end: null }),
    ];
    const t = playerTimes(stints, paused, NOW, ['a']).get('a');
    expect(t?.seconds).toBe(800);
    expect(t?.shifts).toBe(2);
    expect(t?.shiftSeconds).toBe(200);
  });

  it('kickoff starters ignore continuation stints', () => {
    const map = starters([
      stint({ id: '1', clock_start: 0, clock_end: 600, slot_index: 0 }),
      stint({ id: '2', clock_start: 600, clock_end: null, slot_index: 3, continues: true }),
    ]);
    expect([...map.entries()]).toEqual([[0, 'a']]);
  });
});
