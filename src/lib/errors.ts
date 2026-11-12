/** What supabase-js hands back for a failed query or RPC (PostgrestError-shaped). */
export interface DbErrorLike {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * A thrown database error that keeps its SQLSTATE, so the screen can tell a message written for
 * the user (our own `raise exception` text) from raw engine text that must never be shown.
 */
export class DbError extends Error {
  readonly code: string | undefined;
  readonly details: string | undefined;
  readonly hint: string | undefined;
  constructor(e: DbErrorLike) {
    super(e.message);
    this.name = 'DbError';
    this.code = e.code ?? undefined;
    this.details = e.details ?? undefined;
    this.hint = e.hint ?? undefined;
  }
}

/** `throw dbError(error)` instead of `throw new Error(error.message)`: same message, code kept. */
export function dbError(e: DbErrorLike): DbError {
  return new DbError(e);
}
