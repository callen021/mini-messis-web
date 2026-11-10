/**
 * Plain-language versions of Supabase Auth errors. The raw messages ("Signups not allowed for
 * otp", "Invalid login credentials") mean nothing to a parent on a phone; each one maps to a
 * sentence and, where it helps, a follow-up action the screen can offer.
 */

export type AuthErrorAction = 'signup' | 'signin' | 'reset';

export interface FriendlyAuthError {
  message: string;
  /** A button the screen can show next to the message. */
  action?: AuthErrorAction;
}

interface ErrorLike {
  message?: unknown;
  code?: unknown;
  status?: unknown;
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Map a Supabase Auth error (or anything thrown) to a message a parent understands. */
export function authErrorMessage(err: unknown): FriendlyAuthError {
  const e = (err ?? {}) as ErrorLike;
  const code = text(e.code).toLowerCase();
  const msg = text(e.message);
  const status = typeof e.status === 'number' ? e.status : 0;

  // No account for that email (magic link with shouldCreateUser: false).
  if (code === 'otp_disabled' || code === 'signup_disabled' || /signups? not allowed/i.test(msg)) {
    return { message: 'We couldn’t find an account for that email.', action: 'signup' };
  }
  if (code === 'user_not_found' || /user not found/i.test(msg)) {
    return { message: 'We couldn’t find an account for that email.', action: 'signup' };
  }
  // Wrong password (Supabase deliberately does not say which half is wrong).
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) {
    return {
      message: 'That email and password don’t match. Check them, or reset your password.',
      action: 'reset',
    };
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) {
    return {
      message: 'This email hasn’t been confirmed yet. Look for the confirmation email, then try again.',
    };
  }
  if (code === 'user_already_exists' || code === 'email_exists' || /already (registered|exists)/i.test(msg)) {
    return { message: 'There’s already an account with that email.', action: 'signin' };
  }
  if (code === 'weak_password' || /password.*(weak|at least|should contain)/i.test(msg)) {
    return { message: 'Use a stronger password: at least 8 characters.' };
  }
  if (
    status === 429 ||
    /rate[_ ]limit/i.test(code) ||
    /rate limit|too many requests|only request this after/i.test(msg)
  ) {
    return { message: 'Too many attempts. Wait a minute and try again.' };
  }
  if (/failed to fetch|load failed|networkerror/i.test(msg)) {
    return { message: 'Can’t reach the server. Check your connection and try again.' };
  }
  if (/invalid email|unable to validate email/i.test(msg)) {
    return { message: 'That doesn’t look like an email address.' };
  }
  return { message: msg || 'Something went wrong. Please try again.' };
}
