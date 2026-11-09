/** Sport keys. Football is defined but disabled in the UI, exactly as the legacy `ENABLED_SPORTS`. */
export type SportKey = 'soccer' | 'baseball' | 'basketball' | 'lacrosse' | 'football';

export const ALL_SPORTS: readonly SportKey[] = ['soccer', 'baseball', 'basketball', 'lacrosse', 'football'];
export const ENABLED_SPORTS: readonly SportKey[] = ['soccer', 'baseball', 'basketball', 'lacrosse'];

export const isSportKey = (v: unknown): v is SportKey =>
  typeof v === 'string' && (ALL_SPORTS as readonly string[]).includes(v);
