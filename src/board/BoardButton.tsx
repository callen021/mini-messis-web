import { NavLink } from 'react-router';
import { MessageIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useBoardUnread } from './api';

/** The message icon in the header of every screen, with an unread dot (D58). */
export function BoardButton() {
  const { teamId } = useCurrentTeam();
  const unread = useBoardUnread(teamId);
  const dot = unread.data === true;
  return (
    <NavLink
      to="/board"
      className={({ isActive }) => cn('boardbtn', isActive && 'active')}
      aria-label={dot ? 'Team board, new posts' : 'Team board'}
      title="Team board"
    >
      <MessageIcon />
      {dot && <span className="dot" aria-hidden="true" />}
    </NavLink>
  );
}
