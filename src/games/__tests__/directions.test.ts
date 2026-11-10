import { describe, expect, it } from 'vitest';
import { destinationFor, directionsUrl } from '../directions';

describe('directions', () => {
  it('prefers the address, falls back to the location name, encodes it', () => {
    expect(directionsUrl('120 River Rd, Austin TX', 'Field 3')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=120%20River%20Rd%2C%20Austin%20TX',
    );
    expect(directionsUrl(null, 'Riverside Park')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Riverside%20Park',
    );
    expect(directionsUrl('  ', ' Riverside Park ')).toContain('destination=Riverside%20Park');
  });
  it('is null with nothing to navigate to', () => {
    expect(destinationFor(null, null)).toBeNull();
    expect(directionsUrl('', '')).toBeNull();
  });
});
