/**
 * The challenge's sounds (D140): a short beep on 3, 2, 1 and a buzzer at zero, made with Web Audio
 * so there is no file to load. A phone on silent plays nothing, which is why the card also shows
 * "TIME!". Every call is safe where audio is missing or blocked.
 */
type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    const Ctor: AudioCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(frequency: number, ms: number, type: OscillatorType, volume: number): void {
  const a = audio();
  if (!a) return;
  try {
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    const end = a.currentTime + ms / 1000;
    gain.gain.setValueAtTime(volume, a.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, end);
    osc.connect(gain).connect(a.destination);
    osc.start();
    osc.stop(end);
  } catch {
    // sound is a convenience: the screen says the same thing
  }
}

/** Browsers only let sound start from a tap: call this in the Start button's handler. */
export const unlockSound = (): void => void audio();
export const beep = (): void => tone(880, 150, 'sine', 0.3);
export const buzzer = (): void => tone(196, 900, 'square', 0.3);
