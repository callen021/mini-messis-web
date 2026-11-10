import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useIsPlatformAdmin } from '@/admin/useIsPlatformAdmin';
import { LoadingScreen } from '@/auth/guards';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { CheckIcon } from '@/components/icons';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { ENABLED_SPORTS, SPORTS } from '@/sports/definitions';
import { type SportKey } from '@/sports/types';
import { useActiveMemberships, useCreateTeam } from '../api';

export function CreateTeamPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = useIsPlatformAdmin();
  const memberships = useActiveMemberships(user?.id);
  const create = useCreateTeam();
  const [name, setName] = useState('');
  const [sport, setSport] = useState<SportKey>('soccer');
  const [error, setError] = useState('');
  const S = SPORTS[sport];
  const hasTeams = (memberships.data?.length ?? 0) > 0;

  if (isAdmin === undefined) return <LoadingScreen />;
  // Team creation is platform-admin only (D48); everyone else gets their team from an invite.
  if (!isAdmin) return <Navigate to={hasTeams ? '/settings' : '/welcome'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 1) return setError('Give your team a name.');
    try {
      const teamId = await create.mutateAsync({ name, sport });
      try {
        localStorage.setItem('mm-last-team', teamId);
      } catch {
        /* ignore */
      }
      toast(`${S.emoji} ${name.trim()} created`);
      navigate('/field', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Page
      title="Create a team"
      sub="You'll be its coach and owner to start; hand it to the coach from the admin console. Parents join with the invite link."
      back={hasTeams ? { to: '/settings', label: 'Settings' } : { to: '/welcome', label: 'Back' }}
    >
      <form onSubmit={submit} noValidate>
        <Section>Team name</Section>
        <Group>
          <div className="prow">
            <input
              className="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Team name"
              maxLength={40}
              autoComplete="off"
              enterKeyHint="done"
              aria-label="Team name"
              data-autofocus=""
            />
          </div>
        </Group>
        <Section>Sport</Section>
        <Group>
          {ENABLED_SPORTS.map((k) => {
            const sp = SPORTS[k];
            return (
              <Row
                key={k}
                icon={sp.emoji}
                label={sp.name}
                detail={`${sp.defaultSize} ${sp.unit}${sp.hasGK ? ' incl. goalie' : ''} · ${sp.defaultPeriods} ${sp.periodName(sp.defaultPeriods).toLowerCase()}s`}
                onClick={() => setSport(k)}
                aria-label={`${sp.name}${k === sport ? ', selected' : ''}`}
              >
                {k === sport && (
                  <span className="check" aria-hidden="true">
                    <CheckIcon />
                  </span>
                )}
              </Row>
            );
          })}
        </Group>
        <Footer>
          Defaults for {S.name.toLowerCase()}: {S.defaultSize} {S.unit}
          {S.hasGK ? ' including the goalkeeper' : ''}, {S.defaultPeriods}{' '}
          {S.periodName(S.defaultPeriods).toLowerCase()}s. You can change these in Settings.
        </Footer>
        {error && (
          <p className="form-error" role="alert" style={{ margin: '12px 16px 0' }}>
            {error}
          </p>
        )}
        <div className="toolbar" style={{ marginTop: 18 }}>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create team'}
          </Button>
        </div>
      </form>
    </Page>
  );
}
