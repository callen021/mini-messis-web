/** Google Maps directions link for a game or practice (D50). Pure. */

const DIRECTIONS = 'https://www.google.com/maps/dir/?api=1&destination=';

/** The address when there is one, otherwise the location name; null when neither is set. */
export function destinationFor(
  address: string | null | undefined,
  location: string | null | undefined,
): string | null {
  const a = address?.trim();
  if (a) return a;
  const l = location?.trim();
  return l || null;
}

/** `https://www.google.com/maps/dir/?api=1&destination=<encoded>`, or null with nothing to go to. */
export function directionsUrl(
  address: string | null | undefined,
  location: string | null | undefined,
): string | null {
  const dest = destinationFor(address, location);
  return dest ? `${DIRECTIONS}${encodeURIComponent(dest)}` : null;
}
