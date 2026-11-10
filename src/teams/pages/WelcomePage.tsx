import { Navigate } from 'react-router';
import { useIsPlatformAdmin } from '@/admin/useIsPlatformAdmin';
import { useAuth } from '@/auth/AuthProvider';
import { LoadingScreen } from '@/auth/guards';
import { Footer, Group, Row } from '@/components/List';
import { Page } from '@/components/Page';
import { signOut, useActiveMemberships, usePendingRequests } from '../api';

/** First run: no team yet. */
export function WelcomePage() {
  const { user } = useAuth();
  const isAdmin = useIsPlatformAdmin() === true;
  const memberships = useActiveMemberships(user?.id);
  const pending = usePendingRequests(user?.id);
  if (memberships.isPending) return <LoadingScreen />;
  if (memberships.data && memberships.data.length > 0) return <Navigate to="/" replace />;
  const hasPending = (pending.data?.length ?? 0) > 0;

  return (
    <Page title="Welcome" sub="How will you use Mini-Messi's?">
      <Group>
        <Row
          to="/create-team"
          icon="🏆"
          label="I'm a coach"
          detail="Create a team, set up the roster and lineups"
          chevron
        />
        <Row
          to="/join"
          icon="👋"
          label="I'm a parent or assistant"
          detail="I have a join code from the coach"
          chevron
        />
      </Group>
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
