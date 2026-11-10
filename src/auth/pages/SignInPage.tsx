import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/Button';
import { Field, TextInput } from '@/components/Form';
import { Footer, Group } from '@/components/List';
import { Page } from '@/components/Page';
import { useToast } from '@/components/Toast';
import { appUrl, supabase } from '@/lib/supabase';
import { authErrorMessage, type FriendlyAuthError } from '../errors';

export function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const state = location.state as { from?: string; email?: string } | null;
  const from = state?.from ?? '/';
  const [email, setEmail] = useState(state?.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'magic' | null>(null);
  const [error, setError] = useState<FriendlyAuthError | null>(null);

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy('password');
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(null);
    if (err) {
      setError(authErrorMessage(err));
      return;
    }
    navigate(from, { replace: true });
  };

  const magicLink = async () => {
    setError(null);
    if (!email.trim()) {
      setError({ message: 'Enter your email to get a magic link.' });
      return;
    }
    setBusy('magic');
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: appUrl('/'), shouldCreateUser: false },
    });
    setBusy(null);
    if (err) {
      setError(authErrorMessage(err));
      return;
    }
    toast('Magic link sent · check your email');
  };

  const createAccount = () => navigate('/signup', { state: { email: email.trim(), from } });

  return (
    <Page title="Sign in" sub="Lineups, playing time and scores for your team">
      <Group>
        <form className="form" onSubmit={signIn} noValidate>
          <Field label="Email">
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              required
              data-autofocus=""
            />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          {error && (
            <p className="form-error" role="alert">
              {error.message}
              {error.action === 'reset' && (
                <>
                  {' '}
                  <Link to="/reset" state={{ email: email.trim() }}>
                    Reset password
                  </Link>
                </>
              )}
            </p>
          )}
          {error?.action === 'signup' && (
            <Button type="button" variant="tinted" onClick={createAccount}>
              Create an account for {email.trim() || 'this email'}
            </Button>
          )}
          <Button type="submit" disabled={busy !== null}>
            {busy === 'password' ? 'Signing in…' : 'Sign in'}
          </Button>
          <Button variant="tinted" onClick={magicLink} disabled={busy !== null}>
            {busy === 'magic' ? 'Sending…' : 'Email me a magic link'}
          </Button>
          <Button variant="gray" onClick={createAccount} disabled={busy !== null}>
            Create an account
          </Button>
        </form>
      </Group>
      <Footer>
        <Link to="/reset" state={{ email: email.trim() }}>
          Forgot your password?
        </Link>
        <br />
        Parents: the coach’s invite link creates your account and joins the team in one step.
      </Footer>
    </Page>
  );
}
