import { afterEach, describe, expect, it, vi } from 'vitest';
import { inviteMessage, inviteUrl, shareInvite } from '../invite';

describe('invite links', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // @ts-expect-error test cleanup
    delete navigator.share;
  });

  it('builds the link under the deployment base', () => {
    expect(inviteUrl('ABCD2345')).toBe(`${window.location.origin}/join/ABCD2345`);
  });

  it('writes a message with the team name and the link', () => {
    const m = inviteMessage('Strikers', 'https://x.test/join/ABCD2345');
    expect(m).toContain('Join Strikers');
    expect(m).toContain('https://x.test/join/ABCD2345');
    expect(m).toContain('pick your child');
  });

  it('shares through the system sheet when there is one, else reports unsupported', async () => {
    expect(await shareInvite('Strikers', 'https://x.test/join/ABCD2345')).toBe('unsupported');
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    expect(await shareInvite('Strikers', 'https://x.test/join/ABCD2345')).toBe('shared');
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Join Strikers', url: 'https://x.test/join/ABCD2345' }),
    );
    share.mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'));
    expect(await shareInvite('Strikers', 'https://x.test/join/ABCD2345')).toBe('cancelled');
  });
});
