import { describe, expect, it } from 'vitest';
import { type TeamSheetRow } from '@/players/api';
import { teamSheetCsv, teamSheetText } from '../teamSheet';

const rows: TeamSheetRow[] = [
  {
    player_id: 'a',
    first_name: 'Child',
    last_name: 'Example',
    jersey_number: '7',
    birthdate: '2018-03-03',
    shirt_size: 'YM',
    contacts: [
      {
        name: 'Pat Example',
        relationship: 'Parent',
        phone: '+15550100001',
        email: 'pat@example.test',
        share_with_team: true,
      },
      { name: 'Grand, Parent', relationship: null, phone: null, email: null, share_with_team: false },
    ],
  },
  {
    player_id: 'b',
    first_name: 'Solo',
    last_name: null,
    jersey_number: null,
    birthdate: null,
    shirt_size: null,
    contacts: [],
  },
];

describe('team sheet export', () => {
  it('CSV: a header, one row per contact, quoted commas, players without contacts still listed', () => {
    const csv = teamSheetCsv(rows);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe(
      'Player,Number,Birthdate,Shirt size,Contact,Relationship,Phone,Email,Shared with team',
    );
    expect(lines[1]).toBe(
      'Child Example,7,2018-03-03,Youth M,Pat Example,Parent,(555) 010-0001,pat@example.test,yes',
    );
    expect(lines[2]).toBe('Child Example,7,2018-03-03,Youth M,"Grand, Parent",,,,no');
    expect(lines[3]).toBe('Solo,,,,,,,,');
    expect(lines).toHaveLength(4);
  });
  it('text: one block per player with the facts and the people indented', () => {
    const t = teamSheetText(rows);
    expect(t).toContain('Child Example #7\t');
    expect(t).toContain('Youth M');
    expect(t).toContain('\n  Pat Example · Parent · (555) 010-0001 · pat@example.test');
    expect(t.endsWith('Solo')).toBe(true);
  });
});
