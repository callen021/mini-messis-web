import { Footer, Group, Row, Section } from '@/components/List';
import { errorMessage } from '@/lib/supabase';
import { useStreak } from './api';
import { days } from './streak';

/**
 * At-home training as a coach sees it on a player's page (D133): the child's current and longest
 * streak, read only. Coaches and assistant coaches only; parents have the Training page. Home
 * skill test results are on the Skills screens, labelled Home.
 */
export function CoachTraining({ playerId, playerName }: { playerId: string; playerName: string }) {
  const streak = useStreak(playerId);
  return (
    <>
      <Section>At-home training</Section>
      <Group>
        {streak.isError ? (
          <Row label={errorMessage(streak.error)} />
        ) : (
          <Row
            icon="🔥"
            label={
              streak.isPending
                ? 'Streak'
                : `Streak: ${days(streak.data.current)}${streak.data.todayCounts ? ' · today counts' : ''}`
            }
            detail={streak.isPending ? 'Loading…' : `Longest: ${days(streak.data.longest)}`}
          />
        )}
      </Group>
      <Footer>
        {playerName}’s streak counts days with a home drill, playing time in a game, or a practice a parent
        marked “We went”. Results a parent records at home are under Skills, labelled Home.
      </Footer>
    </>
  );
}
