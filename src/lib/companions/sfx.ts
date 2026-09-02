// Sound + haptics for the companion experience. Synthesized with WebAudio so
// there are no assets to load; respects a muted flag stored next to the
// progress. Vibration only exists on mobile browsers — silently ignored elsewhere.
let ctx: AudioContext | null = null;
const MUTE_KEY = 'bobby.companion.muted';

export function sfxMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
export function setSfxMuted(muted: boolean) {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = ctx ?? new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, durationMs: number, type: OscillatorType = 'sine', gain = 0.12, startDelayMs = 0) {
  const c = audio();
  if (!c || sfxMuted()) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + startDelayMs / 1000;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.02);
}

export function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

/** Equip / select: a short wooden tock. */
export function sfxTock() { tone(720, 70, 'triangle', 0.1); vibrate(12); }
/** Verdict ready. */
export function sfxSuccess() { tone(523, 90, 'sine', 0.09); tone(784, 140, 'sine', 0.09, 80); vibrate([10, 30, 20]); }
/** NO TRADE: the shield thump. */
export function sfxShield() { tone(160, 160, 'square', 0.08); tone(120, 220, 'sine', 0.08, 40); vibrate([30, 20, 30]); }
/** Level up: a short fanfare. */
export function sfxLevelUp() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 160, 'triangle', 0.1, i * 90)); vibrate([20, 40, 20, 40, 60]); }
/** Loot: sparkle, golden gets an extra octave. */
export function sfxLoot(golden = false) {
  [880, 1174, 1568].forEach((f, i) => tone(f, 120, 'sine', 0.09, i * 70));
  if (golden) [2093, 2637].forEach((f, i) => tone(f, 200, 'sine', 0.07, 240 + i * 90));
  vibrate(golden ? [20, 30, 20, 30, 80] : [15, 30, 40]);
}
/** Mission / spawn burst. */
export function sfxSpawn() { [392, 523, 659, 784].forEach((f, i) => tone(f, 140, 'triangle', 0.09, i * 60)); vibrate([10, 20, 10, 20, 40]); }
