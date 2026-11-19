import { useMemo } from 'react';
import { useMyChildLinks } from '@/lineups/api';
import { useUIStore } from '@/lib/ui-store';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';

/** The stored choice if it is still one of mine, else the first child. */
export function pickChild<T extends { id: string }>(
  kids: readonly T[],
  storedId: string | undefined,
): T | null {
  return kids.find((k) => k.id === storedId) ?? kids[0] ?? null;
}

/**
 * My linked children on the current team and the one selected (D135). The choice is remembered
 * per team on this device; the first tab's label, Home and Training all follow it.
 */
export function useMyKids() {
  const { teamId } = useCurrentTeam();
  const players = usePlayers(teamId);
  const links = useMyChildLinks();
  const stored = useUIStore((s) => s.childByTeam[teamId]);
  const setChild = useUIStore((s) => s.setChild);
  const kids = useMemo(() => {
    const mine = links.data ?? new Map<string, string>();
    return (players.data ?? []).filter((p) => mine.has(p.id));
  }, [links.data, players.data]);
  const child = pickChild(kids, stored);
  return {
    kids,
    child,
    /** True once a coach has confirmed my link to the selected child. */
    confirmed: !!child && links.data?.get(child.id) === 'approved',
    isConfirmed: (id: string) => links.data?.get(id) === 'approved',
    select: (id: string) => setChild(teamId, id),
    isPending: players.isPending || links.isPending,
  };
}
