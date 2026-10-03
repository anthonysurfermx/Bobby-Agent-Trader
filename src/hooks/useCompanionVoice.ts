// The companion's voice on the web — same contract as NeuralVoice.swift:
// POST /api/bobby-voice-free {text, lang, voice, vibe} → MP3, played with a
// live level so the 3D companion moves its mouth. Ambient lines (greetings,
// previews) retry once and then stay silent; only an analysis the human is
// waiting for may fall back to the browser's speech synthesis.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ttsLang, speechLocale } from '@/lib/companions/i18n';
import { progressStore } from '@/lib/companions/progress';
import { RISK_NOTICE_VERSION } from '@/lib/companions/progress';

const canGenerateSpeech = () => progressStore.get().aiConsentGranted && progressStore.get().riskNoticeVersion >= RISK_NOTICE_VERSION;

export interface SpeakOptions {
  voice: string;
  vibe?: 'wise' | 'direct' | 'analytical';
  essential?: boolean;
  mode?: 'free';
  playbackRate?: number;
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
    // On an iPhone, sound routed through Web Audio obeys the ring/silent switch, so a phone on silent
    // plays the voice to nobody. There the <audio> element plays on its own (no mouth level).
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!ctxRef.current && !ios) {
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

  // Safari (macOS and iPhone) only lets a page make sound from inside a tap or a key press, and the
  // read's voice arrives seconds after the tap that asked for it. So the first gesture on the page
  // creates and resumes the audio graph and primes the one <audio> element with a silent clip; every
  // later play() on that element, even without a gesture, is then allowed.
  useEffect(() => {
    const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
    let done = false;
    const unlock = () => {
      if (done) return;
      done = true;
      try {
        const audio = ensureAudio();
        void ctxRef.current?.resume?.();
        if (!audio.src || audio.paused) {
          const prev = audio.src;
          audio.src = SILENT;
          void audio.play().then(() => { if (audio.src === SILENT) { audio.pause(); if (prev) audio.src = prev; } }).catch(() => { done = false; });
        }
      } catch { done = false; }
      if (done) off();
    };
    const off = () => { ['pointerdown', 'keydown', 'touchend'].forEach((e) => window.removeEventListener(e, unlock, true)); };
    ['pointerdown', 'keydown', 'touchend'].forEach((e) => window.addEventListener(e, unlock, true));
    return off;
  }, []);

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

  const speakFallback = (text: string, playbackRate: number) => {
    try {
      if (!canGenerateSpeech()) return;
      const gen = generation.current;
      const locale = speechLocale();
      const voices = window.speechSynthesis.getVoices().filter(voice => voice.localService && voice.lang.split('-')[0] === locale.split('-')[0]);
      const voice = voices.find(voice => voice.lang.toLowerCase() === locale.toLowerCase()) ?? voices[0];
      if (!voice) { setSpeaking(false); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = locale;
      u.voice = voice;
      u.rate = playbackRate;
      u.onend = u.onerror = () => { if (gen === generation.current) { setSpeaking(false); stopMeter(); } };
      setSpeaking(true);
      window.speechSynthesis.speak(u);
    } catch { setSpeaking(false); }
  };

  const speak = useCallback(async (text: string, opts: SpeakOptions) => {
    stop();
    if (!canGenerateSpeech()) return;
    const gen = ++generation.current;
    const essential = opts.essential ?? true;
    // Character intros and ambient personality lines should feel snappy;
    // analytical answers keep their deliberate 1× cadence for clarity.
    const playbackRate = Math.min(1.25, Math.max(0.85, opts.playbackRate ?? (essential ? 1 : 1.12)));
    const key = `${opts.mode ?? "default"}|${opts.voice}|${opts.vibe ?? ''}|${speechLocale()}|${text}`;
    try {
      let url = cache.current.get(key);
      if (!url) {
        let blob: Blob | null = null;
        for (let attempt = 0; attempt < 2 && !blob; attempt += 1) {
          if (!canGenerateSpeech() || gen !== generation.current) return;
          const res = await fetch('/api/bobby-voice-free', {
            method: 'POST',
            signal: AbortSignal.timeout(8000),
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, mode: opts.mode, lang: ttsLang(), locale: speechLocale(), voice: opts.voice, ...(opts.vibe ? { vibe: opts.vibe } : {}) }),
          });
          if (gen !== generation.current) return;
          if (res.ok) {
            const b = await res.blob();
            if (b.size > 500) blob = b;
          }
          if (!blob && attempt === 0) await new Promise((r) => setTimeout(r, 1200));
        }
        if (gen !== generation.current) return;
        if (!blob) { if (essential) speakFallback(text, playbackRate); return; }
        url = URL.createObjectURL(blob);
        if (cache.current.size > 40) { const first = cache.current.keys().next().value; if (first) { URL.revokeObjectURL(cache.current.get(first)!); cache.current.delete(first); } }
        cache.current.set(key, url);
      }
      const audio = ensureAudio();
      audio.src = url;
      audio.playbackRate = playbackRate;
      audio.preservesPitch = true;
      audio.onended = () => { if (gen === generation.current) { setSpeaking(false); stopMeter(); } };
      audio.onerror = () => { if (gen === generation.current) { setSpeaking(false); stopMeter(); } };
      await ctxRef.current?.resume?.();
      if (!canGenerateSpeech() || gen !== generation.current) return;
      await audio.play();
      if (!canGenerateSpeech() || gen !== generation.current) { audio.pause(); return; }
      setSpeaking(true);
      meter();
    } catch {
      if (gen === generation.current && essential) speakFallback(text, playbackRate);
    }
  }, [stop]);

  useEffect(() => () => { stop(); }, [stop]);
  useEffect(() => progressStore.subscribe(() => { if (!canGenerateSpeech()) stop(); }), [stop]);

  return { speak, stop, speaking, level, analyser: analyserRef.current };
}
