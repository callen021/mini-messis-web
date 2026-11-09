import { type Session, type User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export interface AuthState {
  session: Session | null;
  user: User | null;
  /** True until the persisted session has been read once. */
  loading: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

/** Tracks the Supabase session and clears cached server data on sign-out. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setLoading(false);
      if (event === 'SIGNED_OUT') queryClient.clear();
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({ session, user: session?.user ?? null, loading }),
    [session, loading],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Route element: hosts the provider for everything that needs a session. */
export function AuthRoot() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

function SetupNotice() {
  return (
    <main className="app-main">
      <Page title="Almost ready" sub="Supabase isn't configured for this build yet.">
        <Section>What to do</Section>
        <Group>
          <Row
            label="Copy .env.example to .env.local"
            detail="Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
          />
          <Row label="Restart the dev server" detail="Vite reads env files on start" />
        </Group>
        <Footer>Only the anon key belongs in the client. See docs/SETUP.md.</Footer>
      </Page>
    </main>
  );
}
