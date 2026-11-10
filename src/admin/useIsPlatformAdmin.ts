import { useAuth } from '@/auth/AuthProvider';
import { useProfile } from '@/teams/api';

/** Is the signed-in user a platform admin? Undefined while the profile loads. */
export function useIsPlatformAdmin(): boolean | undefined {
  const { user } = useAuth();
  const profile = useProfile(user?.id);
  if (!user) return false;
  if (profile.isPending) return undefined;
  return profile.data?.is_platform_admin ?? false;
}
