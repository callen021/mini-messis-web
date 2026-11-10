/** A parent's own children come first in every list they see (D54); the rest keep their order. */
export function pinFirst<T>(list: readonly T[], isMine: (item: T) => boolean): T[] {
  if (!list.length) return [];
  const mine: T[] = [];
  const rest: T[] = [];
  for (const item of list) (isMine(item) ? mine : rest).push(item);
  return mine.length ? [...mine, ...rest] : [...list];
}
