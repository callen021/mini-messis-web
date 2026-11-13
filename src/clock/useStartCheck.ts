import { useNavigate } from 'react-router';
import { useActionSheet } from '@/components/Sheet';
import { useCurrentPlan, useFormations } from '@/lineups/api';
import { toEnginePeriods } from '@/lineups/convert';
import { useRsvps } from '@/rsvp/api';
import { outSplit, repliesFor } from '@/rsvp/rsvp';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { hasIssues, startIssues, startWarning } from './startCheck';

/**
 * Before a clock game starts, from any page (D109): warn about open spots and placed players
 * marked out for that game, with "Fix lineup" (goes to the Field) and "Start anyway". Resolves
 * true when the game may start. Period mode never warns.
 */
export function useStartCheck(teamId: string) {
  const { team } = useCurrentTeam();
  const sheet = useActionSheet();
  const navigate = useNavigate();
  const plan = useCurrentPlan(teamId);
  const { formationFor } = useFormations();
  const players = usePlayers(teamId);
  const rsvps = useRsvps(teamId);

  return async (gameId: string | null): Promise<boolean> => {
    if (team.time_mode !== 'clock') return true;
    const starters = toEnginePeriods(plan.periods)[0];
    if (!starters) return true;
    const replies = repliesFor(rsvps.data ?? [], gameId ? { kind: 'game', id: gameId } : null);
    const split = outSplit(replies);
    const issues = startIssues(
      formationFor(starters.formation),
      starters.slots,
      players.data ?? [],
      split.out,
      split.byParent,
    );
    if (!hasIssues(issues)) return true;
    const choice = await sheet<'fix' | 'start'>({
      title: 'Check the lineup',
      message: `${startWarning(issues)} The clock starts with the game.`,
      actions: [
        { label: 'Fix lineup', value: 'fix' },
        { label: 'Start anyway', value: 'start' },
      ],
    });
    if (choice === 'fix') void navigate('/field');
    return choice === 'start';
  };
}
