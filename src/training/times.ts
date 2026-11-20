/** Elapsed milliseconds as seconds to a tenth: what is shown is what is saved. */
export const toTenths = (ms: number): number => Math.max(0, Math.floor(ms / 100)) / 10;

/** A stopwatch time as a Time field takes it: plain seconds to a tenth, "62.3" (never "1:02.3"). */
export const timeFieldValue = (seconds: number): string => seconds.toFixed(1);

/** "8.4", "59.9", "1:02.3". */
export function formatSeconds(seconds: number): string {
  const tenths = Math.round(seconds * 10);
  const m = Math.floor(tenths / 600);
  const rest = (tenths - m * 600) / 10;
  return m > 0 ? `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}` : rest.toFixed(1);
}
