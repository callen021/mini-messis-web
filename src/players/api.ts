import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type Enums, type Tables } from '@/lib/database.types';
import { normalizePhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

/** Private player data (D52) and the shared contact directory (D57). RLS trims what each caller sees. */
export type PlayerDetails = Tables<'player_details'>;
export type PlayerContact = Tables<'player_contacts'>;
export type ShirtSize = Enums<'shirt_size'>;

export const SHIRT_SIZES: readonly { value: ShirtSize; label: string }[] = [
  { value: 'YXS', label: 'Youth XS' },
  { value: 'YS', label: 'Youth S' },
  { value: 'YM', label: 'Youth M' },
  { value: 'YL', label: 'Youth L' },
  { value: 'YXL', label: 'Youth XL' },
  { value: 'AS', label: 'Adult S' },
  { value: 'AM', label: 'Adult M' },
  { value: 'AL', label: 'Adult L' },
  { value: 'AXL', label: 'Adult XL' },
];

export const shirtSizeLabel = (s: ShirtSize | null | undefined): string =>
  SHIRT_SIZES.find((x) => x.value === s)?.label ?? '';

export const playerKeys = {
  details: (playerId: string) => ['player', playerId, 'details'] as const,
  people: (playerId: string) => ['player', playerId, 'people'] as const,
  directory: (teamId: string) => ['team', teamId, 'directory'] as const,
  teamContacts: (teamId: string) => ['team', teamId, 'contacts'] as const,
  teamSheet: (teamId: string) => ['team', teamId, 'sheet'] as const,
};

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

/* ---------- details (birthdate, shirt size) ---------- */

export function usePlayerDetails(playerId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: playerKeys.details(playerId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_details')
        .select('*')
        .eq('player_id', playerId as string)
        .maybeSingle();
      fail(error);
      return (data as PlayerDetails | null) ?? null;
    },
    enabled: !!playerId && enabled,
  });
}

export type DetailsPatch = Partial<Pick<PlayerDetails, 'birthdate' | 'shirt_size'>>;

/** Upsert the one details row; optimistic. */
export function useSavePlayerDetails(playerId: string) {
  const qc = useQueryClient();
  const key = playerKeys.details(playerId);
  return useMutation({
    mutationFn: async (patch: DetailsPatch) =>
      fail(
        (
          await supabase
            .from('player_details')
            .upsert({ player_id: playerId, ...patch }, { onConflict: 'player_id' })
        ).error,
      ),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<PlayerDetails | null>(key);
      qc.setQueryData<PlayerDetails | null>(key, {
        player_id: playerId,
        birthdate: null,
        shirt_size: null,
        updated_at: new Date().toISOString(),
        updated_by: null,
        ...previous,
        ...patch,
      });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
}

/* ---------- people: the merged Parents list ---------- */

/** One row of a player's Parents list: a contact row, or a guardian account without one. */
export interface Person {
  contact_id: string | null;
  user_id: string | null;
  name: string;
  relationship: string | null;
  email: string | null;
  phone: string | null;
  share_with_team: boolean;
  in_app: boolean;
  link_status: 'approved' | 'pending' | null;
  can_edit: boolean;
}

export function usePlayerPeople(playerId: string | undefined) {
  return useQuery({
    queryKey: playerKeys.people(playerId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('player_people', { p_player_id: playerId as string });
      fail(error);
      return (data ?? []) as Person[];
    },
    enabled: !!playerId,
  });
}

export interface ContactInput {
  name: string;
  relationship: string | null;
  email: string | null;
  phone: string | null;
  user_id: string | null;
  share_with_team: boolean;
}

function invalidatePeople(qc: ReturnType<typeof useQueryClient>, playerId: string) {
  void qc.invalidateQueries({ queryKey: playerKeys.people(playerId) });
  void qc.invalidateQueries({ queryKey: ['team'], predicate: (q) => q.queryKey.includes('directory') });
  void qc.invalidateQueries({ queryKey: ['team'], predicate: (q) => q.queryKey.includes('contacts') });
  void qc.invalidateQueries({ queryKey: ['team'], predicate: (q) => q.queryKey.includes('sheet') });
}

/** Add or edit a contact; the phone is stored normalised (D57). */
export function useSaveContact(playerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ContactInput & { id?: string | null }) => {
      const row = {
        name: input.name.trim().slice(0, 80),
        relationship: input.relationship?.trim().slice(0, 40) || null,
        email: input.email?.trim().toLowerCase().slice(0, 120) || null,
        phone: normalizePhone(input.phone),
        user_id: input.user_id ?? null,
        share_with_team: input.share_with_team,
      };
      if (input.id) fail((await supabase.from('player_contacts').update(row).eq('id', input.id)).error);
      else fail((await supabase.from('player_contacts').insert({ player_id: playerId, ...row })).error);
    },
    onSettled: () => invalidatePeople(qc, playerId),
  });
}

export function useSetContactShared(playerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, shared }: { id: string; shared: boolean }) =>
      fail((await supabase.from('player_contacts').update({ share_with_team: shared }).eq('id', id)).error),
    onMutate: async ({ id, shared }) => {
      const key = playerKeys.people(playerId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Person[]>(key);
      if (previous)
        qc.setQueryData(
          key,
          previous.map((p) => (p.contact_id === id ? { ...p, share_with_team: shared } : p)),
        );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(playerKeys.people(playerId), ctx.previous);
    },
    onSettled: () => invalidatePeople(qc, playerId),
  });
}

export function useDeleteContact(playerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      fail((await supabase.from('player_contacts').delete().eq('id', id)).error),
    onSettled: () => invalidatePeople(qc, playerId),
  });
}

/* ---------- team-wide ---------- */

/** Parents' first names per player, as the caller may see them (roster directory). */
export function useRosterDirectory(teamId: string) {
  return useQuery({
    queryKey: playerKeys.directory(teamId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('roster_directory', { p_team_id: teamId });
      fail(error);
      const map = new Map<string, string[]>();
      for (const r of data ?? []) map.set(r.player_id, r.parent_names ?? []);
      return map;
    },
  });
}

/** Every contact row on the team the caller may read (for "Add all to contacts"). */
export function useTeamContacts(teamId: string, playerIds: readonly string[], enabled = true) {
  return useQuery({
    // the ids themselves, never just their count (D59)
    queryKey: [...playerKeys.teamContacts(teamId), [...playerIds].sort().join(',')],
    queryFn: async () => {
      if (!playerIds.length) return [] as PlayerContact[];
      const { data, error } = await supabase
        .from('player_contacts')
        .select('*')
        .in('player_id', [...playerIds])
        .order('sort_order')
        .order('created_at');
      fail(error);
      return (data ?? []) as PlayerContact[];
    },
    enabled,
  });
}

export interface SheetContact {
  name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  share_with_team: boolean;
}
export interface TeamSheetRow {
  player_id: string;
  first_name: string;
  last_name: string | null;
  jersey_number: string | null;
  birthdate: string | null;
  shirt_size: ShirtSize | null;
  contacts: SheetContact[];
}

/** Staff only: child, birthdate, shirt size and every parent (the Team sheet). */
export function useTeamSheet(teamId: string, enabled = true) {
  return useQuery({
    queryKey: playerKeys.teamSheet(teamId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('team_sheet', { p_team_id: teamId });
      fail(error);
      return (data ?? []).map((r) => ({
        ...r,
        contacts: (r.contacts ?? []) as unknown as SheetContact[],
      })) as TeamSheetRow[];
    },
    enabled,
  });
}

/** Whole years between a yyyy-mm-dd birthdate and `today`; null when unknown or malformed. */
export function ageOn(birthdate: string | null | undefined, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthdate ?? '');
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  let age = today.getFullYear() - y;
  if (today.getMonth() < mo || (today.getMonth() === mo && today.getDate() < d)) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}
