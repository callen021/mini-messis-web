import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { type DbErrorLike, dbError } from '@/lib/errors';

/** Team board (D58): posts, one level of comments, announcements, unread tracking. */
export interface BoardComment {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  edited_at: string | null;
}
export interface BoardPost {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  is_announcement: boolean;
  created_at: string;
  edited_at: string | null;
  comments: BoardComment[];
}

export const POST_MAX = 2000;
export const COMMENT_MAX = 1000;

export const boardKeys = {
  feed: (teamId: string) => ['team', teamId, 'board', 'feed'] as const,
  unread: (teamId: string) => ['team', teamId, 'board', 'unread'] as const,
  all: (teamId: string) => ['team', teamId, 'board'] as const,
};

const fail = (error: DbErrorLike | null) => {
  if (error) throw dbError(error);
};

export function useBoardFeed(teamId: string) {
  return useQuery({
    queryKey: boardKeys.feed(teamId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('board_feed', { p_team_id: teamId });
      fail(error);
      return (data ?? []).map((p) => ({
        ...p,
        comments: (p.comments ?? []) as unknown as BoardComment[],
      })) as BoardPost[];
    },
  });
}

/** Latest announcements (pinned posts), for the banners on Schedule and the parent home. */
export function useAnnouncements(teamId: string) {
  const feed = useBoardFeed(teamId);
  return { ...feed, data: (feed.data ?? []).filter((p) => p.is_announcement) };
}

export function useBoardUnread(teamId: string) {
  return useQuery({
    queryKey: boardKeys.unread(teamId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('board_unread', { p_team_id: teamId });
      fail(error);
      return data === true;
    },
    staleTime: 15_000,
  });
}

export function useMarkBoardRead(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => fail((await supabase.rpc('board_mark_read', { p_team_id: teamId })).error),
    onSuccess: () => qc.setQueryData(boardKeys.unread(teamId), false),
  });
}

function useBoardMutation<TArgs>(teamId: string, fn: (args: TArgs) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => void qc.invalidateQueries({ queryKey: boardKeys.all(teamId) }),
  });
}

export function useCreatePost(teamId: string) {
  return useBoardMutation(teamId, async ({ body, announcement }: { body: string; announcement: boolean }) => {
    const { data: auth } = await supabase.auth.getUser();
    fail(
      (
        await supabase.from('board_posts').insert({
          team_id: teamId,
          author_id: auth.user?.id ?? '',
          body: body.trim().slice(0, POST_MAX),
          is_announcement: announcement,
        })
      ).error,
    );
  });
}

export function useUpdatePost(teamId: string) {
  return useBoardMutation(teamId, async ({ id, body }: { id: string; body: string }) =>
    fail(
      (
        await supabase
          .from('board_posts')
          .update({ body: body.trim().slice(0, POST_MAX) })
          .eq('id', id)
      ).error,
    ),
  );
}

export function useSetAnnouncement(teamId: string) {
  return useBoardMutation(teamId, async ({ id, on }: { id: string; on: boolean }) =>
    fail((await supabase.from('board_posts').update({ is_announcement: on }).eq('id', id)).error),
  );
}

export function useDeletePost(teamId: string) {
  return useBoardMutation(teamId, async (id: string) =>
    fail((await supabase.from('board_posts').delete().eq('id', id)).error),
  );
}

export function useAddComment(teamId: string) {
  return useBoardMutation(teamId, async ({ postId, body }: { postId: string; body: string }) => {
    const { data: auth } = await supabase.auth.getUser();
    fail(
      (
        await supabase.from('board_comments').insert({
          post_id: postId,
          author_id: auth.user?.id ?? '',
          body: body.trim().slice(0, COMMENT_MAX),
        })
      ).error,
    );
  });
}

export function useUpdateComment(teamId: string) {
  return useBoardMutation(teamId, async ({ id, body }: { id: string; body: string }) =>
    fail(
      (
        await supabase
          .from('board_comments')
          .update({ body: body.trim().slice(0, COMMENT_MAX) })
          .eq('id', id)
      ).error,
    ),
  );
}

export function useDeleteComment(teamId: string) {
  return useBoardMutation(teamId, async (id: string) =>
    fail((await supabase.from('board_comments').delete().eq('id', id)).error),
  );
}

/* ---------- dismissed announcement banners (per device) ---------- */

const DISMISSED_KEY = 'mm-dismissed-posts';

export function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function dismissPost(id: string): void {
  try {
    const next = [...readDismissed(), id].slice(-50);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
