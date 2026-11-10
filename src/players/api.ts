import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type Enums, type Tables, type TablesInsert } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

/** Private player data (D52): staff and the player's approved guardians only. RLS trims the rest. */
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
  contacts: (playerId: string) => ['player', playerId, 'contacts'] as const,
};

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

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

export function usePlayerContacts(playerId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: playerKeys.contacts(playerId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_contacts')
        .select('*')
        .eq('player_id', playerId as string)
        .order('sort_order')
        .order('created_at');
      fail(error);
      return (data ?? []) as PlayerContact[];
    },
    enabled: !!playerId && enabled,
  });
}

export type ContactInput = Pick<
  TablesInsert<'player_contacts'>,
  'name' | 'relationship' | 'email' | 'phone' | 'user_id'
>;

export function useSaveContact(playerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ContactInput & { id?: string }) => {
      const row = {
        name: input.name.trim().slice(0, 80),
        relationship: input.relationship?.trim().slice(0, 40) || null,
        email: input.email?.trim().slice(0, 120) || null,
        phone: input.phone?.trim().slice(0, 40) || null,
        user_id: input.user_id ?? null,
      };
      if (input.id) fail((await supabase.from('player_contacts').update(row).eq('id', input.id)).error);
      else fail((await supabase.from('player_contacts').insert({ player_id: playerId, ...row })).error);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: playerKeys.contacts(playerId) }),
  });
}

export function useDeleteContact(playerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      fail((await supabase.from('player_contacts').delete().eq('id', id)).error),
    onSettled: () => void qc.invalidateQueries({ queryKey: playerKeys.contacts(playerId) }),
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
