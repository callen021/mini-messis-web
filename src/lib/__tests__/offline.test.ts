import { describe, expect, it } from 'vitest';
import { MUTATION_RETRIES, isNetworkError, mutationRetryDelay, shouldRetryMutation } from '../offline';
import { makeQueryClient } from '../query-client';

describe('offline policy', () => {
  it('recognises fetch-level failures from supabase-js and the browsers, not server refusals', () => {
    expect(isNetworkError(new Error('TypeError: Failed to fetch'))).toBe(true);
    expect(isNetworkError({ message: 'fetch failed' })).toBe(true);
    expect(isNetworkError(new Error('NetworkError when attempting to fetch resource.'))).toBe(true);
    expect(isNetworkError(new Error('Load failed'))).toBe(true);
    expect(isNetworkError(new Error('only a coach can rename the team'))).toBe(false);
    expect(isNetworkError(new Error('new row violates row-level security policy'))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });

  it('retries network errors a few times with capped backoff and never retries anything else', () => {
    const net = new Error('Failed to fetch');
    expect(shouldRetryMutation(0, net)).toBe(true);
    expect(shouldRetryMutation(MUTATION_RETRIES - 1, net)).toBe(true);
    expect(shouldRetryMutation(MUTATION_RETRIES, net)).toBe(false);
    expect(shouldRetryMutation(0, new Error('42501'))).toBe(false);
    expect(mutationRetryDelay(0)).toBe(1000);
    expect(mutationRetryDelay(2)).toBe(4000);
    expect(mutationRetryDelay(10)).toBe(15_000);
  });

  it('the query client pauses mutations offline and uses the retry policy', () => {
    const qc = makeQueryClient();
    const m = qc.getDefaultOptions().mutations;
    expect(m?.networkMode).toBe('online');
    expect(m?.retry).toBe(shouldRetryMutation);
    expect(m?.retryDelay).toBe(mutationRetryDelay);
  });
});
