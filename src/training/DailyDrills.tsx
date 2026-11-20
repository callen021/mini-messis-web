import { useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useWakeLock } from '@/clock/useWakeLock';
import { Footer, Group, Section } from '@/components/List';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { type SportKey } from '@/sports/types';
import {
  type Completion,
  type DrillLevel,
  type HomeDrill,
  useCompletions,
  useDrillLevels,
  useHomeDrills,
  useMarkDone,
  useSetDrillLevel,
  useUndoDone,
} from './api';
import { DrillCard } from './DrillCard';
import { DrillStopwatch } from './DrillStopwatch';
import { drillForChild } from './rotation';

export interface DailyDrillsProps {
  playerId: string;
  playerName: string;
  sport: SportKey;
  /** Today where the team plays, `yyyy-mm-dd`. */
  today: string;
}

const START: DrillLevel = { level: 1, donesAtLevel: 0, firstDoneOn: null };

/**
 * Daily Drills (D138): one drill a day, the same for everyone on the team, each child at their
 * own level; then "Do another" with the rest. A child's very first drill is Toe Taps. Every Done
 * is recorded the same way, whichever list it came from.
 */
export function DailyDrills({ playerId, playerName, sport, today }: DailyDrillsProps) {
  const { user } = useAuth();
  const toast = useToast();
  const drills = useHomeDrills(sport);
  const completions = useCompletions(playerId, today);
  const levels = useDrillLevels(playerId);
  const markDone = useMarkDone(playerId, today);
  const undoDone = useUndoDone(playerId);
  const setLevel = useSetDrillLevel(playerId);
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const all = useMemo(() => drills.data ?? [], [drills.data]);
  // the day of the child's first Done of any drill: before it, and on it, the drill is Toe Taps
  const firstDoneOn = useMemo(() => {
    let first: string | null = null;
    for (const l of levels.data?.values() ?? []) {
      if (l.firstDoneOn && (first === null || l.firstDoneOn < first)) first = l.firstDoneOn;
    }
    return first;
  }, [levels.data]);
  const todays = useMemo(() => {
    const slug = drillForChild(today, firstDoneOn);
    return all.find((d) => d.slug === slug) ?? all[0] ?? null;
  }, [all, today, firstDoneOn]);

  const doneToday = useMemo(() => {
    const map = new Map<string, Completion>();
    for (const c of completions.data ?? []) if (c.done_on === today) map.set(c.item_id, c);
    return map;
  }, [completions.data, today]);

  // the screen stays awake only where a stopwatch may be running
  useWakeLock(!!todays?.home.stopwatch || all.some((d) => d.home.stopwatch && open === d.id));

  if (drills.isPending || completions.isPending || levels.isPending) {
    return (
      <Group>
        <div className="empty">Loading…</div>
      </Group>
    );
  }
  if (drills.isError || completions.isError || levels.isError) {
    return (
      <Group>
        <div className="empty" role="alert">
          {errorMessage(drills.error ?? completions.error ?? levels.error)}
        </div>
      </Group>
    );
  }
  if (!todays) {
    return (
      <Group>
        <div className="empty">There are no at-home drills for this sport yet.</div>
      </Group>
    );
  }

  const busy = markDone.isPending || undoDone.isPending || setLevel.isPending;
  const others = all.filter((d) => d.id !== todays.id);

  const card = (d: HomeDrill, pinned: boolean) => {
    const done = doneToday.get(d.id) ?? null;
    const mine = done !== null && !done.id.startsWith('temp-') && done.recorded_by === user?.id;
    return (
      <DrillCard
        key={d.id}
        drill={d}
        pinned={pinned}
        open={pinned || open === d.id}
        onToggle={() => setOpen(open === d.id ? null : d.id)}
        level={levels.data.get(d.id) ?? START}
        done={done}
        busy={busy}
        onDone={(level, mode) =>
          markDone.mutate({ itemId: d.id, level, mode }, { onError: (e) => toast(errorMessage(e)) })
        }
        onUndo={mine ? () => undoDone.mutate(done.id, { onError: (e) => toast(errorMessage(e)) }) : undefined}
        onSetLevel={(level) =>
          setLevel.mutate(
            { itemId: d.id, level },
            { onError: (e) => toast(errorMessage(e)), onSuccess: () => toast(`${d.title} · Level ${level}`) },
          )
        }
        extra={
          // the parent runs the stopwatch; alone, the drill counts clean runs instead
          d.home.stopwatch
            ? (level, mode) =>
                mode === 'parent' && <DrillStopwatch playerId={playerId} itemId={d.id} level={level} />
            : undefined
        }
      />
    );
  };

  return (
    <>
      <Section>Today’s drill</Section>
      {doneToday.has(todays.id) && (
        <p className="trainparty" role="status">
          <span className="burst" aria-hidden="true">
            ⚽
          </span>
          <span>
            <b>Done for today!</b> Great work, {playerName}.
          </span>
        </p>
      )}
      <ul className="drillcards">{card(todays, true)}</ul>

      {others.length > 0 && (
        <p className="doanother">
          <button
            type="button"
            className="linkbtn"
            aria-expanded={showAll}
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? 'Hide the other drills' : 'Do another'}
          </button>
        </p>
      )}
      {showAll && (
        <>
          <Section>The other {others.length} drills</Section>
          <ul className="drillcards">{others.map((d) => card(d, false))}</ul>
        </>
      )}
      <Footer>One drill marked Done counts for today. Three Dones at a level move up to the next.</Footer>
    </>
  );
}
