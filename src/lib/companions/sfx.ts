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

// ---- The aura forge (onboarding step 3): futuristic, all synthesized ----

/** Low machine hum while the forge runs. Returns a stop function that fades out. */
export function sfxForgeHum(): () => void {
  const c = audio();
  if (!c || sfxMuted()) return () => {};
  const master = c.createGain();
  master.gain.setValueAtTime(0.0001, c.currentTime);
  master.gain.exponentialRampToValueAtTime(0.09, c.currentTime + 0.8);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  master.connect(lp).connect(c.destination);
  const oscs: OscillatorNode[] = [];
  const layer = (freq: number, type: OscillatorType, gain: number) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = gain;
    o.connect(g).connect(master); o.start(); oscs.push(o);
    return o;
  };
  layer(55, 'sine', 1);
  const mid = layer(110, 'triangle', 0.6);
  layer(165, 'sine', 0.35);
  // Slow wobble on the mid layer so it breathes.
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.4; lfoGain.gain.value = 3;
  lfo.connect(lfoGain).connect(mid.frequency); lfo.start(); oscs.push(lfo);
  return () => {
    const t = c.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    oscs.forEach((o) => o.stop(t + 0.65));
  };
}

/** One piece equipped: a rising charge, each one a step higher (1..4). */
export function sfxForgeCharge(index: number) {
  const c = audio();
  if (!c || sfxMuted()) return;
  const i = Math.max(1, Math.min(4, index));
  const t0 = c.currentTime;
  const f0 = 240;
  const f1 = 760 + 200 * i;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.012);
  g.gain.setValueAtTime(0.16, t0 + 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
  g.connect(c.destination);
  const sweep = (type: OscillatorType, mult: number, gain: number) => {
    const o = c.createOscillator();
    const og = c.createGain();
    o.type = type; og.gain.value = gain;
    o.frequency.setValueAtTime(f0 * mult, t0);
    o.frequency.exponentialRampToValueAtTime(f1 * mult, t0 + 0.42);
    o.connect(og).connect(g); o.start(t0); o.stop(t0 + 0.45);
  };
  sweep('sine', 1, 1);
  sweep('square', 2, 0.18);
  sweep('sine', 3, 0.12);
  vibrate([12, 20, 18]);
}

/** Aura maxed: a bright chord opening up, a shimmer arpeggio and an air burst. */
export function sfxAuraMax() {
  const c = audio();
  if (!c || sfxMuted()) return;
  const t0 = c.currentTime;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(300, t0);
  lp.frequency.exponentialRampToValueAtTime(6000, t0 + 0.35);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.02);
  g.gain.setValueAtTime(0.14, t0 + 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.5);
  lp.connect(g).connect(c.destination);
  [220, 277.18, 329.63, 440].forEach((f) => {
    const o = c.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = f;
    o.connect(lp); o.start(t0); o.stop(t0 + 1.55);
  });
  [1046.5, 1318.5, 1568, 2093].forEach((f, k) => tone(f, 500, 'sine', 0.08, 80 + k * 110));
  // Air burst: a short noise hit.
  const len = Math.floor(c.sampleRate * 0.18);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let n = 0; n < len; n++) data[n] = (Math.random() * 2 - 1) * (1 - n / len) ** 2;
  const src = c.createBufferSource();
  const ng = c.createGain();
  src.buffer = buf; ng.gain.value = 0.12;
  src.connect(ng).connect(c.destination); src.start(t0);
  vibrate([20, 30, 20, 30, 90]);
}
