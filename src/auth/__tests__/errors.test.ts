import { describe, expect, it } from 'vitest';
import { authErrorMessage } from '../errors';

describe('authErrorMessage', () => {
  it('turns "Signups not allowed for otp" into a missing-account message with a sign-up action', () => {
    const r = authErrorMessage({ message: 'Signups not allowed for otp', code: 'otp_disabled', status: 422 });
    expect(r.message).toBe('We couldn’t find an account for that email.');
    expect(r.action).toBe('signup');
  });

  it('explains a wrong password without saying which half is wrong, and offers a reset', () => {
    const r = authErrorMessage({
      message: 'Invalid login credentials',
      code: 'invalid_credentials',
      status: 400,
    });
    expect(r.message).toMatch(/don’t match/);
    expect(r.action).toBe('reset');
  });

  it('maps rate limits by status, code or wording', () => {
    expect(authErrorMessage({ message: 'Email rate limit exceeded', status: 429 }).message).toMatch(
      /Too many/,
    );
    expect(authErrorMessage({ message: 'x', code: 'over_request_rate_limit' }).message).toMatch(/Too many/);
    expect(
      authErrorMessage({ message: 'For security purposes, you can only request this after 42 seconds.' })
        .message,
    ).toMatch(/Too many/);
  });

  it('maps duplicate accounts, unconfirmed emails, weak passwords and network failures', () => {
    expect(authErrorMessage({ message: 'User already registered', code: 'user_already_exists' })).toEqual({
      message: 'There’s already an account with that email.',
      action: 'signin',
    });
    expect(authErrorMessage({ message: 'Email not confirmed' }).message).toMatch(/hasn’t been confirmed/);
    expect(authErrorMessage({ message: 'Password should be at least 8 characters' }).message).toMatch(
      /stronger password/,
    );
    expect(authErrorMessage(new TypeError('Failed to fetch')).message).toMatch(/reach the server/);
  });

  it('falls back to the raw message, then to a generic one', () => {
    expect(authErrorMessage({ message: 'Something odd' }).message).toBe('Something odd');
    expect(authErrorMessage(null).message).toBe('Something went wrong. Please try again.');
  });
});
