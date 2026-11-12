import { afterEach, describe, expect, it } from 'vitest';
import { currentSkewMs, noteServerTime, resetServerSkew, serverNow } from '../serverTime';

describe('server time skew (D66)', () => {
  afterEach(resetServerSkew);

  it('a device two minutes slow reads the server clock two minutes ahead', () => {
    const device = Date.parse('2026-11-12T15:00:00Z');
    noteServerTime('2026-11-12T15:02:00Z', device);
    expect(currentSkewMs()).toBe(120_000);
    expect(serverNow(device + 5_000)).toBe(device + 125_000);
  });

  it('garbage timestamps are ignored', () => {
    noteServerTime('not a date', 0);
    expect(currentSkewMs()).toBe(0);
  });
});
