import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { useSyncStatus } from '@/lib/offline';

/** How long a save may run before the floating "Saving…" pill appears (D78). */
export const SAVING_DELAY_MS = 1200;

/**
 * The "unsaved changes" indicator. Hidden while online with nothing in flight. Offline, a thin
 * strip under the status bar in the page flow (it stays until the connection is back). While
 * saving online it is a floating pill that takes no layout space, and only after a save has been
 * running for a while: a normal save finishes in well under a second and must never move the page
 * (D78). Also warns on tab close while changes are still unsent.
 */
export function SyncBanner({ savingDelayMs = SAVING_DELAY_MS }: { savingDelayMs?: number }) {
  const { online, pending, paused } = useSyncStatus();
  const unsaved = pending > 0;

  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome still needs returnValue set for the prompt to show.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  if (online && !unsaved) return null;
  if (online) return <SavingPill pending={pending} delayMs={savingDelayMs} />;

  const n = Math.max(paused, pending);
  const changes = `${n} unsaved change${n === 1 ? '' : 's'}`;
  const text = unsaved
    ? `Offline · ${changes} will send when you’re back online`
    : 'Offline · changes you make will send when you’re back online';
  return (
    <div className="syncbar offline" role="status" aria-live="polite">
      <i aria-hidden="true" />
      {text}
    </div>
  );
}

/** Mounted only while something is saving online; shows itself once the save has taken a while. */
function SavingPill({ pending, delayMs }: { pending: number; delayMs: number }) {
  const [slow, setSlow] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) return;
    const t = window.setTimeout(() => setSlow(true), delayMs);
    return () => window.clearTimeout(t);
  }, [delayMs]);
  if (!slow) return null;
  return (
    <div className={cn('syncbar', 'saving')} role="status" aria-live="polite">
      <i aria-hidden="true" />
      {`Saving ${pending} unsaved change${pending === 1 ? '' : 's'}…`}
    </div>
  );
}
