import { describe, expect, it } from 'vitest';
import { claimsByPlayer, familyLabel, snackCapOf, snackMarkLabel, snackWanted } from '../snacks';

describe('snack signup helpers (D115)', () => {
  it('the setting decides which events take a family', () => {
    expect(snackWanted('off', 'game')).toBe(false);
    expect(snackWanted('games', 'game')).toBe(true);
    expect(snackWanted('games', 'practice')).toBe(false);
    expect(snackWanted('both', 'practice')).toBe(true);
    expect(snackWanted(undefined, 'game')).toBe(false);
  });

  it('a slot belongs to a family, named by the player, so either parent sees it', () => {
    expect(familyLabel('Nolan')).toBe('Nolan’s family');
  });

  it('the cap is eligible events over active players, rounded up, never dividing by zero', () => {
    expect(snackCapOf(3, 2)).toBe(2);
    expect(snackCapOf(10, 10)).toBe(1);
    expect(snackCapOf(0, 5)).toBe(0);
    expect(snackCapOf(4, 0)).toBe(4);
  });

  it('counts the slots each family holds', () => {
    const claims = claimsByPlayer([
      { snack_player_id: 'a', snack_flagged: false },
      { snack_player_id: null, snack_flagged: false },
      { snack_player_id: 'a', snack_flagged: true },
      { snack_player_id: 'b', snack_flagged: false },
    ]);
    expect(claims.get('a')).toBe(2);
    expect(claims.get('b')).toBe(1);
    expect(claims.get('c')).toBeUndefined();
  });

  it('the schedule icon says open, taken by whom, or that the family cannot make it', () => {
    const nameOf = (id: string) => (id === 'a' ? 'Nolan' : undefined);
    expect(snackMarkLabel({ snack_player_id: null, snack_flagged: false }, nameOf)).toEqual({
      state: 'open',
      label: 'Snacks: open',
    });
    expect(snackMarkLabel({ snack_player_id: 'a', snack_flagged: false }, nameOf)).toEqual({
      state: 'taken',
      label: 'Snacks: Nolan’s family',
    });
    expect(snackMarkLabel({ snack_player_id: 'a', snack_flagged: true }, nameOf)).toEqual({
      state: 'flagged',
      label: 'Snacks: Nolan’s family, who can’t make it',
    });
    expect(snackMarkLabel({ snack_player_id: 'zz', snack_flagged: false }, nameOf).label).toBe(
      'Snacks: a family',
    );
  });
});
