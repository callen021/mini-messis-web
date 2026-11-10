import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/Button';
import { Field, TextInput } from '@/components/Form';
import { Footer, Group } from '@/components/List';
import { Page } from '@/components/Page';
import { supabase } from '@/lib/supabase';
import { authErrorMessage } from '../errors';

/**
 * Plain sign-up (parents normally arrive through the coach's invite link instead, D49). Email
 * confirmation is off for this app, so a new account is signed in straight away; if the project
 * still has confirmation on, the form says so instead of sending people to a "check your email" page.
 */
export function SignUpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { email?: string; from?: string } | null;
  const [name, setName] = useState('');
  const [email, setEmail] = useState(state?.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2) return setError('Tell us your name so coaches recognise you.');
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    setBusy(true);
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() } },
    });
    setBusy(false);
    if (err) return setError(authErrorMessage(err).message);
    if (data.session) {
      navigate(state?.from ?? '/', { replace: true });
      return;
    }
    setError(
      'Your account was created, but this app still asks for an email confirmation. Confirm the email we just sent, then sign in.',
    );
  };

  return (
    <Page title="Create account" sub="Parents join with the coach's invite link or code">
      <Group>
        <form className="form" onSubmit={submit} noValidate>
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
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </Button>
        </form>
      </Group>
      <Footer>
        Already have an account?{' '}
        <Link to="/signin" state={{ email: email.trim(), from: state?.from }}>
          Sign in
        </Link>
      </Footer>
    </Page>
  );
}
