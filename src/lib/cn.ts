/** Join class names, dropping falsy values. */
export const cn = (...parts: (string | false | null | undefined | 0)[]): string =>
  parts.filter(Boolean).join(' ');
