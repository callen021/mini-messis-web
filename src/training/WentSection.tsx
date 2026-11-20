import { Button } from '@/components/Button';
import { Footer, Group, Row, Section } from '@/components/List';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/auth/AuthProvider';
import { type Game } from '@/games/api';
import { fmtDate, fmtTime } from '@/games/format';
import { type Practice } from '@/games/practices';
import { errorMessage } from '@/lib/supabase';
import { useCheckins, useGameCheckins, useSetGameWent, useSetWent } from './api';
import { teamToday } from './rotation';
import { eventStarted, practiceStarted, teamNowStamp } from './streak';

export interface WentChild {
  id: string;
  first_name: string;
}

type WentGame = Pick<Game, 'id' | 'game_date' | 'start_time' | 'opponent'>;

/**
 * "We went" (D130, D138): a parent marks that their child was at a practice or a game, which
 * counts the day toward the streak. Offered only once it has started, never for a cancelled
 * practice, and only for a child whose link a coach confirmed. It can be taken back the same day.
 */
export function WentSection({
  practices = [],
  games = [],
  kids,
  timezone,
  today,
  title = 'Were you there?',
}: {
  /** The practices to offer, already narrowed by the caller. */
  practices?: readonly Practice[];
  /** The games to offer, already narrowed by the caller. */
  games?: readonly WentGame[];
  /** The parent's confirmed children. */
  kids: readonly WentChild[];
  timezone: string | null;
  /** Today where the team plays. */
  today: string;
  title?: string;
}) {
  const now = teamNowStamp(timezone);
  const startedPractices = practices.filter((p) => practiceStarted(p, now));
  const startedGames = games.filter((g) => eventStarted(g.game_date, g.start_time, now));
  if ((!startedPractices.length && !startedGames.length) || !kids.length) return null;
  return (
    <>
      <Section>{title}</Section>
      <Group>
        {startedPractices.flatMap((p) =>
          kids.map((c) => (
            <PracticeRow key={`p:${p.id}:${c.id}`} practice={p} child={c} today={today} timezone={timezone} />
          )),
        )}
        {startedGames.flatMap((g) =>
          kids.map((c) => (
            <GameRow key={`g:${g.id}:${c.id}`} game={g} child={c} today={today} timezone={timezone} />
          )),
        )}
      </Group>
      <Footer>“We went” counts that day toward the streak. You can take it back the same day.</Footer>
    </>
  );
}

function PracticeRow({
  practice: p,
  child,
  today,
  timezone,
}: {
  practice: Practice;
  child: WentChild;
  today: string;
  timezone: string | null;
}) {
  const checkins = useCheckins(child.id);
  const setWent = useSetWent(child.id);
  const toast = useToast();
  const row = (checkins.data ?? []).find((k) => k.practice_id === p.id);
  return (
    <WentRow
      label={`${child.first_name} · practice ${fmtDate(p.practice_date)}`}
      time={p.start_time}
      mark={row ?? null}
      today={today}
      timezone={timezone}
      busy={setWent.isPending || checkins.isPending}
      onSet={(value) =>
        setWent.mutate(
          { practiceId: p.id, went: value },
          {
            onError: (e) => toast(errorMessage(e)),
            onSuccess: () => toast(value ? `${child.first_name} · went to practice` : 'Taken back'),
          },
        )
      }
    />
  );
}

function GameRow({
  game: g,
  child,
  today,
  timezone,
}: {
  game: WentGame;
  child: WentChild;
  today: string;
  timezone: string | null;
}) {
  const checkins = useGameCheckins(child.id);
  const setWent = useSetGameWent(child.id);
  const toast = useToast();
  const row = (checkins.data ?? []).find((k) => k.game_id === g.id);
  return (
    <WentRow
      label={`${child.first_name} · game ${fmtDate(g.game_date)}${g.opponent ? ` vs ${g.opponent}` : ''}`}
      time={g.start_time}
      mark={row ?? null}
      today={today}
      timezone={timezone}
      busy={setWent.isPending || checkins.isPending}
      onSet={(value) =>
        setWent.mutate(
          { gameId: g.id, went: value },
          {
            onError: (e) => toast(errorMessage(e)),
            onSuccess: () => toast(value ? `${child.first_name} · went to the game` : 'Taken back'),
          },
        )
      }
    />
  );
}

function WentRow({
  label,
  time,
  mark,
  today,
  timezone,
  busy,
  onSet,
}: {
  label: string;
  time: string | null;
  /** The saved "We went", if there is one. */
  mark: { set_by: string | null; created_at: string } | null;
  today: string;
  timezone: string | null;
  busy: boolean;
  onSet: (went: boolean) => void;
}) {
  const { user } = useAuth();
  const went = mark !== null;
  // the server decides; this only hides a button that would be refused
  const canUndo =
    went && mark.set_by === user?.id && teamToday(timezone, new Date(mark.created_at)) === today;
  return (
    <Row label={label} detail={went ? 'Marked: we went' : time ? fmtTime(time) : undefined}>
      {went ? (
        canUndo ? (
          <Button size="sm" variant="gray" disabled={busy} onClick={() => onSet(false)}>
            Undo
          </Button>
        ) : (
          <span className="wentmark" role="img" aria-label="We went">
            ✓
          </span>
        )
      ) : (
        <Button size="sm" disabled={busy} onClick={() => onSet(true)}>
          We went
        </Button>
      )}
    </Row>
  );
}
