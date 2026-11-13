import { afterEach, describe, expect, it } from 'vitest';
import { soccerFormations } from '@/sports/formations';
import { type Formation } from '@/sports/types';
import { PAUSED_CLOCK } from '../clock';
import { markNudged, neverRun, nudgeAsked, remapByDistance } from '../formation';

const byName = (forms: Formation[], name: string): Formation => {
  const f = forms.find((x) => x.name === name);
  if (!f) throw new Error(name);
  return f;
};

describe('mid-game formation change (D108): same players, nearest spots, keeper stays', () => {
  const forms = soccerFormations(7, true);

  it('keeps every player, the keeper in goal, and fills every spot when the counts match', () => {
    const from = byName(forms, '3-3');
    const to = byName(forms, '2-3-1');
    const slots = ['a', 'b', 'c', 'd', 'e', 'f', 'gk'];
    const out = remapByDistance(from, to, slots);
    expect(out).toHaveLength(7);
    expect(out[to.positions.findIndex((p) => p.role === 'GK')]).toBe('gk');
    expect([...out].sort()).toEqual([...slots].sort());
  });

  it('a player goes to the nearest spot of the new shape', () => {
    const from = byName(forms, '3-3');
    const to = byName(forms, '2-3-1');
    const slots = ['a', 'b', 'c', 'd', 'e', 'f', 'gk'];
    const out = remapByDistance(from, to, slots);
    // the single striker of 2-3-1 is the closest of the three 3-3 forwards to its spot
    const st = to.positions.findIndex((p) => p.role === 'ST');
    const stPos = to.positions[st];
    const fwds = from.positions
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.role === 'ST')
      .sort(
        (x, y) =>
          (x.p.x - (stPos?.x ?? 0)) ** 2 +
          (x.p.y - (stPos?.y ?? 0)) ** 2 -
          ((y.p.x - (stPos?.x ?? 0)) ** 2 + (y.p.y - (stPos?.y ?? 0)) ** 2),
      );
    expect(out[st]).toBe(slots[fwds[0]?.i ?? 0]);
  });

  it('empty spots stay empty and never steal a position', () => {
    const from = byName(forms, '3-3');
    const to = byName(forms, '2-3-1');
    const out = remapByDistance(from, to, ['a', '', 'c', '', 'e', '', 'gk']);
    expect(out.filter(Boolean).sort()).toEqual(['a', 'c', 'e', 'gk']);
  });

  it('a keeper with no keeper spot in the new shape still gets a spot', () => {
    const from = byName(soccerFormations(7, true), '3-3');
    const to = byName(soccerFormations(7, false), soccerFormations(7, false)[0]?.name ?? '');
    const out = remapByDistance(from, to, ['a', 'b', 'c', 'd', 'e', 'f', 'gk']);
    expect(out).toContain('gk');
  });
});

describe('the clock has never run (D108)', () => {
  it('is true only for a paused first period with nothing banked and nothing ended', () => {
    expect(neverRun(PAUSED_CLOCK)).toBe(true);
    expect(neverRun({ ...PAUSED_CLOCK, clockSeconds: 5 })).toBe(false);
    expect(neverRun({ ...PAUSED_CLOCK, runningSince: '2026-11-13T10:00:00Z' })).toBe(false);
    // the second period starts at zero too, but the first one has a length
    expect(neverRun({ ...PAUSED_CLOCK, periodIndex: 1, periodLengths: [1200] })).toBe(false);
  });

  afterEach(() => localStorage.clear());

  it('the prompt is remembered per game on the device', () => {
    expect(nudgeAsked('g1')).toBe(false);
    markNudged('g1');
    expect(nudgeAsked('g1')).toBe(true);
    expect(nudgeAsked('g2')).toBe(false);
  });
});
