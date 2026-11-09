import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { Switch } from '@/components/Switch';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { SPORTS } from '@/sports/definitions';
import { isCompleteCode, normalizeCode } from '@/lib/join-code';
import { type JoinPreview, lookupJoinCode, useActiveMemberships, useRequestJoin } from '../api';

export function JoinPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const memberships = useActiveMemberships(user?.id);
  const request = useRequestJoin();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [looking, setLooking] = useState(false);
  const [role, setRole] = useState<'parent' | 'assistant'>('parent');
  const [children, setChildren] = useState<Set<string>>(new Set());
  const [unlisted, setUnlisted] = useState('');
  const [error, setError] = useState('');
  const hasTeams = (memberships.data?.length ?? 0) > 0;

  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isCompleteCode(code)) return setError('Codes are 8 letters and numbers.');
    setLooking(true);
    try {
      const p = await lookupJoinCode(code);
      if (!p) setError('That code didn’t match a team. Check it with the coach.');
      else setPreview(p);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLooking(false);
    }
  };

  const toggleChild = (id: string, on: boolean) =>
    setChildren((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const submit = async () => {
    if (!preview) return;
    setError('');
    if (role === 'parent' && children.size === 0 && !unlisted.trim()) {
      return setError('Pick your child from the roster, or type their name if they aren’t listed.');
    }
    try {
      const r = await request.mutateAsync({
        code,
        role,
        playerIds: role === 'parent' ? [...children] : [],
        unlistedChildName: role === 'parent' ? unlisted.trim() : '',
      });
      if (r.status === 'active') {
        toast(`You're already on ${r.name}`);
        navigate('/', { replace: true });
      } else {
        navigate('/pending', { replace: true, state: { teamName: r.name } });
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (!preview) {
    return (
      <Page
        title="Join a team"
        sub="Enter the 8-character code from your coach"
        back={hasTeams ? { to: '/settings', label: 'Settings' } : { to: '/welcome', label: 'Back' }}
      >
        <Group>
          <form className="form" onSubmit={lookup} noValidate>
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
              data-autofocus=""
            />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={looking || !isCompleteCode(code)}>
              {looking ? 'Looking…' : 'Find team'}
            </Button>
          </form>
        </Group>
        <Footer>
          Codes never use the letters I, L, O or U, or the digits 0 and 1, so there’s nothing to mix up.
        </Footer>
      </Page>
    );
  }

  const S = SPORTS[preview.sport];
  return (
    <Page title={`${S.emoji} ${preview.name}`} sub={`${S.name} · join as a parent or an assistant coach`}>
      <Section>I am</Section>
      <Group>
        <div style={{ padding: '10px 16px' }}>
          <Segmented<'parent' | 'assistant'>
            label="Role"
            value={role}
            onChange={setRole}
            options={[
              { value: 'parent', label: 'A parent' },
              { value: 'assistant', label: 'An assistant coach' },
            ]}
          />
        </div>
      </Group>
      {role === 'parent' && (
        <>
          <Section>My child</Section>
          <Group>
            {preview.players.map((p) => (
              <Row
                key={p.id}
                label={p.first_name}
                detail={p.jersey_number ? `#${p.jersey_number}` : undefined}
              >
                <Switch
                  label={`${p.first_name} is my child`}
                  size="md"
                  checked={children.has(p.id)}
                  onChange={(on) => toggleChild(p.id, on)}
                />
              </Row>
            ))}
            {preview.players.length === 0 && (
              <Row label="The roster is empty so far" detail="Type your child's name below" />
            )}
            <div className="prow">
              <input
                className="name"
                value={unlisted}
                onChange={(e) => setUnlisted(e.target.value)}
                placeholder="My child isn't listed — their name"
                maxLength={60}
                aria-label="Unlisted child's name"
              />
            </div>
          </Group>
          <Footer>You can pick more than one. The coach confirms the link before you see anything.</Footer>
        </>
      )}
      {error && (
        <p className="form-error" role="alert" style={{ margin: '12px 16px 0' }}>
          {error}
        </p>
      )}
      <div className="toolbar" style={{ marginTop: 18 }}>
        <Button onClick={submit} disabled={request.isPending}>
          {request.isPending ? 'Sending…' : 'Request to join'}
        </Button>
        <Button variant="gray" onClick={() => setPreview(null)}>
          Change code
        </Button>
      </div>
    </Page>
  );
}
