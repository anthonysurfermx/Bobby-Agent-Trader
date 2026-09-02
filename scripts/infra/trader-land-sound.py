#!/usr/bin/env python3
"""Trader Land sound family v01 — synthesized (no Higgsfield), 48 kHz / 24-bit stereo WAV.
Design (v0.2 brief + Codex v0.3): orbital, technological, calm. Fundamental 90-140 Hz so phone speakers
reproduce it, harmonics 220-420 Hz, sub 55 Hz only as an option for headphones. No casino cues.
Loudness targets are RMS dBFS approximations (ambience -24, one-shots -18..-14); final LUFS at mix."""
import numpy as np, wave, json, struct, os
SR = 48000; OUT = 'public/land/v1/audio'; os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)

def env(n, a, d, r, sus=0.6):
    e = np.full(n, sus); A, D, R = int(a*SR), int(d*SR), int(r*SR)
    if A: e[:A] = np.linspace(0, 1, A)
    if D: e[A:A+D] = np.linspace(1, sus, D)
    if R: e[n-R:] = np.linspace(sus, 0, R)
    return e
def sine(f, n): return np.sin(2*np.pi*f*np.arange(n)/SR)
def lowpass(x, cutoff):
    """One-pole lowpass; cutoff may be a scalar or a per-sample array (time-varying)."""
    c = np.broadcast_to(np.asarray(cutoff, np.float64), x.shape) if np.ndim(cutoff) else np.full(x.shape, float(cutoff))
    k = np.exp(-2*np.pi*c/SR); y = np.zeros_like(x)
    for i in range(1, len(x)): y[i] = k[i]*y[i-1] + (1-k[i])*x[i]
    return y
def noise(n): return rng.standard_normal(n)
def write(name, x, target_db):
    x = np.asarray(x, np.float64); x = x / max(1e-9, np.abs(x).max()); rms = np.sqrt(np.mean(x**2) + 1e-12)
    x = np.clip(x * (10**(target_db/20) / rms), -0.98, 0.98)
    if x.ndim == 1: x = np.stack([x, x], 1)
    data = (x * 8388607).astype(np.int32).flatten()
    with wave.open(f'{OUT}/{name}.wav', 'wb') as w:
        w.setnchannels(2); w.setsampwidth(3); w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<i', int(v))[:3] for v in data))
    return {'file': f'/land/v1/audio/{name}.wav', 'seconds': round(x.shape[0]/SR, 2), 'rms_dbfs': target_db}

cues = {}
# land_enter_vrum 0.7 s: fundamental sweeps 90→140 Hz, harmonics, airy tail
n = int(0.7*SR); t = np.arange(n)/SR; f = 90 + 50*(t/0.7)**0.6; ph = 2*np.pi*np.cumsum(f)/SR
vrum = np.sin(ph) + 0.45*np.sin(2*ph+0.3) + 0.25*np.sin(3*ph) + 0.12*np.sin(4.5*ph)
cues['land_enter_vrum'] = write('land_enter_vrum', vrum*env(n, 0.05, 0.2, 0.25, 0.9) + lowpass(noise(n), 3200)*np.linspace(0, 1, n)**2*0.35, -16)
# aura_core_loop 16 s seamless: 110 Hz + 55 Hz sub + harmonics, one LFO cycle per loop
n = 16*SR; t = np.arange(n)/SR; lfo = 0.5 + 0.5*np.sin(2*np.pi*t/16)
hum = (0.9*sine(110, n) + 0.35*sine(55, n) + 0.3*sine(220, n)*(0.7+0.3*lfo) + 0.18*sine(330, n)*lfo + 0.1*sine(440, n)*(1-lfo)) * (0.85 + 0.15*lfo)
cues['aura_core_loop'] = write('aura_core_loop', hum, -24)
# orbit whooshes: filtered noise, slow stereo crossing, three heights
for name, fc, dur, d in [('orbit_whoosh_a', 900, 1.4, 1), ('orbit_whoosh_b', 1400, 1.6, -1), ('orbit_whoosh_c', 600, 1.9, 1)]:
    n = int(dur*SR); t = np.arange(n)/SR; x = lowpass(noise(n), fc) * np.sin(np.pi*t/dur)**2
    pan = np.linspace(0.15, 0.85, n) if d > 0 else np.linspace(0.85, 0.15, n)
    cues[name] = write(name, np.stack([x*(1-pan), x*pan], 1), -22)
# seed_reveal 0.9 s: three soft ascending notes, no jackpot
n = int(0.9*SR); x = np.zeros(n)
for i, f in enumerate([329.6, 392.0, 493.9]):
    s = int(i*0.22*SR); m = min(int(0.5*SR), n-s); x[s:s+m] += ((sine(f, m) + 0.3*sine(2*f, m)) * env(m, 0.01, 0.1, 0.3, 0.5))
cues['seed_reveal'] = write('seed_reveal', x, -18)
# placement_tick 80 ms wood/metal click at 720 Hz
n = int(0.08*SR); cues['placement_tick'] = write('placement_tick', (sine(720, n) + 0.4*sine(2100, n)) * np.exp(-np.arange(n)/(0.012*SR)), -16)
# placement_invalid 120 ms damped thunk, no alarm
n = int(0.12*SR); cues['placement_invalid'] = write('placement_invalid', lowpass(sine(140, n)*np.exp(-np.arange(n)/(0.03*SR)) + 0.3*lowpass(noise(n), 500)*np.exp(-np.arange(n)/(0.02*SR)), 900), -20)
# placement_confirm 0.45 s: mechanical latch + aura pulse at 120 Hz
n = int(0.45*SR); t = np.arange(n)/SR
cues['placement_confirm'] = write('placement_confirm', (sine(520, n) + 0.5*sine(1560, n))*np.exp(-t/0.02) + sine(120, n)*np.sin(np.pi*np.clip((t-0.05)/0.4, 0, 1))**1.5*0.9, -17)
# bloom_complete 1.4 s: open chord A3 C#4 E4 A4, filter opening, orbital shimmer
n = int(1.4*SR); t = np.arange(n)/SR
chord = sum(sine(f, n)*w for f, w in [(220, 1), (277.2, 0.7), (329.6, 0.7), (440, 0.5)])
cues['bloom_complete'] = write('bloom_complete', lowpass(chord, 600 + 3400*np.clip(t/0.6, 0, 1))*env(n, 0.08, 0.3, 0.5, 0.7) + lowpass(noise(n), 2500)*0.12*np.sin(np.pi*t/1.4), -17)
# fog_reveal 1.8 s: wide sweep + air, stereo widening
n = int(1.8*SR); t = np.arange(n)/SR; sw = lowpass(noise(n), 400 + 2200*(t/1.8)) * np.sin(np.pi*t/1.8)
cues['fog_reveal'] = write('fog_reveal', np.stack([sw*(0.6+0.4*np.cos(np.pi*t/1.8)), sw*(0.6-0.4*np.cos(np.pi*t/1.8))], 1), -20)
# five_attributes_chord 2.2 s: five harmonics enter one by one (one per attribution)
n = int(2.2*SR); t = np.arange(n)/SR; x = sum(sine(f, n)*np.clip((t-0.3*i)/0.25, 0, 1)*(1-0.12*i) for i, f in enumerate([110, 220, 330, 440, 550]))
cues['five_attributes_chord'] = write('five_attributes_chord', x*env(n, 0.01, 0.1, 0.6, 0.9), -18)
json.dump({'version': 'v01', 'sample_rate': SR, 'bit_depth': 24, 'channels': 2,
           'design': 'orbital/tech/calm; fundamental 90-140 Hz (phone speakers), harmonics 220-420 Hz, sub 55 Hz for headphones only; no casino cues; aura_core_loop is a seamless 16 s loop (one LFO cycle); respect mute, silent mode, reduce motion and voice ducking 8-12 dB',
           'cues': cues}, open(f'{OUT}/audio-manifest.json', 'w'), indent=2)
print(json.dumps({k: v['seconds'] for k, v in cues.items()})); print('total KB', sum(os.path.getsize(f'{OUT}/{f}') for f in os.listdir(OUT))//1024)
