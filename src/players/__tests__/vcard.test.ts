import { describe, expect, it } from 'vitest';
import { buildVCard, buildVCards } from '../vcard';

describe('vCard export', () => {
  const pat = {
    name: 'Pat Example',
    relationship: 'Parent',
    phone: '+15550100001',
    email: 'pat@example.test',
    childName: 'Child X',
    teamName: 'Directory FC',
  };
  it('writes a 3.0 card with name parts, cell phone, email, org and a note about the child', () => {
    const v = buildVCard(pat);
    expect(v.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true);
    expect(v).toContain('N:Example;Pat;;;');
    expect(v).toContain('FN:Pat Example');
    expect(v).toContain('TEL;TYPE=CELL:+15550100001');
    expect(v).toContain('EMAIL;TYPE=INTERNET:pat@example.test');
    expect(v).toContain('ORG:Directory FC');
    expect(v).toContain('NOTE:Parent of Child X (Directory FC)');
    expect(v.endsWith('END:VCARD\r\n')).toBe(true);
  });
  it('escapes commas and semicolons and skips missing fields', () => {
    const v = buildVCard({ name: 'Smith, Jo; Jr', childName: 'A', teamName: 'T', phone: null, email: null });
    expect(v).toContain('FN:Smith\\, Jo\\; Jr');
    expect(v).not.toContain('TEL');
    expect(v).not.toContain('EMAIL');
    expect(v).toContain('NOTE:Contact for A (T)');
  });
  it('concatenates several cards for "Add all"', () => {
    const all = buildVCards([pat, { ...pat, name: 'Quinn Sample' }]);
    expect(all.match(/BEGIN:VCARD/g)).toHaveLength(2);
    expect(all).toContain('FN:Quinn Sample');
  });
});
