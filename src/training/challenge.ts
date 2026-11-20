import { type Challenge } from '@/library/types';

/** The numbers shown on the card before a countdown starts: 3, 2, 1. */
export const READY_SECONDS = 3;
export const MAX_REPS = 9999;

/** Time left on a countdown, "1:00" … "0:01", "0:00": a started second shows until it is over. */
export function clockText(msLeft: number): string {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Elapsed milliseconds as seconds to a hundredth: what is shown is what is recorded. */
export const toHundredths = (ms: number): number => Math.max(0, Math.floor(ms / 10)) / 100;

/** A course time: "8.42", "59.90", "1:02.30". */
export function timeText(seconds: number): string {
  const hundredths = Math.round(seconds * 100);
  const m = Math.floor(hundredths / 6000);
  const rest = (hundredths - m * 6000) / 100;
  return m > 0 ? `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(2)}` : rest.toFixed(2);
}

/** A score as it is written: "42", or "8.42 s". */
export function scoreText(score: { reps: number | null; seconds: number | null }): string {
  if (score.seconds !== null) return `${timeText(Number(score.seconds))} s`;
  return String(score.reps ?? 0);
}

/** A target as it is written: "40", "10.0 s". */
export function targetText(challenge: Challenge): string | null {
  if (challenge.target === null) return null;
  return challenge.mode === 'stopwatch' ? `${challenge.target.toFixed(1)} s` : String(challenge.target);
}

/** "Target: 40 or more unlocks Level 2", or nothing at the top level. */
export function targetLine(challenge: Challenge, level: number, levels: number): string | null {
  const target = targetText(challenge);
  if (target === null || level >= levels) return null;
  return `Target: ${target} or ${challenge.mode === 'stopwatch' ? 'less' : 'more'} unlocks Level ${level + 1}`;
}
