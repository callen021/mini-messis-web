import { describe, expect, it } from 'vitest';
import {
  DbError,
  EXISTS,
  GENERIC,
  INVALID,
  IN_USE,
  NOT_ALLOWED,
  NOT_FOUND,
  NO_CONNECTION,
  TIMEOUT,
  dbError,
  errorMessage,
} from '../errors';

describe('errorMessage (D90): no raw database text ever reaches the screen', () => {
  it('keeps the SQLSTATE on a thrown database error', () => {
    const e = dbError({
      message: 'only a coach can rename the team',
      code: '42501',
      details: null,
      hint: null,
    });
    expect(e).toBeInstanceOf(DbError);
    expect(e.code).toBe('42501');
    expect(e.message).toBe('only a coach can rename the team');
  });

  it('passes our own raise-exception messages through, whatever code they carry', () => {
    expect(errorMessage(dbError({ message: 'only a coach can rename the team', code: '42501' }))).toBe(
      'only a coach can rename the team',
    );
    expect(
      errorMessage(
        dbError({ message: 'the coach has turned this invite link off; ask for a new one', code: 'P0005' }),
      ),
    ).toBe('the coach has turned this invite link off; ask for a new one');
    expect(
      errorMessage(dbError({ message: 'template must have one lineup per period', code: '22023' })),
    ).toBe('template must have one lineup per period');
    expect(
      errorMessage(dbError({ message: 'transfer ownership before removing the owner', code: '23514' })),
    ).toBe('transfer ownership before removing the owner');
    expect(errorMessage(new Error('Tell us your name so the coach recognises you.'))).toBe(
      'Tell us your name so the coach recognises you.',
    );
  });

  it('replaces engine text by its code', () => {
    expect(errorMessage(dbError({ message: 'DELETE requires a WHERE clause', code: '21000' }))).toBe(GENERIC);
    expect(
      errorMessage(
        dbError({ message: 'new row violates row-level security policy for table "teams"', code: '42501' }),
      ),
    ).toBe(NOT_ALLOWED);
    expect(errorMessage(dbError({ message: 'permission denied for table players', code: '42501' }))).toBe(
      NOT_ALLOWED,
    );
    expect(
      errorMessage(dbError({ message: 'duplicate key value violates unique constraint "x"', code: '23505' })),
    ).toBe(EXISTS);
    expect(
      errorMessage(
        dbError({
          message: 'update or delete on table "players" violates foreign key constraint',
          code: '23503',
        }),
      ),
    ).toBe(IN_USE);
    expect(
      errorMessage(
        dbError({
          message: 'new row for relation "teams" violates check constraint "teams_name_check"',
          code: '23514',
        }),
      ),
    ).toBe(INVALID);
    expect(
      errorMessage(
        dbError({ message: 'null value in column "name" violates not-null constraint', code: '23502' }),
      ),
    ).toBe(INVALID);
    expect(
      errorMessage(dbError({ message: 'invalid input syntax for type uuid: "abc"', code: '22P02' })),
    ).toBe(INVALID);
    expect(
      errorMessage(dbError({ message: 'canceling statement due to statement timeout', code: '57014' })),
    ).toBe(TIMEOUT);
    expect(
      errorMessage(
        dbError({ message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }),
      ),
    ).toBe(NOT_FOUND);
    expect(
      errorMessage(
        dbError({ message: 'Could not find the function public.nope in the schema cache', code: 'PGRST202' }),
      ),
    ).toBe(GENERIC);
    expect(
      errorMessage(dbError({ message: 'function public.nope(uuid) does not exist', code: '42883' })),
    ).toBe(GENERIC);
    expect(errorMessage(dbError({ message: 'column "x" does not exist', code: '42703' }))).toBe(GENERIC);
  });

  it('replaces engine text by its wording when the code was lost or is ours', () => {
    expect(errorMessage(new Error('DELETE requires a WHERE clause'))).toBe(GENERIC);
    expect(errorMessage(new Error('new row violates row-level security policy for table "x"'))).toBe(GENERIC);
    expect(errorMessage({ message: 'relation "public.nope" does not exist' })).toBe(GENERIC);
    expect(errorMessage(dbError({ message: 'column "foo" does not exist', code: 'P0001' }))).toBe(GENERIC);
    expect(errorMessage(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(GENERIC);
  });

  it('says so when the connection dropped, and has something to say for nothing at all', () => {
    expect(errorMessage(new Error('TypeError: Failed to fetch'))).toBe(NO_CONNECTION);
    expect(errorMessage({ message: 'Load failed' })).toBe(NO_CONNECTION);
    expect(errorMessage(null)).toBe(GENERIC);
    expect(errorMessage({ message: '' })).toBe(GENERIC);
    expect(errorMessage('plain string')).toBe('plain string');
  });
});
