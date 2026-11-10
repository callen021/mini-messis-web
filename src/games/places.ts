import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/** A location the team has used before, with the address last entered for it (D50). */
export interface TeamPlace {
  location: string;
  address: string | null;
  last_used: string | null;
  uses: number;
}

/** Previously used location/address pairs for the team, most recent first. */
export function useTeamPlaces(teamId: string, enabled = true) {
  return useQuery({
    queryKey: ['team', teamId, 'places'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('team_places', { p_team_id: teamId });
      if (error) throw new Error(error.message);
      return (data ?? []) as TeamPlace[];
    },
    enabled,
    staleTime: 60_000,
  });
}

/** The address remembered for a location name (case-insensitive), if any. */
export function addressFor(places: readonly TeamPlace[] | undefined, location: string): string | null {
  const key = location.trim().toLowerCase();
  if (!key) return null;
  return places?.find((p) => p.location.trim().toLowerCase() === key)?.address ?? null;
}
