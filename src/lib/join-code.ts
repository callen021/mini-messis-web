/** Join codes: 8 chars from a base32 alphabet without I, L, O, U, 0 or 1 (matches `generate_join_code()`). */
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

/** What the user typed → uppercase, alphanumerics only, max 8 (the server normalizes the same way). */
export const normalizeCode = (raw: string): string =>
  raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);

/** True when the code has the server's exact shape. */
export const isCompleteCode = (code: string): boolean => /^[A-Z2-9]{8}$/.test(code);

/** "ABCD2345" → "ABCD 2345" for display. */
export const formatCode = (code: string): string =>
  code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
