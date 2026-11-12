/**
 * Server time (D66). The clock derives from server timestamps, so the device needs to know how far
 * its own clock is from the server's. The skew is measured once from `server_time()` and refreshed
 * from every clock read; `serverNow()` is then "now" as the server would say it.
 */
let skewMs = 0;

/** Record the skew from a server timestamp received just now. */
export function noteServerTime(serverIso: string, receivedAtMs = Date.now()): void {
  const t = Date.parse(serverIso);
  if (!Number.isNaN(t)) skewMs = t - receivedAtMs;
}

export const serverNow = (nowMs = Date.now()): number => nowMs + skewMs;

/** Tests only. */
export const resetServerSkew = (): void => {
  skewMs = 0;
};
export const currentSkewMs = (): number => skewMs;
