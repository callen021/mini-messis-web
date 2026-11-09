import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { Button } from '@/components/Button';
import { Footer, Group, Row } from '@/components/List';
import { Page } from '@/components/Page';
import { useToast } from '@/components/Toast';
import { appUrl, errorMessage, supabase } from '@/lib/supabase';
import { useAuth } from '../AuthProvider';
import { LoadingScreen } from '../guards';

/** Shown after sign-up, and the landing page for the verification link (which signs the user in). */
export function VerifyPage() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const email = (location.state as { email?: string } | null)?.email ?? '';
  const [busy, setBusy] = useState(false);

  if (loading) return <LoadingScreen />;
  if (session) return <Navigate to="/" replace />;

  const resend = async () => {
    if (!email) return;
    setBusy(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: appUrl('/verify') },
    });
    setBusy(false);
    toast(error ? errorMessage(error) : 'Verification email sent again');
  };

  return (
    <Page
      title="Check your email"
      sub={email ? `We sent a verification link to ${email}` : 'We sent you a verification link'}
    >
      <Group>
        <Row label="Open the link on this device" detail="It signs you in and brings you back here." />
        <Row label="Didn't get it?" detail="Look in spam, or send it again." />
      </Group>
      <div className="toolbar" style={{ marginTop: 14 }}>
        {email && (
          <Button variant="tinted" onClick={resend} disabled={busy}>
            {busy ? 'Sending…' : 'Resend email'}
          </Button>
        )}
      </div>
      <Footer>
        Coaches can only approve you after your email is verified. <Link to="/signin">Back to sign in</Link>
      </Footer>
    </Page>
  );
}
