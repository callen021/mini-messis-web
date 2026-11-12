import { isNetworkError } from './offline';

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

export const GENERIC = 'Something went wrong. Try again.';
export const NO_CONNECTION = 'No connection. Check your network and try again.';
export const NOT_ALLOWED = 'You don’t have permission to do that.';
export const INVALID = 'Some of that isn’t valid. Check the values and try again.';
export const EXISTS = 'That already exists.';
export const IN_USE = 'That is still in use somewhere else.';
export const NOT_FOUND = 'That wasn’t found. It may have been removed.';
export const TIMEOUT = 'That took too long. Try again.';

/**
 * Engine and PostgREST phrasing that must never reach a screen (D90). Our own messages are plain
 * sentences; the engine's name tables, columns, constraints and policies.
 */
const RAW =
  /violates|constraint|syntax error|relation "|column "|does not exist|permission denied|row-level security|null value in column|invalid input|duplicate key|requires a WHERE|canceling statement|JSON object requested|schema cache|Could not find|out of range|deadlock|too long for type|invalid byte|unexpected end of|statement timeout|cannot be cast|operator does not exist|is not a function|Cannot read propert|undefined is not|null is not|TypeError|ReferenceError|RangeError|SyntaxError|is not iterable|Unexpected token/i;

const looksRaw = (message: string) => RAW.test(message);

/** Message by SQLSTATE class for errors the engine raised (never our own text). */
function byCode(code: string, message: string): string | null {
  if (code.startsWith('PGRST')) return code === 'PGRST116' ? NOT_FOUND : GENERIC;
  if (code === '23505') return EXISTS;
  if (code === '23503') return IN_USE;
  if (code === '23514' || code === '23502' || code.startsWith('22')) return INVALID;
  if (code === '57014') return TIMEOUT;
  if (code === '42501') return NOT_ALLOWED;
  if (code.startsWith('42') || code.startsWith('08') || code.startsWith('53') || code.startsWith('XX'))
    return GENERIC;
  if (code === 'P0001' && looksRaw(message)) return GENERIC;
  return null;
}

/**
 * The one sentence a screen shows for a failure. Our own `raise exception` messages (SQLSTATE
 * P0xxx, and the 42501 / 22023 we raise with plain text) pass through; anything the engine wrote
 * (constraints, policies, syntax, PostgREST) becomes a plain sentence by code or by its wording;
 * a dropped connection says so.
 */
export function errorMessage(err: unknown): string {
  if (!err) return GENERIC;
  if (isNetworkError(err)) return NO_CONNECTION;
  const e = err as { message?: unknown; code?: unknown };
  const message =
    typeof e.message === 'string' ? e.message : err instanceof Error ? err.message : String(err);
  const code = typeof e.code === 'string' ? e.code : '';
  if (!message.trim()) return GENERIC;
  if (code) {
    // text we wrote ourselves, under a code the engine also uses
    if ((code === '42501' || code === '22023' || code === '23514' || code === 'P0001') && !looksRaw(message))
      return message;
    const mapped = byCode(code, message);
    if (mapped) return mapped;
    if (code.startsWith('P0')) return looksRaw(message) ? GENERIC : message;
  }
  return looksRaw(message) ? GENERIC : message;
}
