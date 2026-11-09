/** Colour helpers for jerseys (ported from legacy). All take/return `#rrggbb`. */

export const HEX_RE = /^#[0-9a-f]{6}$/i;

export function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Dark text on light jerseys, white on dark ones (luma threshold 160, as legacy). */
export function textColor(hex: string): '#1b2822' | '#fff' {
  const [r, g, b] = hexRgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 > 160 ? '#1b2822' : '#fff';
}

/** Lighten (f > 0) or darken (f < 0) by a fraction, clamped. */
export function shade(hex: string, f: number): string {
  return (
    '#' +
    hexRgb(hex)
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v * (1 + f))))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** Text-shadow halo that keeps names legible on either text colour. */
export const halo = (tc: string): string => (tc === '#fff' ? 'rgba(0,0,0,.62)' : 'rgba(255,255,255,.7)');
