import { describe, expect, it } from 'vitest';
import { applyTheme, resolveTheme, THEME_COLOR } from '../theme';

describe('resolveTheme', () => {
  it('follows the OS only on auto', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('applyTheme', () => {
  it('writes data attributes on <html> and the theme-color meta', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.append(meta);
    applyTheme('dark', 'baseball');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.sport).toBe('baseball');
    expect(meta.getAttribute('content')).toBe(THEME_COLOR.dark);
    applyTheme('light', 'soccer');
    expect(meta.getAttribute('content')).toBe(THEME_COLOR.light);
    meta.remove();
  });
});
