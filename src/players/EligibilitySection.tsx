import { Footer, Group, Section } from '@/components/List';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/supabase';
import { SPORTS } from '@/sports/definitions';
import { type SportKey } from '@/sports/types';
import { useEligibility, useSetEligibility } from './api';
import { NO_ELIGIBILITY, prefLevel } from './eligibility';

/**
 * Eligible positions on a player's card (D117), coaches and assistants only: one chip per position
 * group, on for "can play" (the default), off for "never". Preferred is stored but not offered in
 * this round. The whole roster is on the grid at /team/positions.
 */
export function EligibilitySection({
  playerId,
  playerName,
  teamId,
  sport,
}: {
  playerId: string;
  playerName: string;
  teamId: string;
  sport: SportKey;
}) {
  const S = SPORTS[sport];
  const toast = useToast();
  const elig = useEligibility(teamId);
  const set = useSetEligibility(teamId);
  const groups = S.eligibility ?? [];
  if (!groups.length) return null;
  const map = elig.data ?? NO_ELIGIBILITY;
  return (
    <>
      <Section>Positions</Section>
      <Group className="allergies">
        <div className="achips" role="group" aria-label={`${playerName}’s positions`}>
          {groups.map(([key, label]) => {
            const can = prefLevel(map, playerId, key) !== 'never';
            return (
              <button
                key={key}
                type="button"
                className={cn('achip', can && 'on')}
                aria-pressed={can}
                aria-label={`${label}: ${can ? 'can play' : 'never'}`}
                disabled={elig.isPending}
                onClick={() =>
                  set.mutate(
                    { playerId, group: key, level: can ? 'never' : 'can' },
                    { onError: (e) => toast(errorMessage(e)) },
                  )
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </Group>
      <Footer>
        Auto-fill never puts {playerName} in a position that is switched off here; you can still place them
        anywhere by hand. Only coaches see this.
      </Footer>
    </>
  );
}
