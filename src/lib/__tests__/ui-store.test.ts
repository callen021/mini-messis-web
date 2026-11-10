import { beforeEach, describe, expect, it } from 'vitest';
import { UI_STORAGE_KEY, useUIStore } from '../ui-store';

describe('ui-store', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({
      theme: 'auto',
      fieldView: 'persp',
      sport: 'soccer',
      teamView: 'rotation',
      statsView: 'season',
      gamesView: 'schedule',
    });
  });

  it('defaults match the legacy app', () => {
    const s = useUIStore.getState();
    expect(s.theme).toBe('auto');
    expect(s.fieldView).toBe('persp');
    expect(s.sport).toBe('soccer');
  });

  it('persists only the data fields under the key the pre-paint script reads', () => {
    useUIStore.getState().setTheme('dark');
    useUIStore.getState().setSport('lacrosse');
    const raw = localStorage.getItem(UI_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw ?? '{}') as { state: Record<string, unknown>; version: number };
    expect(parsed.state).toEqual({
      theme: 'dark',
      fieldView: 'persp',
      sport: 'lacrosse',
      teamView: 'rotation',
      statsView: 'season',
      gamesView: 'schedule',
    });
    expect(parsed.version).toBe(1);
  });
});
