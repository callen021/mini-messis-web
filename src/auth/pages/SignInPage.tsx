import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/Button';
import { Field, TextInput } from '@/components/Form';
import { Footer, Group } from '@/components/List';
import { Page } from '@/components/Page';
import { useToast } from '@/components/Toast';
import { appUrl, errorMessage, supabase } from '@/lib/supabase';

export function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'magic' | null>(null);
  const [error, setError] = useState('');

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy('password');
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(null);
    if (err) {
      setError(
        /confirm/i.test(err.message)
          ? 'Please verify your email first — check your inbox for the link.'
          : err.message,
      );
      return;
    }
    navigate(from, { replace: true });
  };

  const magicLink = async () => {
    setError('');
    if (!email.trim()) {
      setError('Enter your email to get a magic link.');
      return;
    }
    setBusy('magic');
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: appUrl('/'), shouldCreateUser: false },
    });
    setBusy(null);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    toast('Magic link sent · check your email');
  };

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
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy !== null}>
            {busy === 'password' ? 'Signing in…' : 'Sign in'}
          </Button>
          <Button variant="tinted" onClick={magicLink} disabled={busy !== null}>
            {busy === 'magic' ? 'Sending…' : 'Email me a magic link'}
          </Button>
        </form>
      </Group>
      <Footer>
        <Link to="/reset">Forgot your password?</Link>
        <br />
        New here? <Link to="/signup">Create an account</Link>
      </Footer>
    </Page>
  );
}
