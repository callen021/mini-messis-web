import { describe, expect, it } from 'vitest';
import { HEX_RE, halo, hexRgb, shade, textColor } from '../colors';
import { JERSEY_DEFS, STANDING_SVG, jerseySvg } from '../jersey';

describe('colors', () => {
  it('hexRgb / shade', () => {
    expect(hexRgb('#7b3fe4')).toEqual([123, 63, 228]);
    expect(shade('#808080', 0.5)).toBe('#c0c0c0');
    expect(shade('#808080', -0.5)).toBe('#404040');
    expect(shade('#ffffff', 0.5)).toBe('#ffffff'); // clamped
    expect(shade('#000000', -0.5)).toBe('#000000');
  });
  it('textColor picks dark text on light shirts', () => {
    expect(textColor('#ffffff')).toBe('#1b2822');
    expect(textColor('#14b8a6')).toBe('#fff');
    expect(textColor('#7b3fe4')).toBe('#fff');
    expect(textColor('#f4c63f')).toBe('#1b2822');
  });
  it('halo contrasts the text colour', () => {
    expect(halo('#fff')).toContain('0,0,0');
    expect(halo('#1b2822')).toContain('255,255,255');
  });
  it('HEX_RE validates 6-digit hex only', () => {
    expect(HEX_RE.test('#ABCDEF')).toBe(true);
    expect(HEX_RE.test('#abc')).toBe(false);
    expect(HEX_RE.test('abcdef')).toBe(false);
  });
});

describe('jerseySvg', () => {
  const base = { id: 'q0-s0', color: '#7b3fe4', contrast: '#fff' as const };

  it.each(['soccer', 'baseball', 'basketball', 'football'] as const)(
    '%s renders a 120×112 svg with unique ids',
    (kind) => {
      const svg = jerseySvg({ ...base, kind, open: false });
      expect(svg.startsWith('<svg viewBox="0 0 120 112"')).toBe(true);
      expect(svg).toContain('id="cq0-s0"');
      expect(svg).toContain('url(#knit)');
      expect(svg).toContain(`fill="${base.color}"`);
      expect(svg).not.toContain('url(#hatch)');
    },
  );

  it('open jerseys get a white outline and hatch fill', () => {
    const svg = jerseySvg({ ...base, kind: 'soccer', open: true });
    expect(svg).toContain('stroke="#fff" stroke-width="2.4"');
    expect(svg).toContain('url(#hatch)');
  });

  it('uses the tank body for basketball and the football body for football', () => {
    const tank = jerseySvg({ ...base, kind: 'basketball', open: false });
    const foot = jerseySvg({ ...base, kind: 'football', open: false });
    const soccer = jerseySvg({ ...base, kind: 'soccer', open: false });
    expect(tank).toContain('M30 8 L44 8');
    expect(foot).toContain('M22 16 L48 6');
    expect(soccer).toContain('M28 16 C34 12');
  });

  it('ships the shared defs and standing overlays', () => {
    expect(JERSEY_DEFS).toContain('id="knit"');
    expect(JERSEY_DEFS).toContain('id="hatch"');
    expect(JERSEY_DEFS).toContain('id="net2"');
    expect(JERSEY_DEFS).toContain('id="gsh"');
    for (const svg of Object.values(STANDING_SVG)) expect(svg.startsWith('<svg viewBox=')).toBe(true);
    expect(STANDING_SVG.post).toContain('#f2c230');
  });
});
