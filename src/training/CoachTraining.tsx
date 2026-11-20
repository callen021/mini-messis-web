import { Footer, Group, Row, Section } from '@/components/List';
import { errorMessage } from '@/lib/supabase';
import { useCurrentTeam } from '@/teams/TeamContext';
import { bestKey, useBests, useHomeDrills, useStreak } from './api';
import { scoreText } from './challenge';
import { days } from './streak';

/**
 * At-home training as a coach sees it on a player's page (D133): the child's current and longest
 * streak and their personal bests on the Daily Drills challenges (D140), read only. Coaches and
 * assistant coaches only; parents have the Training page. Home
 * skill test results are on the Skills screens, labelled Home.
 */
export function CoachTraining({ playerId, playerName }: { playerId: string; playerName: string }) {
  const { sport } = useCurrentTeam();
  const streak = useStreak(playerId);
  const drills = useHomeDrills(sport);
  const bests = useBests(playerId);
  const rows = (drills.data ?? []).flatMap((d) =>
    d.home.levels.flatMap((_, i) => {
      const best = bests.data?.get(bestKey(d.id, i + 1));
      return best ? [{ key: bestKey(d.id, i + 1), label: `${d.title} · Level ${i + 1}`, best }] : [];
    }),
  );
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
        {playerName}’s streak counts days in a row with a home drill, playing time in a game, or a practice or
        game a parent marked “We went”. A missed day ends it. Results a parent records at home are under
        Skills, labelled Home.
      </Footer>
      {rows.length > 0 && (
        <>
          <Section>Personal bests at home</Section>
          <Group>
            {rows.map((r) => (
              <Row
                key={r.key}
                label={r.label}
                detail={`${r.best.attempts} ${r.best.attempts === 1 ? 'score' : 'scores'}`}
                value={scoreText(r.best)}
              />
            ))}
          </Group>
        </>
      )}
    </>
  );
}
