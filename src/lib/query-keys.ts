/** TanStack Query keys, grouped so invalidation can be broad (`qk.team(id)`) or narrow. */
export const qk = {
  profile: (userId: string) => ['profile', userId] as const,
  memberships: (userId: string) => ['memberships', userId] as const,
  pendingRequests: (userId: string) => ['pending-requests', userId] as const,
  team: (teamId: string) => ['team', teamId] as const,
  teamMembers: (teamId: string) => ['team', teamId, 'members'] as const,
  players: (teamId: string) => ['team', teamId, 'players'] as const,
  seasons: (teamId: string) => ['team', teamId, 'seasons'] as const,
  lineups: (teamId: string, gameId: string | null) =>
    ['team', teamId, 'lineups', gameId ?? 'template'] as const,
  games: (teamId: string) => ['team', teamId, 'games'] as const,
  liveGame: (teamId: string) => ['team', teamId, 'live-game'] as const,
  guardians: (userId: string) => ['guardians', userId] as const,
  game: (gameId: string) => ['game', gameId] as const,
};
