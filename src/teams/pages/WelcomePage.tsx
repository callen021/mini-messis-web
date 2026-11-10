import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useIsPlatformAdmin } from '@/admin/useIsPlatformAdmin';
import { useAuth } from '@/auth/AuthProvider';
import { LoadingScreen } from '@/auth/guards';
import { Button } from '@/components/Button';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { isCompleteCode, normalizeCode } from '@/lib/join-code';
import { signOut, useActiveMemberships, usePendingRequests } from '../api';

/**
 * Signed in, no team yet. Parents arrive through the coach's invite link, so this page mostly
 * explains that and offers a box for a code typed by hand; only a platform admin can create a team
 * (D48).
 */
export function WelcomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = useIsPlatformAdmin() === true;
  const memberships = useActiveMemberships(user?.id);
  const pending = usePendingRequests(user?.id);
  const [code, setCode] = useState('');
  if (memberships.isPending) return <LoadingScreen />;
  if (memberships.data && memberships.data.length > 0) return <Navigate to="/" replace />;
  const hasPending = (pending.data?.length ?? 0) > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (isCompleteCode(code)) navigate(`/join/${code}`);
  };

  return (
    <Page
      title="Welcome"
      sub={isAdmin ? 'Create a team, or join one with a code' : 'Ask your coach for an invite link'}
    >
      {isAdmin && (
        <Group>
          <Row
            to="/create-team"
            icon="🏆"
            label="Create a team"
            detail="Set up a new team as its coach and owner"
            chevron
          />
        </Group>
      )}
      <Section>Have a code?</Section>
      <Group>
        <form className="form" onSubmit={submit} noValidate>
          <input
            className="input code-input"
            value={code}
            onChange={(e) => setCode(normalizeCode(e.target.value))}
            placeholder="ABCD2345"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            maxLength={8}
            aria-label="Join code"
          />
          <Button type="submit" disabled={!isCompleteCode(code)}>
            Join team
          </Button>
        </form>
      </Group>
      <Footer>
        The coach’s invite link opens the team straight away. If you were given an 8-character code instead,
        paste it here.
      </Footer>
      {hasPending && (
        <Group style={{ marginTop: 12 }}>
          <Row
            to="/pending"
            label="Waiting for approval"
            detail="See the requests you've sent"
            chevron
            link
          />
        </Group>
      )}
      <Group style={{ marginTop: 12 }}>
        {isAdmin && <Row to="/admin" label="Admin console" detail="Every team and user" link chevron />}
        <Row onClick={() => void signOut()} label="Sign out" destructive />
      </Group>
      <Footer>Signed in as {user?.email}.</Footer>
    </Page>
  );
}
