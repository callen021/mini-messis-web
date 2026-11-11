import { type FormEvent, useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Textarea, TextInput } from '@/components/Form';
import { Footer, Group, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { useActionSheet } from '@/components/Sheet';
import { Switch } from '@/components/Switch';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { useCurrentTeam } from '@/teams/TeamContext';
import {
  type BoardPost,
  COMMENT_MAX,
  POST_MAX,
  useAddComment,
  useBoardFeed,
  useCreatePost,
  useDeleteComment,
  useDeletePost,
  useMarkBoardRead,
  useSetAnnouncement,
  useUpdateComment,
  useUpdatePost,
} from './api';
import { linkify, timeAgo } from './linkify';

/** Router state the schedule pages pass when offering "Post this to the board". */
export interface BoardDraft {
  draft?: string;
  announcement?: boolean;
}

/** Body text with links made tappable (text only, D58). */
function Body({ text }: { text: string }) {
  return (
    <p className="body">
      {linkify(text).map((s, i) =>
        s.kind === 'link' ? (
          <a key={i} href={s.href} target="_blank" rel="noopener noreferrer">
            {s.text}
          </a>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  );
}

/** The team board (D58): announcements pinned on top, posts newest first, one level of comments. */
export function BoardPage() {
  const { teamId, team } = useCurrentTeam();
  const { user } = useAuth();
  const isStaff = useIsStaff();
  const toast = useToast();
  const sheet = useActionSheet();
  const location = useLocation();
  const incoming = (location.state as BoardDraft | null) ?? {};
  const feed = useBoardFeed(teamId);
  const markRead = useMarkBoardRead(teamId);
  const create = useCreatePost(teamId);
  const update = useUpdatePost(teamId);
  const remove = useDeletePost(teamId);
  const setAnnouncement = useSetAnnouncement(teamId);
  const addComment = useAddComment(teamId);
  const updateComment = useUpdateComment(teamId);
  const removeComment = useDeleteComment(teamId);
  const [draft, setDraft] = useState(incoming.draft ?? '');
  const [announce, setAnnounce] = useState(!!incoming.announcement && isStaff);
  const [editing, setEditing] = useState<{ kind: 'post' | 'comment'; id: string; body: string } | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const onError = (e: unknown) => toast(errorMessage(e));

  // opening the board clears the unread dot; so does seeing new activity while it is open
  const { mutate: mark } = markRead;
  const stamp = feed.dataUpdatedAt;
  useEffect(() => {
    if (stamp) mark();
  }, [stamp, mark]);

  const post = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    create.mutate(
      { body: draft, announcement: announce },
      {
        onSuccess: () => {
          setDraft('');
          setAnnounce(false);
          toast(announce ? 'Announcement posted' : 'Posted');
        },
        onError,
      },
    );
  };

  const postMenu = async (p: BoardPost) => {
    const mine = p.author_id === user?.id;
    const actions: { label: string; value: string; destructive?: boolean }[] = [];
    if (mine) actions.push({ label: 'Edit', value: 'edit' });
    if (isStaff)
      actions.push({
        label: p.is_announcement ? 'Remove announcement' : 'Mark as announcement',
        value: 'pin',
      });
    if (mine || isStaff) actions.push({ label: 'Delete post', value: 'delete', destructive: true });
    if (!actions.length) return;
    const choice = await sheet<string>({ title: `${p.author_name} · ${timeAgo(p.created_at)}`, actions });
    if (choice === 'edit') setEditing({ kind: 'post', id: p.id, body: p.body });
    else if (choice === 'pin')
      setAnnouncement.mutate(
        { id: p.id, on: !p.is_announcement },
        {
          onError,
          onSuccess: () =>
            toast(p.is_announcement ? 'No longer an announcement' : 'Pinned as an announcement'),
        },
      );
    else if (choice === 'delete') {
      const ok = await sheet({
        title: 'Delete this post?',
        message: 'Its comments go with it.',
        actions: [{ label: 'Delete post', value: true, destructive: true }],
      });
      if (ok) remove.mutate(p.id, { onError, onSuccess: () => toast('Post deleted') });
    }
  };

  const commentMenu = async (c: BoardPost['comments'][number]) => {
    const mine = c.author_id === user?.id;
    const actions: { label: string; value: string; destructive?: boolean }[] = [];
    if (mine) actions.push({ label: 'Edit', value: 'edit' });
    if (mine || isStaff) actions.push({ label: 'Delete comment', value: 'delete', destructive: true });
    if (!actions.length) return;
    const choice = await sheet<string>({ title: `${c.author_name} · ${timeAgo(c.created_at)}`, actions });
    if (choice === 'edit') setEditing({ kind: 'comment', id: c.id, body: c.body });
    else if (choice === 'delete')
      removeComment.mutate(c.id, { onError, onSuccess: () => toast('Comment deleted') });
  };

  const saveEdit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing || !editing.body.trim()) return;
    const done = { onError, onSuccess: () => setEditing(null) };
    if (editing.kind === 'post') update.mutate({ id: editing.id, body: editing.body }, done);
    else updateComment.mutate({ id: editing.id, body: editing.body }, done);
  };

  const sendComment = (postId: string) => {
    const body = (commentDrafts[postId] ?? '').trim();
    if (!body) return;
    addComment.mutate(
      { postId, body },
      { onError, onSuccess: () => setCommentDrafts((d) => ({ ...d, [postId]: '' })) },
    );
  };

  if (feed.isPending) return <LoadingScreen label="Opening the board…" />;
  const posts = feed.data ?? [];

  return (
    <Page title="Team board" sub={`${team.name} · ${posts.length} post${posts.length === 1 ? '' : 's'}`}>
      <Group className="composer">
        <form onSubmit={post}>
          <Textarea
            aria-label="New post"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, POST_MAX))}
            placeholder={isStaff ? 'Tell the team something…' : 'Ask the team something…'}
            maxLength={POST_MAX}
            rows={3}
          />
          <div className="foot">
            {isStaff ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Switch label="Announcement" size="sm" checked={announce} onChange={setAnnounce} />
                <span>Announcement (pinned, shown on Schedule and the home tab)</span>
              </div>
            ) : (
              <span>{draft.length ? `${draft.length} / ${POST_MAX}` : 'Text and links only'}</span>
            )}
            <Button type="submit" size="sm" disabled={!draft.trim() || create.isPending}>
              {create.isPending ? 'Posting…' : 'Post'}
            </Button>
          </div>
        </form>
      </Group>
      <Section>Posts</Section>
      <Group>
        {posts.map((p) => (
          <article key={p.id} className="post">
            <div className="who">
              <b>{p.author_name}</b>
              <span>{timeAgo(p.created_at)}</span>
              {p.edited_at && <span>· edited</span>}
              {p.is_announcement && <Badge status="live">Announcement</Badge>}
              {(p.author_id === user?.id || isStaff) && (
                <button
                  type="button"
                  className="linkbtn"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => void postMenu(p)}
                  aria-label={`Options for post by ${p.author_name}`}
                >
                  ···
                </button>
              )}
            </div>
            {editing?.kind === 'post' && editing.id === p.id ? (
              <form onSubmit={saveEdit} className="form" style={{ padding: 0 }}>
                <Textarea
                  aria-label="Edit post"
                  value={editing.body}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value.slice(0, POST_MAX) })}
                  rows={3}
                  data-autofocus=""
                />
                <div className="tools">
                  <Button type="submit" size="sm">
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="gray" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <Body text={p.body} />
            )}
            {p.comments.length > 0 && (
              <div className="comments">
                {p.comments.map((c) => (
                  <div key={c.id} className="comment">
                    <div className="who">
                      <b>{c.author_name}</b>
                      <span>{timeAgo(c.created_at)}</span>
                      {c.edited_at && <span>· edited</span>}
                      {(c.author_id === user?.id || isStaff) && (
                        <button
                          type="button"
                          className="linkbtn"
                          style={{ marginLeft: 'auto' }}
                          onClick={() => void commentMenu(c)}
                          aria-label={`Options for comment by ${c.author_name}`}
                        >
                          ···
                        </button>
                      )}
                    </div>
                    {editing?.kind === 'comment' && editing.id === c.id ? (
                      <form onSubmit={saveEdit} className="commentbox">
                        <TextInput
                          aria-label="Edit comment"
                          value={editing.body}
                          onChange={(e) =>
                            setEditing({ ...editing, body: e.target.value.slice(0, COMMENT_MAX) })
                          }
                          data-autofocus=""
                        />
                        <Button type="submit" size="sm">
                          Save
                        </Button>
                      </form>
                    ) : (
                      <Body text={c.body} />
                    )}
                  </div>
                ))}
              </div>
            )}
            <form
              className="commentbox"
              onSubmit={(e) => {
                e.preventDefault();
                sendComment(p.id);
              }}
            >
              <TextInput
                aria-label={`Comment on post by ${p.author_name}`}
                value={commentDrafts[p.id] ?? ''}
                onChange={(e) =>
                  setCommentDrafts((d) => ({ ...d, [p.id]: e.target.value.slice(0, COMMENT_MAX) }))
                }
                placeholder="Add a comment"
                maxLength={COMMENT_MAX}
              />
              <Button type="submit" size="sm" variant="tinted" disabled={!(commentDrafts[p.id] ?? '').trim()}>
                Send
              </Button>
            </form>
          </article>
        ))}
        {posts.length === 0 && <div className="post">Nothing posted yet. Say hello.</div>}
      </Group>
      <Footer>
        Everyone on the team sees the board when they open the app; there are no notifications. Announcements
        from the coaches stay pinned here and show as a banner on the Schedule and home tabs.
      </Footer>
    </Page>
  );
}
