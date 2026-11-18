import { useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useWakeLock } from '@/clock/useWakeLock';
import { Footer, Group, Section } from '@/components/List';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { type SportKey } from '@/sports/types';
import {
  type Completion,
  type HomeDrill,
  useCompletions,
  useHomeDrills,
  useMarkDone,
  useUndoDone,
} from './api';
import { DrillCard } from './DrillCard';
import { drillsFor } from './rotation';

export interface DailyDrillsProps {
  playerId: string;
  playerName: string;
  sport: SportKey;
  /** Today where the team plays, `yyyy-mm-dd`. */
  today: string;
}

/**
 * Daily Drills (D128): today's three drills from the five-day rotation, then "Do another" with
 * all ten. Every Done is recorded the same way, whichever list it came from. One drill is open at
 * a time, and the screen stays awake while one is.
 */
export function DailyDrills({ playerId, playerName, sport, today }: DailyDrillsProps) {
  const { user } = useAuth();
  const toast = useToast();
  const drills = useHomeDrills(sport);
  const completions = useCompletions(playerId, today);
  const markDone = useMarkDone(playerId, today);
  const undoDone = useUndoDone(playerId);
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  useWakeLock(open !== null);

  const all = useMemo(() => drills.data ?? [], [drills.data]);
  const todays = useMemo(() => {
    const bySlug = new Map(all.map((d) => [d.slug, d]));
    return drillsFor(today).flatMap((slug) => bySlug.get(slug) ?? []);
  }, [all, today]);

  const { doneToday, lastBefore } = useMemo(() => {
    const doneToday = new Map<string, Completion>();
    const lastBefore = new Map<string, Completion>();
    for (const c of completions.data ?? []) {
      if (c.done_on === today) doneToday.set(c.item_id, c);
      else lastBefore.set(c.item_id, c); // rows come oldest first, so the last one wins
    }
    return { doneToday, lastBefore };
  }, [completions.data, today]);

  if (drills.isPending || completions.isPending) {
    return (
      <Group>
        <div className="empty">Loading…</div>
      </Group>
    );
  }
  if (drills.isError || completions.isError) {
    return (
      <Group>
        <div className="empty" role="alert">
          {errorMessage(drills.error ?? completions.error)}
        </div>
      </Group>
    );
  }
  if (all.length === 0) {
    return (
      <Group>
        <div className="empty">There are no at-home drills for this sport yet.</div>
      </Group>
    );
  }

  const minutes = todays.reduce((sum, d) => sum + (d.home.minutes ?? 0), 0);
  const allDone = todays.length > 0 && todays.every((d) => doneToday.has(d.id));
  const busy = markDone.isPending || undoDone.isPending;

  const card = (d: HomeDrill, list: string) => {
    const key = `${list}:${d.id}`;
    const done = doneToday.get(d.id) ?? null;
    const mine = done !== null && !done.id.startsWith('temp-') && done.recorded_by === user?.id;
    return (
      <DrillCard
        key={key}
        drill={d}
        open={open === key}
        onToggle={() => setOpen(open === key ? null : key)}
        done={done}
        last={lastBefore.get(d.id) ?? null}
        busy={busy}
        onDone={(level, mode) =>
          markDone.mutate({ itemId: d.id, level, mode }, { onError: (e) => toast(errorMessage(e)) })
        }
        onUndo={mine ? () => undoDone.mutate(done.id, { onError: (e) => toast(errorMessage(e)) }) : undefined}
      />
    );
  };

  return (
    <>
      <Section>
        Today · {todays.length} drills{minutes > 0 ? ` · about ${minutes} min` : ''}
      </Section>
      {allDone && (
        <p className="trainparty" role="status">
          <span className="burst" aria-hidden="true">
            ⚽
          </span>
          <span>
            <b>All three done!</b> Great work, {playerName}.
          </span>
        </p>
      )}
      <ul className="drillcards">{todays.map((d) => card(d, 'today'))}</ul>

      <p className="doanother">
        <button
          type="button"
          className="linkbtn"
          aria-expanded={showAll}
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'Hide the full list' : 'Do another'}
        </button>
      </p>
      {showAll && (
        <>
          <Section>All {all.length} drills</Section>
          <ul className="drillcards">{all.map((d) => card(d, 'all'))}</ul>
        </>
      )}
      <Footer>
        The levels are steps to try in order; none is locked. Any drill marked Done counts for today.
      </Footer>
    </>
  );
}
