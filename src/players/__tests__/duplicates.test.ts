import { describe, expect, it } from 'vitest';
import { type Person } from '../api';
import { emailKey, findDuplicates, nameKey, phoneKey } from '../duplicates';

const person = (over: Partial<Person> & { contact_id: string | null }): Person => ({
  user_id: null,
  name: 'Someone',
  relationship: null,
  email: null,
  phone: null,
  share_with_team: true,
  in_app: false,
  link_status: null,
  can_edit: true,
  ...over,
});

describe('duplicate contacts (D116)', () => {
  it('keys: phone digits without a leading +1, email lowercased and trimmed, name collapsed', () => {
    expect(phoneKey('+1 (555) 010-0201')).toBe('5550100201');
    expect(phoneKey('555.010.0201')).toBe('5550100201');
    expect(phoneKey('+44 20 7946 0958')).toBe('442079460958');
    expect(phoneKey('')).toBeNull();
    expect(emailKey('  Dana@Example.test ')).toBe('dana@example.test');
    expect(nameKey('  dana   parent ')).toBe('dana parent');
  });

  it('pairs rows by phone, then email, then name; the coach entry without an account is kept', () => {
    const typed = person({ contact_id: 'c1', name: 'Dana', relationship: 'Mother', phone: '+15550100201' });
    const account = person({
      contact_id: 'c2',
      name: 'Dana Parent',
      user_id: 'u1',
      phone: '(555) 010-0201',
      email: 'dana@example.test',
    });
    const other = person({ contact_id: 'c3', name: 'Eli', email: 'eli@example.test' });
    const bare = person({ contact_id: null, name: 'Dana', user_id: 'u2' });
    const pairs = findDuplicates([account, typed, other, bare]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.match).toBe('phone');
    expect(pairs[0]?.keep.contact_id).toBe('c1');
    expect(pairs[0]?.drop.contact_id).toBe('c2');
  });

  it('a name-only match is a pair too, and two different accounts never are', () => {
    const a = person({ contact_id: 'c1', name: 'Fay Parent', phone: '+15550100203' });
    const b = person({ contact_id: 'c2', name: 'fay parent', user_id: 'u5', phone: '+15550100999' });
    expect(findDuplicates([a, b])[0]?.match).toBe('name');
    const c = person({ contact_id: 'c3', name: 'Fay Parent', user_id: 'u6' });
    expect(findDuplicates([b, c])).toHaveLength(0);
    // the same account on both rows is still a pair (an older import)
    const d = person({ contact_id: 'c4', name: 'Other', user_id: 'u5', email: 'x@example.test' });
    const e = person({ contact_id: 'c5', name: 'Other', user_id: 'u5' });
    expect(findDuplicates([d, e])).toHaveLength(1);
  });
});
