import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * The team a platform admin is currently acting on as its coach. Session-scoped: it is cleared when
 * the tab closes, and ignored for anyone whose profile is not an admin.
 */
interface ActAsState {
  teamId: string | null;
  setTeamId: (teamId: string | null) => void;
}

export const useActAs = create<ActAsState>()(
  persist(
    (set) => ({
      teamId: null,
      setTeamId: (teamId) => set({ teamId }),
    }),
    {
      name: 'mm-admin-act-as',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ teamId: s.teamId }),
    },
  ),
);
