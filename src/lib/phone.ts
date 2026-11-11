/**
 * Phone numbers (D57): stored normalised (E.164 where the number is recognisable, +1 assumed for
 * ten US/Canada digits), shown formatted. Pure.
 */

/** "+15550100001" from "(555) 010-0001", "555.010.0001", "1 555 010 0001"; other countries keep "+" and digits. */
export function normalizePhone(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  const plus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (plus) return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  // anything else is kept as typed digits so nothing is lost, but without a country code
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

/** "(555) 010-0001" for a +1 number; "+44 20 7946 0958"-style grouping is left to the reader otherwise. */
export function formatPhone(stored: string | null | undefined): string {
  const s = (stored ?? '').trim();
  if (!s) return '';
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(s);
  if (m) return `(${m[1]}) ${m[2]}-${m[3]}`;
  return s;
}

/** `tel:` link target. */
export const telHref = (stored: string): string => `tel:${stored.replace(/[^\d+]/g, '')}`;
/** `sms:` link target. */
export const smsHref = (stored: string): string => `sms:${stored.replace(/[^\d+]/g, '')}`;
