import { describe, expect, it } from 'vitest';
import { soccerFormations } from '@/sports/formations';
import { hasIssues, startIssues, startWarning } from '../startCheck';

const f = soccerFormations(7, true).find((x) => x.name === '2-3-1');
if (!f) throw new Error('2-3-1');
const player = (id: string, first_name: string, is_available = true) => ({ id, first_name, is_available });
const players = [
  player('a', 'Ann'),
  player('b', 'Bo'),
  player('c', 'Cy'),
  player('d', 'Dee'),
  player('e', 'Eli'),
  player('f', 'Fay'),
  player('g', 'Gus', false),
  player('h', 'Hal'),
];

describe('the pre-start lineup check (D109)', () => {
  it('a full lineup of available players has no issues', () => {
    const i = startIssues(f, ['a', 'b', 'c', 'd', 'e', 'f', 'h'], players, new Set(), new Set());
    expect(hasIssues(i)).toBe(false);
    expect(startWarning(i)).toBe('');
  });

  it('lists open spots by code and placed players who are out, with who said so', () => {
    const i = startIssues(f, ['a', '', 'c', 'g', 'e', '', 'd'], players, new Set(['c']), new Set(['c']));
    expect(i.open).toEqual([f.positions[1]?.code, f.positions[5]?.code]);
    expect(i.outPlaced).toEqual([
      { name: 'Cy', byParent: true },
      { name: 'Gus', byParent: false },
    ]);
    expect(hasIssues(i)).toBe(true);
    expect(startWarning(i)).toBe(
      `2 open spots (${f.positions[1]?.code}, ${f.positions[5]?.code}). Marked out but still placed: Cy (parent), Gus.`,
    );
  });

  it('a single open spot reads in the singular; a coach-set reply has no parent note', () => {
    const i = startIssues(f, ['a', 'b', 'c', 'd', 'e', 'f', ''], players, new Set(['a']), new Set());
    expect(startWarning(i)).toBe(`1 open spot (${f.positions[6]?.code}). Marked out but still placed: Ann.`);
  });
});
