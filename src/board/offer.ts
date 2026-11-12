import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useActionSheet } from '@/components/Sheet';
import type { BoardDraft } from './BoardPage';

/**
 * After staff cancel a practice or change a game's time or place, offer to tell the team (D58):
 * an action sheet, then the board with the message pre-filled as an announcement.
 */
export function useOfferBoardPost() {
  const sheet = useActionSheet();
  const navigate = useNavigate();
  return useCallback(
    async (title: string, message: string) => {
      const ok = await sheet({
        title,
        message: `Post this to the board so every parent sees it?\n\n“${message}”`,
        actions: [{ label: 'Post this to the board', value: true }],
        cancel: 'Not now',
      });
      if (ok) navigate('/board', { state: { draft: message, announcement: true } satisfies BoardDraft });
    },
    [sheet, navigate],
  );
}
