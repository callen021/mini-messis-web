import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/Button';
import { Field, TextInput } from '@/components/Form';
import { Footer, Group } from '@/components/List';
import { Page } from '@/components/Page';
import { appUrl, supabase } from '@/lib/supabase';

export function SignUpPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
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
      options: { data: { display_name: name.trim() }, emailRedirectTo: appUrl('/verify') },
    });
    setBusy(false);
    if (err) return setError(err.message);
    // With email confirmation on there is no session yet; with it off we are signed in already.
    if (data.session) navigate('/', { replace: true });
    else navigate('/verify', { replace: true, state: { email: email.trim() } });
  };

  return (
    <Page title="Create account" sub="Coaches create a team; parents join with a code from the coach">
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
        We&apos;ll email you a link to verify your address. Already have an account?{' '}
        <Link to="/signin">Sign in</Link>
      </Footer>
    </Page>
  );
}
