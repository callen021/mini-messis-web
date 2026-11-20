import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Footer, Group, Section } from '@/components/List';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { type SportKey } from '@/sports/types';
import {
  type Attempt,
  bestKey,
  type Completion,
  type DrillLevel,
  type HomeDrill,
  useAttempts,
  useBests,
  useCompletions,
  useDrillLevels,
  useHomeDrills,
  useMarkDone,
  useRecordAttempt,
  useSetDrillLevel,
} from './api';
import { DrillCard } from './DrillCard';
import { drillForChild } from './rotation';

export interface DailyDrillsProps {
  playerId: string;
  playerName: string;
  sport: SportKey;
  /** Today where the team plays, `yyyy-mm-dd`. */
  today: string;
}

const START: DrillLevel = { level: 1, firstDoneOn: null };
const NONE: readonly Attempt[] = [];

/**
 * Daily Drills (D138, D140, D141): one drill a day, each child working through the ten easiest
 * first at their own level; then "Do another" with the rest. A child's first drill is Toe Taps. Each
 * drill is a timed challenge: Record Score saves the attempt and opens its results page, and the
 * day's first score of a drill is that drill Done. `?drill=<slug>` opens one of the other drills
 * (the results page's "Try Again").
 */
export function DailyDrills({ playerId, playerName, sport, today }: DailyDrillsProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const drills = useHomeDrills(sport);
  const completions = useCompletions(playerId, today);
  const levels = useDrillLevels(playerId);
  const bests = useBests(playerId);
  const attempts = useAttempts(playerId);
  const markDone = useMarkDone(playerId, today);
  const record = useRecordAttempt(playerId);
  const setLevel = useSetDrillLevel(playerId);
  const asked = search.get('drill');
  const [open, setOpen] = useState<string | null>(asked);
  // null until the parent taps: open by itself only when one of the other drills was asked for
  const [toggled, setToggled] = useState<boolean | null>(null);

  const all = useMemo(() => drills.data ?? [], [drills.data]);
  // the child's own line-up (D141): the drill they have gone longest without, easiest first.
  // Only Dones before today count, so today's drill stays the same once it is done.
  const todays = useMemo(() => {
    const slugOf = new Map(all.map((d) => [d.id, d.slug]));
    const last = new Map<string, string>();
    for (const c of completions.data ?? []) {
      const slug = slugOf.get(c.item_id);
      if (slug && c.done_on < today && c.done_on > (last.get(slug) ?? '')) last.set(slug, c.done_on);
    }
    const slug = drillForChild(
      all.map((d) => d.slug),
      last,
    );
    return all.find((d) => d.slug === slug) ?? null;
  }, [all, completions.data, today]);

  const doneToday = useMemo(() => {
    const map = new Map<string, Completion>();
    for (const c of completions.data ?? []) if (c.done_on === today) map.set(c.item_id, c);
    return map;
  }, [completions.data, today]);
  const byDrill = useMemo(() => {
    const map = new Map<string, Attempt[]>();
    for (const a of attempts.data ?? []) map.set(a.item_id, [...(map.get(a.item_id) ?? []), a]);
    return map;
  }, [attempts.data]);

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

  const busy = markDone.isPending || record.isPending || setLevel.isPending;
  const others = all.filter((d) => d.id !== todays.id);
  const showAll = toggled ?? others.some((d) => d.slug === asked);

  const card = (d: HomeDrill, pinned: boolean) => {
    const level = levels.data.get(d.id) ?? START;
    return (
      <DrillCard
        key={d.id}
        drill={d}
        pinned={pinned}
        open={pinned || open === d.slug}
        onToggle={() => setOpen(open === d.slug ? null : d.slug)}
        level={level}
        done={doneToday.get(d.id) ?? null}
        best={bests.data?.get(bestKey(d.id, level.level)) ?? null}
        attempts={byDrill.get(d.id) ?? NONE}
        busy={busy}
        onRecord={(lv, mode, score) =>
          record.mutate(
            { itemId: d.id, level: lv, mode, score },
            {
              onSuccess: (id) => void navigate(`/training/result/${id}`),
              // the attempt stays on the card, so Record Score can be tapped again
              onError: (e) => toast(errorMessage(e)),
            },
          )
        }
        onDone={(lv, mode) =>
          markDone.mutate({ itemId: d.id, level: lv, mode }, { onError: (e) => toast(errorMessage(e)) })
        }
        onSetLevel={(lv) =>
          setLevel.mutate(
            { itemId: d.id, level: lv },
            { onError: (e) => toast(errorMessage(e)), onSuccess: () => toast(`${d.title} · Level ${lv}`) },
          )
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
            onClick={() => setToggled(!showAll)}
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
      <Footer>
        The first score of the day on a drill counts for today. A score that meets a level’s target unlocks
        the next level.
      </Footer>
    </>
  );
}
