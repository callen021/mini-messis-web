import { useMemo } from 'react';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { useDrillTimes, useSaveTime } from './api';
import { Stopwatch } from './Stopwatch';

/** The stopwatch wired to a child's saved times for one timed drill at one level (D129). */
export function DrillStopwatch({
  playerId,
  itemId,
  level,
}: {
  playerId: string;
  itemId: string;
  level: number;
}) {
  const toast = useToast();
  const times = useDrillTimes(playerId, itemId);
  const save = useSaveTime(playerId, itemId);
  const runs = useMemo(() => (times.data ?? []).filter((t) => t.level === level), [times.data, level]);
  return (
    <Stopwatch
      // a different level is a different course: start clean
      key={level}
      level={level}
      runs={runs}
      saving={save.isPending}
      onSave={async (seconds) => {
        try {
          await save.mutateAsync({ level, seconds });
        } catch (e) {
          toast(errorMessage(e));
          throw e;
        }
      }}
    />
  );
}
