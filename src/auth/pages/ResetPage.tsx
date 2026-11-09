import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/Button';
import { Field, TextInput } from '@/components/Form';
import { Footer, Group } from '@/components/List';
import { Page } from '@/components/Page';
import { useToast } from '@/components/Toast';
import { appUrl, errorMessage, supabase } from '@/lib/supabase';
import { useAuth } from '../AuthProvider';
import { LoadingScreen } from '../guards';

/** Request a reset email when signed out; set a new password when arriving from the email link. */
export function ResetPage() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return session ? <NewPassword /> : <RequestReset />;
}

function RequestReset() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: appUrl('/reset'),
    });
    setBusy(false);
    if (err) return setError(errorMessage(err));
    setSent(true);
  };
  return (
    <Page
      title="Reset password"
      sub={sent ? 'Check your email for the reset link' : 'We’ll email you a link to choose a new password'}
    >
      {!sent && (
        <Group>
          <form className="form" onSubmit={submit} noValidate>
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
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        </Group>
      )}
      <Footer>
        <Link to="/signin">Back to sign in</Link>
      </Footer>
    </Page>
  );
}

function NewPassword() {
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Use at least 8 characters.');
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(errorMessage(err));
    toast('Password updated');
    navigate('/', { replace: true });
  };
  return (
    <Page title="New password" sub="Choose a new password for your account">
      <Group>
        <form className="form" onSubmit={submit} noValidate>
          <Field label="New password">
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              data-autofocus=""
            />
          </Field>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save password'}
          </Button>
        </form>
      </Group>
    </Page>
  );
}
