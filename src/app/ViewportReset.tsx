import { useViewportReset } from './useViewportReset';

/** Mounts the iOS keyboard viewport fix (D111) once for the whole app. */
export function ViewportReset() {
  useViewportReset();
  return null;
}
