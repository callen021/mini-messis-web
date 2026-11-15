import { useMemo } from 'react';
import { useIsStaff } from '@/auth/guards';
import { useActionSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { useMyChildren } from '@/lineups/api';
import { type EventRef } from '@/rsvp/rsvp';
import { type Player, usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useClearSnack, useSetSnack } from './api';
import { type SnackSlot, familyLabel } from './snacks';

/**
 * Everything a page needs to show and change one snack slot (D115): whose it is, whether it is
 * the signed-in parent's family, and the claim / release / assign flows with their sheets.
 */
export function useSnackFamily() {
  const { teamId } = useCurrentTeam();
  const isStaff = useIsStaff();
  const sheet = useActionSheet();
  const toast = useToast();
  const players = usePlayers(teamId);
  const children = useMyChildren();
  const setSnack = useSetSnack(teamId);
  const clearSnack = useClearSnack(teamId);
  const roster = useMemo(() => (players.data ?? []).filter((p) => !p.archived_at), [players.data]);
  const mine = useMemo(() => {
    const ids = children.data ?? new Set<string>();
    return roster.filter((p) => ids.has(p.id));
  }, [children.data, roster]);
  const nameOf = (id: string) => roster.find((p) => p.id === id)?.first_name;
  const isMine = (slot: SnackSlot) =>
    !!slot.snack_player_id && mine.some((p) => p.id === slot.snack_player_id);
  const onError = (e: unknown) => toast(errorMessage(e));

  /** A parent takes an open slot for their family (the child is asked for when there are several). */
  const claim = async (event: EventRef) => {
    let player: Player | undefined = mine[0];
    if (mine.length > 1) {
      const id = await sheet<string>({
        title: 'Which family?',
        actions: mine.map((p) => ({ label: familyLabel(p.first_name), value: p.id })),
      });
      if (!id) return;
      player = mine.find((p) => p.id === id);
    }
    if (!player) return;
    const name = player.first_name;
    setSnack.mutate(
      { event, playerId: player.id },
      { onError, onSuccess: () => toast(`${familyLabel(name)} brings snacks`) },
    );
  };
  /** The family gives its slot back (asked first); a coach clears any. */
  const release = async (event: EventRef, confirm = true) => {
    if (confirm) {
      const ok = await sheet({
        title: 'Release the snack slot?',
        message: 'Another family can sign up for it.',
        actions: [{ label: 'Release', value: true, destructive: true }],
      });
      if (!ok) return;
    }
    clearSnack.mutate(event, { onError, onSuccess: () => toast('Snack slot released') });
  };
  /** A coach picks any family, or clears the slot. */
  const assign = async (event: EventRef, slot: SnackSlot) => {
    const choice = await sheet<string>({
      title: 'Who brings snacks?',
      actions: [
        ...(slot.snack_player_id ? [{ label: 'Clear the slot', value: '', destructive: true }] : []),
        ...roster.map((p) => ({ label: familyLabel(p.first_name), value: p.id })),
      ],
    });
    if (choice === null) return;
    if (choice === '') {
      clearSnack.mutate(event, { onError, onSuccess: () => toast('Snack slot cleared') });
      return;
    }
    const name = nameOf(choice) ?? 'That';
    setSnack.mutate(
      { event, playerId: choice },
      { onError, onSuccess: () => toast(`${familyLabel(name)} brings snacks`) },
    );
  };
  /**
   * After a parent's reply: the snack family saying "can't make it" is asked to release the
   * slot (the event is flagged for the coaches either way, by the server).
   */
  const afterRsvp = async (
    event: EventRef,
    slot: SnackSlot | undefined,
    playerId: string,
    status: string,
  ) => {
    if (status !== 'out' || !slot || slot.snack_player_id !== playerId) return;
    const ok = await sheet({
      title: 'You’re bringing snacks for this one',
      message: 'Release the slot so another family can take it? The coaches are told either way.',
      actions: [{ label: 'Release the slot', value: true }],
      cancel: 'Keep it',
    });
    if (ok) clearSnack.mutate(event, { onError, onSuccess: () => toast('Snack slot released') });
  };

  return {
    isStaff,
    roster,
    mine,
    nameOf,
    isMine,
    claim,
    release,
    assign,
    afterRsvp,
    busy: setSnack.isPending || clearSnack.isPending,
  };
}
