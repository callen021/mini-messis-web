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
      childByTeam: {},
      gamesView: 'all',
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
      childByTeam: {},
      gamesView: 'all',
      libraryOpen: [],
    });
    expect(parsed.version).toBe(3);
  });

  it('migrates the v1 Games segments (schedule | results) to All', async () => {
    localStorage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({ state: { theme: 'dark', gamesView: 'results' }, version: 1 }),
    );
    await useUIStore.persist.rehydrate();
    expect(useUIStore.getState().gamesView).toBe('all');
    expect(useUIStore.getState().theme).toBe('dark');
  });

  it('v3 drops the remembered Stats segment: the Stats tab is gone (D135)', async () => {
    localStorage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({ state: { theme: 'dark', statsView: 'skills', teamView: 'roster' }, version: 2 }),
    );
    await useUIStore.persist.rehydrate();
    expect(useUIStore.getState()).not.toHaveProperty('statsView');
    expect(useUIStore.getState().teamView).toBe('roster');
    expect(useUIStore.getState().childByTeam).toEqual({});
  });
});
