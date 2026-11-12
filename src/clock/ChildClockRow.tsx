import { Row } from '@/components/List';
import { type Game } from '@/games/api';
import { SPORTS } from '@/sports/definitions';
import { positionName } from '@/sports/positions';
import { type Formation, type Period } from '@/sports/types';
import { type Player } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useGameClock, useStints } from './api';
import { PAUSED_CLOCK, formatClock, formatMinutes, isRunning, playerTimes } from './clock';
import { useServerNow } from './useNow';

/**
 * The parent home tab's "my child in this game" row for a clock-mode team (D73): during a live
 * game, on the field (position, current shift) or on the bench, with minutes played so far;
 * otherwise whether they are in the starting lineup and where.
 */
export function ChildClockRow({
  child,
  live,
  starters,
  formationFor,
}: {
  child: Player;
  live: Game | null;
  starters: Period | null;
  formationFor: (name: string) => Formation;
}) {
  const { sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const clockQ = useGameClock(live?.id, !!live);
  const stintsQ = useStints(live?.id, !!live);
  const clock = clockQ.data ?? PAUSED_CLOCK;
  const now = useServerNow(!!live && isRunning(clock));

  if (live) {
    const t = playerTimes(stintsQ.data ?? [], clock, now, [child.id]).get(child.id);
    if (!t) return <Row label="Loading…" />;
    const f = starters ? formationFor(starters.formation) : null;
    const pos = t.onField && f ? f.positions[t.slot ?? -1] : undefined;
    return (
      <Row
        label={
          t.onField
            ? `On the field · ${pos ? positionName(S, pos.code, pos.role) : t.code}`
            : t.seconds
              ? 'On the bench'
              : 'On the bench · not on yet'
        }
        detail={`${formatMinutes(t.seconds)} played · ${t.shifts} shift${t.shifts === 1 ? '' : 's'}${
          t.onField
            ? ` · this shift ${formatClock(t.shiftSeconds)}`
            : t.seconds
              ? ` · resting ${formatClock(t.restSeconds)}`
              : ''
        }`}
      />
    );
  }
  const f = starters ? formationFor(starters.formation) : null;
  const i = starters ? starters.slots.indexOf(child.id) : -1;
  const pos = i >= 0 && f ? f.positions[i] : undefined;
  return (
    <Row
      label={pos ? `Starting at ${positionName(S, pos.code, pos.role)}` : 'Not in the starting lineup yet'}
      detail={
        pos
          ? 'Substitutions run on the game clock once the game starts; minutes played show here live.'
          : 'The coach sets the starters on the Field tab; everyone else begins on the bench.'
      }
    />
  );
}
