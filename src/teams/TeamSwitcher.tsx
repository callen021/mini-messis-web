import { useNavigate } from 'react-router';
import { useActAs } from '@/admin/actAs';
import { Badge } from '@/components/Badge';
import { useActionSheet } from '@/components/Sheet';
import { SPORTS } from '@/sports/definitions';
import { useCurrentTeam } from './TeamContext';

const ROLE_LABEL = { coach: 'Coach', assistant: 'Assistant', parent: 'Parent' } as const;

/** Compact team row at the top of every tab page; tap to switch teams or add one. */
export function TeamSwitcher() {
  const { team, role, memberships, switchTeam, adminActing } = useCurrentTeam();
  const setActAs = useActAs((s) => s.setTeamId);
  const sheet = useActionSheet();
  const navigate = useNavigate();
  const S = SPORTS[team.sport];
  const multi = memberships.length > 1;

  const open = async () => {
    const choice = await sheet<string>({
      title: 'Your teams',
      actions: [
        ...memberships.map((m) => ({
          label: `${SPORTS[m.team.sport].emoji} ${m.team.name}${m.team.id === team.id ? ' ✓' : ''}`,
          value: m.team.id,
        })),
        ...(adminActing ? [{ label: 'Back to the admin console', value: '__admin' }] : []),
        { label: 'Join a team with a code', value: '__join' },
        { label: 'Create a new team', value: '__create' },
      ],
    });
    if (!choice) return;
    if (choice === '__admin') {
      setActAs(null);
      navigate('/admin');
    } else if (choice === '__join') navigate('/join');
    else if (choice === '__create') navigate('/create-team');
    else switchTeam(choice);
  };

  return (
    <button
      type="button"
      className="teamswitch"
      onClick={open}
      aria-label={`Team: ${team.name}. ${multi ? 'Switch team' : 'Team options'}`}
    >
      <span className="emoji" aria-hidden="true">
        {S.emoji}
      </span>
      <span className="name">{team.name}</span>
      <Badge status={adminActing ? 'live' : undefined}>{adminActing ? 'Admin' : ROLE_LABEL[role]}</Badge>
      <span className="chev" aria-hidden="true" />
    </button>
  );
}
