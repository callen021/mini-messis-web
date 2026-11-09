import { useEffect } from 'react';
import { type SportKey } from '@/sports/types';
import { type Theme, useUIStore } from './ui-store';

/** Browser-chrome colors, matching the legacy app's `applyTheme`. */
export const THEME_COLOR = { light: '#f9f9f9', dark: '#161618' } as const;

export function resolveTheme(theme: Theme, prefersDark: boolean): 'light' | 'dark' {
  if (theme === 'auto') return prefersDark ? 'dark' : 'light';
  return theme;
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Write theme + sport onto <html> and keep the status-bar color in sync. */
export function applyTheme(theme: Theme, sport: SportKey): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.sport = sport;
  const prefersDark = typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches;
  const resolved = resolveTheme(theme, prefersDark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved]);
}

/** Mount once near the root: applies the stored theme and follows OS changes while on "auto". */
export function useApplyTheme(): void {
  const theme = useUIStore((s) => s.theme);
  const sport = useUIStore((s) => s.sport);
  useEffect(() => {
    applyTheme(theme, sport);
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(DARK_QUERY);
    const onChange = () => applyTheme(theme, sport);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme, sport]);
}
