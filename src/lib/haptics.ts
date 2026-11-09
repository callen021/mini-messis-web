/** Short haptic tick (Android Chrome; iOS Safari ignores it). Used on tab changes, as in the legacy app. */
export function hapticTick(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(8);
  } catch {
    /* some browsers throw when vibration is blocked; it is only a nicety */
  }
}
