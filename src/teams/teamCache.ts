import { type QueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { type ActiveMembership, type Team } from './api';

/**
 * The team a screen reads comes from the memberships list (RequireTeam), not from the team's own
 * query, so an optimistic update has to touch both or the control waits on the server (D88).
 * Applies `patch` to every cached copy and returns a function that puts them back.
 */
export function patchTeamCaches(qc: QueryClient, teamId: string, patch: Partial<Team>): () => void {
  const restores: (() => void)[] = [];
  const own = qc.getQueryData<Team>(qk.team(teamId));
  if (own) {
    qc.setQueryData<Team>(qk.team(teamId), { ...own, ...patch });
    restores.push(() => qc.setQueryData(qk.team(teamId), own));
  }
  for (const q of qc.getQueryCache().findAll({ queryKey: ['memberships'] })) {
    const data = q.state.data as ActiveMembership[] | undefined;
    if (!Array.isArray(data)) continue;
    const key = q.queryKey;
    qc.setQueryData(
      key,
      data.map((m) => (m.team.id === teamId ? { ...m, team: { ...m.team, ...patch } } : m)),
    );
    restores.push(() => qc.setQueryData(key, data));
  }
  return () => {
    for (const r of restores.reverse()) r();
  };
}

/** Refetch every copy of the team after a save settles. */
export function invalidateTeamCaches(qc: QueryClient, teamId: string): void {
  void qc.invalidateQueries({ queryKey: qk.team(teamId) });
  void qc.invalidateQueries({ queryKey: ['memberships'] });
}

/** Taps closer together than this save as one request (D88). */
export const COALESCE_MS = 400;

/** The one message a failed settings save shows; the control has already rolled back. */
export const SAVE_FAILED = 'Couldn’t save that change. Check your connection and try again.';
