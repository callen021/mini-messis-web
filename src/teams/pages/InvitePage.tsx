import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { authErrorMessage } from '@/auth/errors';
import { LoadingScreen } from '@/auth/guards';
import { Button } from '@/components/Button';
import { Field, TextInput } from '@/components/Form';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { Switch } from '@/components/Switch';
import { useToast } from '@/components/Toast';
import { normalizeCode } from '@/lib/join-code';
import { normalizePhone } from '@/lib/phone';
import { errorMessage, supabase } from '@/lib/supabase';
import { SPORTS } from '@/sports/definitions';
import { lookupInvite, useRequestJoin } from '../api';

/**
 * /join/<code>: the coach's invite link (D49). One screen: the team, then — for a visitor — name,
 * email and password, then the child picker. Submitting creates the account, signs in and files
 * the join request in one go. A signed-in user skips straight to the child picker.
 */
export function InvitePage() {
  const { code: raw = '' } = useParams<{ code: string }>();
  const code = normalizeCode(raw);
  const { session, loading } = useAuth();
  const invite = useQuery({
    queryKey: ['invite', code, session?.user.id ?? 'anon'],
    queryFn: () => lookupInvite(code),
    enabled: !loading,
    retry: false,
    staleTime: 60_000,
  });

  if (loading || invite.isPending) return <LoadingScreen label="Opening your invite…" />;
  if (invite.isError) {
    return (
      <Page title="Invite" sub="Couldn’t open this invite">
        <Group>
          <Row label={errorMessage(invite.error)} />
        </Group>
        <Footer>
          <Link to="/signin">Sign in</Link>
        </Footer>
      </Page>
    );
  }
  const preview = invite.data;
  if (!preview) {
    return (
      <Page title="Invite" sub="This link doesn’t match a team">
        <Group>
          <Row
            label="Check the link with your coach"
            detail="Codes are 8 letters and numbers; a replaced link stops working."
          />
        </Group>
        <Footer>
          <Link to={session ? '/' : '/signin'}>{session ? 'Back to the app' : 'Sign in'}</Link>
        </Footer>
      </Page>
    );
  }
  return <InviteForm code={code} preview={preview} signedIn={!!session} />;
}

type Preview = NonNullable<Awaited<ReturnType<typeof lookupInvite>>>;

function InviteForm({ code, preview, signedIn }: { code: string; preview: Preview; signedIn: boolean }) {
  const navigate = useNavigate();
  const toast = useToast();
  const request = useRequestJoin();
  const S = SPORTS[preview.sport];
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [children, setChildren] = useState<Set<string>>(() => new Set());
  const [unlisted, setUnlisted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; action?: 'signin' } | null>(null);

  const toggleChild = (id: string, on: boolean) =>
    setChildren((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const off = !preview.join_enabled;
  const already = preview.membership === 'active';
  const toSignIn = () => navigate('/signin', { state: { email: email.trim(), from: `/join/${code}` } });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (children.size === 0 && !unlisted.trim()) {
      setError({ message: 'Pick your child from the roster, or type their name if they aren’t listed.' });
      return;
    }
    setBusy(true);
    try {
      if (!signedIn) {
        if (name.trim().length < 2) throw new Error('Tell us your name so the coach recognises you.');
        if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() } },
        });
        if (err) {
          const friendly = authErrorMessage(err);
          setError({
            message: friendly.message,
            action: friendly.action === 'signin' ? 'signin' : undefined,
          });
          return;
        }
        if (!data.session) {
          // Email confirmation is still switched on for this project (docs/LAUNCH.md step 5).
          setError({
            message:
              'Your account was created, but this app still asks for an email confirmation. Confirm the email we just sent, then open this link again to finish joining.',
          });
          return;
        }
      }
      if (phone.trim() && !normalizePhone(phone)) throw new Error('That doesn’t look like a phone number.');
      const r = await request.mutateAsync({
        code,
        playerIds: [...children],
        unlistedChildName: unlisted.trim(),
        phone: normalizePhone(phone),
      });
      if (r.status === 'active') {
        toast(preview.membership === 'active' ? `You're already on ${r.name}` : `Welcome to ${r.name}`);
        navigate('/', { replace: true });
      } else {
        navigate('/pending', { replace: true, state: { teamName: r.name } });
      }
    } catch (err) {
      setError({ message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  if (already) {
    return (
      <Page title={`${S.emoji} ${preview.name}`} sub="You’re already on this team">
        <Group>
          <Row to="/" label="Open the team" link chevron />
        </Group>
      </Page>
    );
  }
  if (off) {
    return (
      <Page title={`${S.emoji} ${preview.name}`} sub="This invite has been turned off">
        <Group>
          <Row
            label="Ask the coach for a new link"
            detail="They can turn it back on or replace it from Settings → Members."
          />
        </Group>
        <Footer>
          <Link to={signedIn ? '/' : '/signin'}>{signedIn ? 'Back to the app' : 'Sign in'}</Link>
        </Footer>
      </Page>
    );
  }

  return (
    <Page
      title={`${S.emoji} ${preview.name}`}
      documentTitle={`Join ${preview.name}`}
      sub={
        signedIn
          ? `${S.name} · pick your child to ${preview.require_approval ? 'ask to join' : 'join'}`
          : `${S.name} · create your account and pick your child`
      }
    >
      <form onSubmit={submit} noValidate>
        {!signedIn && (
          <>
            <Section>Your account</Section>
            <Group>
              <div className="form">
                <Field label="Your name">
                  <TextInput
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    required
                    maxLength={60}
                    data-autofocus=""
                  />
                </Field>
                <Field label="Email">
                  <TextInput
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    inputMode="email"
                    required
                  />
                </Field>
                <Field label="Password">
                  <TextInput
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                </Field>
              </div>
            </Group>
            <Footer>
              Already have an account?{' '}
              <button type="button" className="linkbtn" onClick={toSignIn}>
                Sign in
              </button>{' '}
              and you’ll come straight back here.
            </Footer>
          </>
        )}
        <Section>My child</Section>
        <Group>
          {preview.players.map((p) => (
            <Row key={p.id} label={p.first_name} detail={p.jersey_number ? `#${p.jersey_number}` : undefined}>
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
        <Footer>
          You can pick more than one.{' '}
          {preview.require_approval
            ? 'The coach confirms the link before you see anything.'
            : 'You’ll be on the team right away; the coach confirms the link to your child afterwards.'}
        </Footer>
        <Section>Your phone (optional)</Section>
        <Group>
          <div className="form">
            <Field label="Mobile number">
              <TextInput
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                inputMode="tel"
                maxLength={40}
                placeholder="(555) 010-0001"
              />
            </Field>
          </div>
        </Group>
        <Footer>
          Saved as a contact on your child’s card when the coach confirms your link, so the coaches can reach
          you. You can turn sharing with other parents off afterwards.
        </Footer>
        {error && (
          <p className="form-error" role="alert" style={{ margin: '12px 16px 0' }}>
            {error.message}
            {error.action === 'signin' && (
              <>
                {' '}
                <button type="button" className="linkbtn" onClick={toSignIn}>
                  Sign in
                </button>
              </>
            )}
          </p>
        )}
        <div className="toolbar" style={{ marginTop: 18 }}>
          <Button type="submit" disabled={busy || request.isPending}>
            {busy || request.isPending
              ? 'Joining…'
              : signedIn
                ? preview.require_approval
                  ? 'Ask to join'
                  : 'Join team'
                : 'Create account and join'}
          </Button>
        </div>
      </form>
    </Page>
  );
}
