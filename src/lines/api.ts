import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type Tables } from '@/lib/database.types';
import { type DbErrorLike, dbError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export type LineKind = 'forward' | 'defense';
/**
 * A named forward line (LW, C, RW) or defense pair (LD, RD) of a hockey team (D122). The players
 * are positional: `player_ids[0]` plays the first spot of the kind; an empty spot is null.
 */
export type Line = Omit<Tables<'lines'>, 'kind' | 'player_ids'> & {
  kind: LineKind;
  player_ids: (string | null)[];
};

/** F1–F3 and D1–D2: the slots a team may fill, in display order. */
export const LINE_SLOTS: readonly { kind: LineKind; slot: number }[] = [
  { kind: 'forward', slot: 1 },
  { kind: 'forward', slot: 2 },
  { kind: 'forward', slot: 3 },
  { kind: 'defense', slot: 1 },
  { kind: 'defense', slot: 2 },
];

/** The spots a line of this kind takes, in the order its players are saved. */
export const LINE_ROLES: Readonly<Record<LineKind, readonly string[]>> = {
  forward: ['LW', 'C', 'RW'],
  defense: ['LD', 'RD'],
};

/** "F2" / "D1": the chip label; the saved name when there is one. */
export function lineLabel(line: { kind: LineKind; slot: number; name?: string }): string {
  return line.name?.trim() || `${line.kind === 'forward' ? 'F' : 'D'}${line.slot}`;
}

/** True when the line has at least one player saved. */
export const lineHasPlayers = (line: Pick<Line, 'player_ids'>): boolean => line.player_ids.some(Boolean);

function fail(error: DbErrorLike | null): void {
  if (error) throw dbError(error);
}

export const lineKeys = {
  lines: (teamId: string) => ['team', teamId, 'lines'] as const,
};

/** The team's saved lines, forward lines first then the pairs, by slot. */
export function useLines(teamId: string, enabled = true) {
  return useQuery({
    queryKey: lineKeys.lines(teamId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lines')
        .select('*')
        .eq('team_id', teamId)
        .order('kind', { ascending: false })
        .order('slot');
      fail(error);
      return (data ?? []) as Line[];
    },
    enabled,
    staleTime: 60_000,
  });
}

/** Save one line (name and positional players) by kind and slot; trailing empty spots are dropped. */
export function useSaveLine(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      kind,
      slot,
      name,
      playerIds,
    }: {
      kind: LineKind;
      slot: number;
      name: string;
      playerIds: readonly (string | null)[];
    }) => {
      const ids = [...playerIds];
      while (ids.length && !ids[ids.length - 1]) ids.pop();
      fail(
        (
          await supabase
            .from('lines')
            .upsert(
              { team_id: teamId, kind, slot, name, player_ids: ids as unknown as string[] },
              { onConflict: 'team_id,kind,slot' },
            )
        ).error,
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: lineKeys.lines(teamId) });
    },
  });
}
