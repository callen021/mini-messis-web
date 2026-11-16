import { type Game } from './api';

type GameStatus = Game['status'];

/** What the keeper rules need from a game row (D120). */
export interface KeeperGame {
  status: GameStatus;
  keeper_user_id: string | null;
  keeper_name: string | null;
}

export interface KeeperViewer {
  userId: string;
  isStaff: boolean;
  /** A granted stat keeper (D118). */
  statKeeper: boolean;
}

/**
 * Who may log scores and stats (D120, mirrors `can_log_stats`): while a game is live, its active
 * keeper alone — the staff member who started it, or whoever last tapped Keep stats; a live game
 * with nobody on it falls to the staff. With no live game, the staff.
 */
export function canLogGame(game: KeeperGame | null | undefined, v: KeeperViewer): boolean {
  if (!game || game.status !== 'live') return v.isStaff;
  if (!v.isStaff && !v.statKeeper) return false;
  return game.keeper_user_id ? game.keeper_user_id === v.userId : v.isStaff;
}

/** Whether the viewer may take the stats over (or back): a live game they are not keeping yet. */
export function canKeepStats(game: KeeperGame | null | undefined, v: KeeperViewer): boolean {
  if (!game || game.status !== 'live') return false;
  if (!v.isStaff && !v.statKeeper) return false;
  return game.keeper_user_id !== v.userId;
}

/** The game bar's line about who keeps the stats, or null when nobody does. */
export function keeperText(game: KeeperGame | null | undefined, userId: string): string | null {
  if (!game || game.status !== 'live' || !game.keeper_user_id) return null;
  if (game.keeper_user_id === userId) return 'You keep the stats';
  return `${game.keeper_name || 'Someone else'} keeps the stats`;
}
