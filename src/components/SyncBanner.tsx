import { useEffect } from 'react';
import { cn } from '@/lib/cn';
import { useSyncStatus } from '@/lib/offline';

/**
 * The "unsaved changes" indicator. Hidden while online with nothing in flight; otherwise a thin
 * strip under the status bar: offline (with or without queued changes) or saving. Also warns on
 * tab close while changes are still unsent.
 */
export function SyncBanner() {
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

  const n = online ? pending : Math.max(paused, pending);
  const changes = `${n} unsaved change${n === 1 ? '' : 's'}`;
  const text = !online
    ? unsaved
      ? `Offline · ${changes} will send when you’re back online`
      : 'Offline · changes you make will send when you’re back online'
    : `Saving ${changes}…`;

  return (
    <div className={cn('syncbar', online ? 'saving' : 'offline')} role="status" aria-live="polite">
      <i aria-hidden="true" />
      {text}
    </div>
  );
}
