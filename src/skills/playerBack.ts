import { type PageBack } from '@/components/Page';

/** Where a player page goes back to: the page that opened it (D57, D61). */
export interface PlayerBackState {
  from?: string;
  fromLabel?: string;
}

/**
 * The back link for a player page: when the opener left router state, go back in history (so
 * the opener keeps its scroll position); otherwise a plain link to the fallback.
 */
export function playerBack(state: PlayerBackState, fallback: { to: string; label: string }): PageBack {
  if (state.from) return { to: state.from, label: state.fromLabel ?? fallback.label, pop: true };
  return fallback;
}
