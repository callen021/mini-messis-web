import { useEffect, useRef } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useUIStore } from '@/lib/ui-store';
import { useProfile, useUpdateProfile } from '@/teams/api';

/**
 * Two-way sync between the device-local UI store and the profile row:
 * - when the profile loads, its theme/field view win (so a new device matches the account)
 * - afterwards, local changes are written back
 */
export function ProfileSync() {
  const { user } = useAuth();
  const profile = useProfile(user?.id);
  const update = useUpdateProfile(user?.id);
  const theme = useUIStore((s) => s.theme);
  const fieldView = useUIStore((s) => s.fieldView);
  const setTheme = useUIStore((s) => s.setTheme);
  const setFieldView = useUIStore((s) => s.setFieldView);
  const applied = useRef<string | null>(null);

  useEffect(() => {
    if (!profile.data || applied.current === profile.data.id) return;
    applied.current = profile.data.id;
    setTheme(profile.data.theme);
    setFieldView(profile.data.field_view);
  }, [profile.data, setTheme, setFieldView]);

  useEffect(() => {
    const p = profile.data;
    if (!p || applied.current !== p.id) return;
    if (p.theme === theme && p.field_view === fieldView) return;
    const t = window.setTimeout(() => update.mutate({ theme, field_view: fieldView }), 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `update` is a stable mutation handle
  }, [theme, fieldView, profile.data]);

  return null;
}
