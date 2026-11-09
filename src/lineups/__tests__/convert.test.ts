import { describe, expect, it } from 'vitest';
import { SPORTS, formationByName } from '@/sports/definitions';
import { type LineupRow, type SlotRow, periodsToPayload, rowsToPeriods, toEnginePeriods } from '../convert';

const lineup = (id: string, idx: number, formation: string): LineupRow => ({
  id,
  team_id: 't',
  game_id: null,
  period_index: idx,
  formation_name: formation,
  created_at: '',
  updated_at: '',
});
const slot = (
  lineup_id: string,
  i: number,
  role: string,
  code: string,
  player: string | null,
  auto = false,
): SlotRow => ({
  lineup_id,
  slot_index: i,
  position_role: role,
  position_code: code,
  player_id: player,
  auto_picked: auto,
});

describe('rowsToPeriods', () => {
  it('orders by period and slot index and maps auto flags', () => {
    const periods = rowsToPeriods(
      [lineup('l2', 1, '2-3-1'), lineup('l1', 0, '3-3')],
      [
        slot('l1', 2, 'ST', 'RW', 'p3'),
        slot('l1', 0, 'ST', 'LW', 'p1', true),
        slot('l1', 1, 'ST', 'ST', null, true), // auto on an empty slot is ignored
        slot('l2', 0, 'ST', 'ST', 'p9'),
      ],
    );
    expect(periods.map((p) => p.lineupId)).toEqual(['l1', 'l2']);
    expect(periods[0]?.slots).toEqual(['p1', '', 'p3']);
    expect(periods[0]?.codes).toEqual(['LW', 'ST', 'RW']);
    expect(periods[0]?.roles).toEqual(['ST', 'ST', 'ST']);
    expect(periods[0]?.auto).toEqual([0]);
    expect(periods[1]?.slots).toEqual(['p9']);
  });
  it('handles lineups with no slots', () => {
    expect(rowsToPeriods([lineup('l1', 0, 'x')], [])[0]?.slots).toEqual([]);
  });
});

describe('periodsToPayload', () => {
  const forms = SPORTS.soccer.formations({ size: 7, gk: true });
  it('uses the formation definition for roles/codes and drops auto flags on empty slots', () => {
    const payload = periodsToPayload(
      [{ formation: '3-3', slots: ['p1', '', '', '', '', '', 'p7'], auto: [0, 1, 6] }],
      (n) => formationByName(forms, n),
    );
    expect(payload).toHaveLength(1);
    expect(payload[0]?.period_index).toBe(0);
    expect(payload[0]?.formation_name).toBe('3-3');
    expect(payload[0]?.slots).toHaveLength(7);
    expect(payload[0]?.slots[0]).toEqual({
      position_role: 'ST',
      position_code: 'LW',
      player_id: 'p1',
      auto_picked: true,
    });
    expect(payload[0]?.slots[1]?.player_id).toBeNull();
    expect(payload[0]?.slots[1]?.auto_picked).toBe(false);
    expect(payload[0]?.slots[6]).toEqual({
      position_role: 'GK',
      position_code: 'GK',
      player_id: 'p7',
      auto_picked: true,
    });
  });
  it('falls back to the first formation for unknown names', () => {
    const payload = periodsToPayload([{ formation: 'nope', slots: [], auto: [] }], (n) =>
      formationByName(forms, n),
    );
    expect(payload[0]?.formation_name).toBe(forms[0]?.name);
  });
});

describe('toEnginePeriods', () => {
  it('copies arrays', () => {
    const stored = rowsToPeriods([lineup('l1', 0, '3-3')], [slot('l1', 0, 'ST', 'LW', 'p1')]);
    const engine = toEnginePeriods(stored);
    expect(engine[0]).toEqual({ formation: '3-3', slots: ['p1'], auto: [] });
    expect(engine[0]?.slots).not.toBe(stored[0]?.slots);
  });
});
