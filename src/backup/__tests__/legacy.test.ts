import { describe, expect, it } from 'vitest';
import { SPORTS } from '@/sports/definitions';
import { samplePlan } from '@/sports/lineup';
import { examplePayload, isLegacyBackup, legacySports, normalizeLegacyBackup } from '../legacy';

/** A trimmed `mini-messis-coach-v5` state as the legacy app saved it. */
const legacy = {
  v: 2,
  teamName: 'Strikers',
  sport: 'soccer',
  theme: 'auto',
  teams: {
    soccer: {
      players: [
        { id: 'p1', name: 'Nolan', num: '7', active: true },
        { id: 'p2', name: 'Teddy', num: '4', active: false },
        { id: 'p3', name: '  ', num: '', active: true },
        { id: 'p4', name: 'Jack', num: 'x12y', active: true },
      ],
      size: 7,
      gk: true,
      periods: [
        { formation: '3-3', slots: ['p1', '', '', '', '', '', 'p2'], auto: [6] },
        { formation: 'bogus', slots: ['p4', 'p4', 'zzz'], auto: [] },
      ],
      colors: { ST: '#ff0000', MID: 'not-a-color' },
      order: ['p4', 'p1', 'zzz'],
      games: [
        {
          id: 'g1',
          opponent: 'Mini Tylers',
          date: '2026-10-03',
          teamName: 'Strikers',
          status: 'done',
          periods: [{ formation: '3-3', slots: ['p1', 'p2', '', '', '', '', ''], codes: [] }],
          goals: [
            { id: 'e1', team: 'us', scorer: 'p1', assist: 'p1', q: 1, ts: 1759500000000 },
            { id: 'e2', team: 'them', scorer: 'p1', q: 9, ts: 1759500100000 },
            { id: 'e3', team: 'us', scorer: 'zzz', assist: 'p2', q: 1, ts: 1759500200000 },
          ],
          notes: 'Great effort',
          players: { p1: { name: 'Nolan', num: '7' }, p2: { name: 'Teddy', num: '4' } },
          createdAt: 1759490000000,
          startedAt: 1759495000000,
          finishedAt: 1759500000000,
        },
        { id: 'g1', opponent: 'Duplicate', date: 'nope', status: 'weird', periods: [], goals: [] },
        { id: 'g2', opponent: 'Live A', date: '2026-10-10', status: 'live', periods: [], goals: [] },
        { id: 'g3', opponent: 'Live B', date: '2026-10-11', status: 'live', periods: [], goals: [] },
      ],
      lastBat: 'p1',
    },
    baseball: { players: [], periods: [], games: [] },
  },
};

describe('legacy backup import', () => {
  it('recognises v5 and v4 files and lists the sports with data', () => {
    expect(isLegacyBackup(legacy)).toBe(true);
    expect(isLegacyBackup({ players: [], quarters: [] })).toBe(true);
    expect(isLegacyBackup({ hello: 1 })).toBe(false);
    expect(legacySports(legacy)).toEqual(['soccer']);
  });

  it('applies the legacy normalize rules and maps onto roles/codes', () => {
    const { payload, summary } = normalizeLegacyBackup(legacy, 'soccer');
    expect(summary).toMatchObject({ players: 3, games: 3, events: 3, template: 2, teamName: 'Strikers' });
    // blank names dropped, numbers digits-only, active flag kept
    expect(payload.players.map((p) => [p.key, p.first_name, p.jersey_number, p.is_available])).toEqual([
      ['p1', 'Nolan', '7', true],
      ['p2', 'Teddy', '4', false],
      ['p4', 'Jack', '12', true],
    ]);
    // batting order from `order`, unknown ids skipped
    expect(payload.players.find((p) => p.key === 'p4')?.batting_order).toBe(1);
    expect(payload.players.find((p) => p.key === 'p2')?.batting_order).toBeNull();
    // template: 3-3 keeps slot 0 and the auto flag on slot 6; bogus formation falls back and drops the duplicate
    const q0 = payload.template[0];
    expect(q0?.formation_name).toBe('3-3');
    expect(q0?.slots[0]).toMatchObject({ position_code: 'LW', player_key: 'p1', auto_picked: false });
    expect(q0?.slots[6]).toMatchObject({ position_code: 'GK', player_key: 'p2', auto_picked: true });
    const q1 = payload.template[1];
    expect(q1?.formation_name).toBe('3-3');
    expect(q1?.slots.filter((s) => s.player_key).map((s) => s.player_key)).toEqual(['p4']);
    expect(payload.team).toMatchObject({ side_size: 7, has_gk: true, periods_count: 2 });
    expect(payload.team.colors.ST).toBe('#ff0000');
    expect(payload.team.colors.MID).toBe(SPORTS.soccer.defaultColors.MID);
    expect(payload.last_batter_key).toBe('p1');
  });

  it('normalises games: duplicates dropped, one live game, goals clamped and mapped', () => {
    const { payload } = normalizeLegacyBackup(legacy, 'soccer');
    expect(payload.games.map((g) => [g.opponent, g.status])).toEqual([
      ['Mini Tylers', 'done'],
      ['Live A', 'live'],
      ['Live B', 'done'],
    ]);
    const g = payload.games[0];
    expect(g?.game_date).toBe('2026-10-03');
    expect(g?.finished_at).toBe('2025-10-03T14:00:00.000Z');
    expect(g?.notes).toBe('Great effort');
    expect(g?.players).toEqual([
      { key: 'p1', name: 'Nolan', number: '7' },
      { key: 'p2', name: 'Teddy', number: '4' },
    ]);
    expect(g?.events).toEqual([
      // assist equal to scorer is dropped
      expect.objectContaining({
        side: 'us',
        period_index: 0,
        event_type: 'goal',
        scorer_key: 'p1',
        assist_key: null,
      }),
      // opponent goal: no player, quarter clamped to the game's period count
      expect.objectContaining({ side: 'them', period_index: 0, scorer_key: null, assist_key: null }),
      // unknown scorer becomes "unknown", assist kept
      expect.objectContaining({ side: 'us', scorer_key: null, assist_key: 'p2' }),
    ]);
  });

  it('builds the example team payload from the sample roster', () => {
    const S = SPORTS.soccer;
    const forms = S.formations({ size: 7, gk: true });
    const f = forms.find((x) => x.name === '3-3') ?? (forms[0] as (typeof forms)[number]);
    const plan = samplePlan(
      4,
      f,
      S.sample.map((_, i) => `p${i}`),
    );
    const payload = examplePayload('soccer', plan, forms);
    expect(payload.players).toHaveLength(S.sample.length);
    expect(payload.template).toHaveLength(4);
    expect(payload.template[0]?.slots.every((s) => s.player_key)).toBe(true);
    expect(payload.games).toEqual([]);
  });
});
