import { useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { useProfile, useUpdateProfile } from '@/teams/api';

export function ProfilePage() {
  const { user } = useAuth();
  const toast = useToast();
  const profile = useProfile(user?.id);
  const update = useUpdateProfile(user?.id);
  // null until the user edits; the saved name shows meanwhile (no effect needed)
  const [edited, setEdited] = useState<string | null>(null);
  const name = edited ?? profile.data?.display_name ?? '';
  const setName = setEdited;

  const save = async () => {
    const trimmed = name.trim().slice(0, 60);
    if (!trimmed || trimmed === profile.data?.display_name) return;
    try {
      await update.mutateAsync({ display_name: trimmed });
      toast('Name saved');
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  return (
    <Page title="Profile" sub={user?.email ?? ''} back={{ to: '/settings', label: 'Settings' }}>
      <Section>Display name</Section>
      <Group>
        <div className="prow">
          <input
            className="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder="Your name"
            maxLength={60}
            aria-label="Display name"
          />
        </div>
      </Group>
      <Footer>Coaches see this name on join requests and in the members list.</Footer>
      <Section>Security</Section>
      <Group>
        <Row to="/reset" label="Change password" chevron />
      </Group>
    </Page>
  );
}
