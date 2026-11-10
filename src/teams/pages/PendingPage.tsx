import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { LoadingScreen } from '@/auth/guards';
import { Badge } from '@/components/Badge';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { supabase } from '@/lib/supabase';
import { SPORTS } from '@/sports/definitions';
import { signOut, useActiveMemberships, usePendingRequests } from '../api';

const ROLE = { parent: 'Parent', assistant: 'Assistant coach', coach: 'Coach' } as const;

/** "Waiting for the coach to approve" — flips into the app the moment a membership goes active. */
export function PendingPage() {
  const { user } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();
  const memberships = useActiveMemberships(user?.id);
  const pending = usePendingRequests(user?.id);
  const teamName = (location.state as { teamName?: string } | null)?.teamName;

  // Realtime on my own membership rows (RLS lets me see them), with a slow poll as a fallback.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`pending-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_members', filter: `user_id=eq.${user.id}` },
        () => {
          void qc.invalidateQueries({ queryKey: ['memberships'] });
          void qc.invalidateQueries({ queryKey: ['pending-requests'] });
        },
      )
      .subscribe();
    const poll = window.setInterval(() => {
      void qc.invalidateQueries({ queryKey: ['memberships'] });
      void qc.invalidateQueries({ queryKey: ['pending-requests'] });
    }, 30_000);
    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(poll);
    };
  }, [user, qc]);

  const list = pending.data ?? [];
  // Right after "Request to join" the cached list is still empty while it refetches; wait for it
  // rather than bouncing to /welcome and back.
  if (memberships.isPending || pending.isPending || (pending.isFetching && !list.length)) {
    return <LoadingScreen />;
  }
  if (memberships.data && memberships.data.length > 0) return <Navigate to="/" replace />;
  if (!list.length) return <Navigate to="/welcome" replace />;

  return (
    <Page
      title="Almost in"
      sub={
        teamName ? `Waiting for the ${teamName} coach to approve you` : 'Waiting for the coach to approve you'
      }
    >
      <Section>Your requests</Section>
      <Group>
        {list.map((r) => (
          <Row
            key={r.member_id}
            icon={SPORTS[r.sport].emoji}
            label={r.team_name}
            detail={ROLE[r.requested_role]}
          >
            <Badge status="upcoming">Pending</Badge>
          </Row>
        ))}
      </Group>
      <Footer>
        This page updates by itself when the coach approves you. Nothing about the team is visible until then.
      </Footer>
      <Group style={{ marginTop: 18 }}>
        <Row to="/join" label="Use another code" link chevron />
        <Row to="/create-team" label="Create my own team" link chevron />
        <Row onClick={() => void signOut()} label="Sign out" destructive />
      </Group>
    </Page>
  );
}
