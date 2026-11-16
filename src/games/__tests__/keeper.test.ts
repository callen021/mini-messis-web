import { describe, expect, it } from 'vitest';
import { canKeepStats, canLogGame, keeperText } from '../keeper';

const live = (keeper: string | null, name = 'Coach Cam') =>
  ({ status: 'live', keeper_user_id: keeper, keeper_name: name }) as const;
const done = { status: 'done', keeper_user_id: 'u-coach', keeper_name: 'Coach Cam' } as const;
const coach = { userId: 'u-coach', isStaff: true, statKeeper: false };
const assistant = { userId: 'u-asst', isStaff: true, statKeeper: false };
const keeper = { userId: 'u-parent', isStaff: false, statKeeper: true };
const parent = { userId: 'u-other', isStaff: false, statKeeper: false };

describe('one active stat keeper (D120)', () => {
  it('while the game is live only the active keeper logs, whoever they are', () => {
    expect(canLogGame(live('u-coach'), coach)).toBe(true);
    expect(canLogGame(live('u-coach'), assistant)).toBe(false);
    expect(canLogGame(live('u-coach'), keeper)).toBe(false);
    expect(canLogGame(live('u-parent'), keeper)).toBe(true);
    expect(canLogGame(live('u-parent'), coach)).toBe(false);
    expect(canLogGame(live('u-parent'), parent)).toBe(false);
  });

  it('a live game nobody keeps falls to the staff; a finished or missing game is the staff’s', () => {
    expect(canLogGame(live(null), coach)).toBe(true);
    expect(canLogGame(live(null), keeper)).toBe(false);
    expect(canLogGame(done, coach)).toBe(true);
    expect(canLogGame(done, keeper)).toBe(false);
    expect(canLogGame(null, coach)).toBe(true);
    expect(canLogGame(null, parent)).toBe(false);
  });

  it('Keep stats is offered to staff and granted keepers who are not keeping them right now', () => {
    expect(canKeepStats(live('u-coach'), coach)).toBe(false);
    expect(canKeepStats(live('u-coach'), assistant)).toBe(true);
    expect(canKeepStats(live('u-coach'), keeper)).toBe(true);
    expect(canKeepStats(live('u-parent'), coach)).toBe(true);
    expect(canKeepStats(live('u-parent'), parent)).toBe(false);
    expect(canKeepStats(done, keeper)).toBe(false);
    expect(canKeepStats(null, coach)).toBe(false);
  });

  it('the bar names the keeper, says "You" to them, and is silent without a live game', () => {
    expect(keeperText(live('u-coach'), 'u-coach')).toBe('You keep the stats');
    expect(keeperText(live('u-coach'), 'u-parent')).toBe('Coach Cam keeps the stats');
    expect(keeperText(live('u-coach', ''), 'u-parent')).toBe('Someone else keeps the stats');
    expect(keeperText(live(null), 'u-coach')).toBeNull();
    expect(keeperText(done, 'u-coach')).toBeNull();
    expect(keeperText(null, 'u-coach')).toBeNull();
  });
});
