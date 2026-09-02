// The companion's voice on the web — same contract as NeuralVoice.swift:
// POST /api/bobby-voice-free {text, lang, voice, vibe} → MP3, played with a
// live level so the 3D companion moves its mouth. Ambient lines (greetings,
// previews) retry once and then stay silent; only an analysis the human is
// waiting for may fall back to the browser's speech synthesis.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ttsLang, isSpanish } from '@/lib/companions/i18n';

export interface SpeakOptions {
  voice: string;
  vibe?: 'wise' | 'direct' | 'analytical';
  essential?: boolean;
}

export function useCompanionVoice() {
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number>(0);
  const generation = useRef(0);
  const cache = useRef(new Map<string, string>());

  const stopMeter = () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = 0; setLevel(0); };

  const stop = useCallback(() => {
    generation.current += 1;
    audioRef.current?.pause();
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    setSpeaking(false);
    stopMeter();
  }, []);

  const ensureAudio = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.crossOrigin = 'anonymous';
    }
    if (!ctxRef.current) {
      try {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) {
          ctxRef.current = new Ctor();
          analyserRef.current = ctxRef.current.createAnalyser();
          analyserRef.current.fftSize = 512;
          sourceRef.current = ctxRef.current.createMediaElementSource(audioRef.current);
          sourceRef.current.connect(analyserRef.current);
          analyserRef.current.connect(ctxRef.current.destination);
        }
      } catch { /* no WebAudio: the player still works, no level */ }
    }
    return audioRef.current;
  };

  const meter = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) { const v = (data[i] - 128) / 128; sum += v * v; }
      setLevel(Math.min(1, Math.sqrt(sum / data.length) * 3.2));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const speakFallback = (text: string) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = isSpanish() ? 'es-MX' : 'en-US';
      u.rate = 1;
      u.onend = () => { setSpeaking(false); stopMeter(); };
      setSpeaking(true);
      window.speechSynthesis.speak(u);
    } catch { setSpeaking(false); }
  };

  const speak = useCallback(async (text: string, opts: SpeakOptions) => {
    stop();
    const gen = ++generation.current;
    const essential = opts.essential ?? true;
    const key = `${opts.voice}|${opts.vibe ?? ''}|${ttsLang()}|${text}`;
    try {
      let url = cache.current.get(key);
      if (!url) {
        let blob: Blob | null = null;
        for (let attempt = 0; attempt < 2 && !blob; attempt += 1) {
          const res = await fetch('/api/bobby-voice-free', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, lang: ttsLang(), voice: opts.voice, ...(opts.vibe ? { vibe: opts.vibe } : {}) }),
          });
          if (gen !== generation.current) return;
          if (res.ok) {
            const b = await res.blob();
            if (b.size > 500) blob = b;
          }
          if (!blob && attempt === 0) await new Promise((r) => setTimeout(r, 1200));
        }
        if (gen !== generation.current) return;
        if (!blob) { if (essential) speakFallback(text); return; }
        url = URL.createObjectURL(blob);
        if (cache.current.size > 40) { const first = cache.current.keys().next().value; if (first) { URL.revokeObjectURL(cache.current.get(first)!); cache.current.delete(first); } }
        cache.current.set(key, url);
      }
      const audio = ensureAudio();
      audio.src = url;
      audio.onended = () => { if (gen === generation.current) { setSpeaking(false); stopMeter(); } };
      audio.onerror = () => { if (gen === generation.current) { setSpeaking(false); stopMeter(); } };
      await ctxRef.current?.resume?.();
      await audio.play();
      if (gen !== generation.current) { audio.pause(); return; }
      setSpeaking(true);
      meter();
    } catch {
      if (gen === generation.current && essential) speakFallback(text);
    }
  }, [stop]);

  useEffect(() => () => { stop(); }, [stop]);

  return { speak, stop, speaking, level, analyser: analyserRef.current };
}
