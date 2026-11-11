import { useState } from 'react';
import { Link } from 'react-router';
import { useCurrentTeam } from '@/teams/TeamContext';
import { dismissPost, readDismissed, useAnnouncements } from './api';
import { linkify } from './linkify';

/** The latest undismissed announcement as a banner (Schedule and the parent home, D58). */
export function AnnouncementBanner() {
  const { teamId } = useCurrentTeam();
  const { data } = useAnnouncements(teamId);
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed());
  const post = data.find((p) => !dismissed.has(p.id));
  if (!post) return null;
  const short = post.body.length > 240 ? `${post.body.slice(0, 240)}…` : post.body;
  return (
    <div className="banner" role="status">
      <div className="body">
        <b>Announcement · {post.author_name}</b>
        {linkify(short).map((s, i) =>
          s.kind === 'link' ? (
            <a key={i} href={s.href} target="_blank" rel="noopener noreferrer">
              {s.text}
            </a>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}{' '}
        <Link to="/board">Open the board</Link>
      </div>
      <button
        type="button"
        className="dismiss"
        aria-label="Dismiss announcement"
        onClick={() => {
          dismissPost(post.id);
          setDismissed(new Set([...dismissed, post.id]));
        }}
      >
        ×
      </button>
    </div>
  );
}
