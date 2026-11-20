import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type SportKey } from '@/sports/types';

export type Theme = 'light' | 'dark' | 'auto';
export type FieldView = 'persp' | 'flat';

export const THEMES: readonly Theme[] = ['light', 'dark', 'auto'];
export const FIELD_VIEWS: readonly FieldView[] = ['persp', 'flat'];

/**
 * Ephemeral / device-local UI state. Theme and field view are also stored on the user's
 * profile (Phase 3) — this store is the local cache so the PWA paints correctly before the
 * profile loads. `sport` only drives the tint; the real current team comes from the server.
 */
export type TeamView = 'rotation' | 'roster' | 'season';
/** Schedule tab segment: everything coming up, or just games / just practices. */
export type GamesView = 'all' | 'games' | 'practices';

export interface UIState {
  theme: Theme;
  fieldView: FieldView;
  sport: SportKey;
  /** Team tab segment (remembered like the legacy app). */
  teamView: TeamView;
  setTeamView: (teamView: TeamView) => void;
  /** The child a parent last looked at, per team (D135): the first tab, Home and Training follow it. */
  childByTeam: Record<string, string>;
  setChild: (teamId: string, playerId: string) => void;
  /** Training → Library: the categories left open on this device (D139); closed to start. */
  libraryOpen: string[];
  toggleLibrary: (category: string) => void;
  /** Schedule tab segment. */
  gamesView: GamesView;
  setGamesView: (gamesView: GamesView) => void;
  setTheme: (theme: Theme) => void;
  setFieldView: (fieldView: FieldView) => void;
  setSport: (sport: SportKey) => void;
}

export const UI_STORAGE_KEY = 'mm-ui';

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'auto',
      fieldView: 'persp',
      sport: 'soccer',
      teamView: 'rotation',
      setTeamView: (teamView) => set({ teamView }),
      childByTeam: {},
      setChild: (teamId, playerId) => set((s) => ({ childByTeam: { ...s.childByTeam, [teamId]: playerId } })),
      libraryOpen: [],
      toggleLibrary: (category) =>
        set((s) => ({
          libraryOpen: s.libraryOpen.includes(category)
            ? s.libraryOpen.filter((c) => c !== category)
            : [...s.libraryOpen, category],
        })),
      gamesView: 'all',
      setGamesView: (gamesView) => set({ gamesView }),
      setTheme: (theme) => set({ theme }),
      setFieldView: (fieldView) => set({ fieldView }),
      setSport: (sport) => set({ sport }),
    }),
    {
      name: UI_STORAGE_KEY,
      version: 3,
      // v1 remembered the old Games tab segments (schedule | results); both land on All.
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Partial<UIState>;
        if (version < 2) s.gamesView = 'all';
        // v3: the Stats tab is gone (D135); its remembered segment goes with it
        if (version < 3) delete (s as Record<string, unknown>).statsView;
        return s as UIState;
      },
      partialize: (s) => ({
        theme: s.theme,
        fieldView: s.fieldView,
        sport: s.sport,
        teamView: s.teamView,
        childByTeam: s.childByTeam,
        gamesView: s.gamesView,
        libraryOpen: s.libraryOpen,
      }),
    },
  ),
);
