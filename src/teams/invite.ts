/** Invite-link helpers (D49). Pure except for `appUrl`, which reads the deployment base. */
import { appUrl } from '@/lib/supabase';

/** The shareable link for a join code: `<origin><base>/join/<CODE>`. */
export function inviteUrl(code: string): string {
  return appUrl(`/join/${code}`);
}

/** The message behind the Share button: what a parent needs to know in two lines. */
export function inviteMessage(teamName: string, url: string): string {
  return `Join ${teamName} on Mini-Messi's — lineups, playing time and scores for the team. Open ${url}, create your account and pick your child from the roster.`;
}

/** Share through the system sheet when the browser has one; otherwise tell the caller to copy. */
export async function shareInvite(
  teamName: string,
  url: string,
): Promise<'shared' | 'unsupported' | 'cancelled'> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'unsupported';
  try {
    await navigator.share({ title: `Join ${teamName}`, text: inviteMessage(teamName, url), url });
    return 'shared';
  } catch {
    return 'cancelled';
  }
}
