// ============================================================
// useBobbyVoice — Hook that orchestrates Bobby's vocal presence
// Manages: ElevenLabs API calls, IndexedDB caching, AudioContext + AnalyserNode
// Smart routing: ElevenLabs for key moments, Web Speech API for fillers
// Sentence-level streaming: Bobby speaks first sentence while LLM still generates
// Returns: speak(), speakLocal(), queueSentence(), flushQueue(), stop()
// ============================================================

import { useState, useRef, useCallback, useEffect } from 'react';
import { getConfiguredVoice } from '@/lib/agent-voice';

// ---- IndexedDB cache for audio blobs ----

const DB_NAME = 'bobby_voice_cache';
const STORE_NAME = 'audio';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return 'v_' + Math.abs(hash).toString(36);
}

// SHA-256 cache keys (128-bit prefix) — the 32-bit hash could collide and
// play the wrong audio. Falls back to the weak hash on http dev origins.
async function cacheKeyFor(input: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
      return 'v_' + Array.from(new Uint8Array(digest).slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch { /* insecure context — fall through */ }
  return hashText(input);
}

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCachedAudio(key: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const result = req.result;
        if (result && (Date.now() - result.timestamp) < CACHE_TTL) {
          resolve(result.data);
        } else {
          if (result) store.delete(key); // expired — actually free the bytes
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

const CACHE_MAX_ENTRIES = 200;

async function setCachedAudio(key: string, data: ArrayBuffer): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ key, data, timestamp: Date.now() });
    // Bounded cache: evict the oldest entries past the cap
    const countReq = store.count();
    countReq.onsuccess = () => {
      const excess = countReq.result - CACHE_MAX_ENTRIES;
      if (excess <= 0) return;
      const entries: Array<{ key: string; timestamp: number }> = [];
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          entries.push({ key: cursor.value.key, timestamp: cursor.value.timestamp });
          cursor.continue();
        } else {
          entries.sort((a, b) => a.timestamp - b.timestamp);
          for (const e of entries.slice(0, excess)) store.delete(e.key);
        }
      };
    };
  } catch { /* silent */ }
}

// ---- Fetch audio: warm OpenAI TTS (server picks provider, MP3 for web) ----
// Browser speechSynthesis was removed on purpose — the robotic iOS voice
// is exactly what Bobby must never sound like. Silence beats robot.

// The agent's configured vibe modulates TTS delivery style server-side
function getAgentVibe(): string | undefined {
  try {
    const raw = localStorage.getItem('agent_profile');
    if (!raw) return undefined;
    const p = JSON.parse(raw);
    return typeof p?.personality === 'string' ? p.personality : undefined;
  } catch { return undefined; }
}

// In-flight TTS fetches — stop() aborts them so cancelled speech can't
// keep downloading (or play) after the user cut it off
const activeVoiceFetches = new Set<AbortController>();

export function abortActiveVoiceFetches(): void {
  for (const c of activeVoiceFetches) c.abort();
  activeVoiceFetches.clear();
}

async function fetchAudio(text: string, voice?: string, lang?: string): Promise<ArrayBuffer | null> {
  const vibe = getAgentVibe();
  // 'cio' is the personal agent speaking — honor the persona voice the
  // user picked in onboarding. alpha/red stay theatrical debate voices.
  const requested = voice || 'cio';
  const effectiveVoice = requested === 'cio' ? (getConfiguredVoice() || 'cio') : requested;
  const cacheKey = await cacheKeyFor(text + '|' + effectiveVoice + '|' + (lang || 'en') + '|' + (vibe || ''));
  const cached = await getCachedAudio(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  activeVoiceFetches.add(controller);
  try {
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
    const res = await fetch('/api/bobby-voice-free', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: effectiveVoice, lang: lang || 'en', vibe }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.arrayBuffer();
    await setCachedAudio(cacheKey, data);
    return data;
  } catch {
    return null;
  } finally {
    activeVoiceFetches.delete(controller);
  }
}

// ---- Hook ----

export interface BobbyVoiceState {
  speak: (text: string) => Promise<void>;
  speakLocal: (text: string, lang?: string) => Promise<void>;
  queueSentence: (sentence: string, voice?: string, lang?: string) => void;
  flushQueue: () => void;
  stop: () => void;
  initVoiceContext: () => void;
  getLastResponseAudio: () => Blob | null;
  clearResponseAudio: () => void;
  hasResponseAudio: boolean;
  voiceBlocked: boolean;
  isSpeaking: boolean;
  analyser: AnalyserNode | null;
  audioElement: HTMLAudioElement | null;
}

// Tiny silent MP3 (0.1s) — used to "warm up" the Audio element on user gesture
const SILENT_MP3 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAABhgAAAAAAAAAAAAAAAAD/+0DEAAAAAANIAAAAAAAADSAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7QMQAAAAADQAAAAAAAAAA';

export function useBobbyVoice(): BobbyVoiceState {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceBlocked, setVoiceBlocked] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  // Settles the in-flight playAudioData promise on stop() — otherwise an
  // interrupted playback leaves its queue processor suspended forever
  const playbackSettleRef = useRef<(() => void) | null>(null);

  // ---- Sentence queue for streaming TTS ----
  // Sentences are fetched in parallel, played sequentially
  const sentenceQueueRef = useRef<Array<{ text: string; audio: Promise<ArrayBuffer | null> }>>([]);
  const isPlayingQueueRef = useRef(false);
  const queueStoppedRef = useRef(false);
  // Monotonic generation: stop() bumps it so a processor awaiting an old
  // fetch can never resurrect cancelled speech
  const queueGenerationRef = useRef(0);

  // ---- Response audio accumulator (for voice note sharing) ----
  const responseAudioChunksRef = useRef<ArrayBuffer[]>([]);
  const [hasResponseAudio, setHasResponseAudio] = useState(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      queueStoppedRef.current = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
    };
  }, []);

  // ---- Init voice context: MUST be called on user gesture (click/tap) ----
  // This "warms up" the AudioContext and Audio element so future play() calls work
  const voiceInitializedRef = useRef(false);
  const initVoiceContext = useCallback(() => {
    if (voiceInitializedRef.current) return;
    voiceInitializedRef.current = true;

    // 1. Create and warm up Audio element with silent MP3
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    audioRef.current.src = SILENT_MP3;
    audioRef.current.play().then(() => {
      audioRef.current!.pause();
      audioRef.current!.currentTime = 0;
      setVoiceBlocked(false);
    }).catch(() => {
      setVoiceBlocked(true);
    });

    // 2. Create and resume AudioContext
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
    } catch { /* non-critical */ }
  }, []);

  // ---- Shared audio playback (used by speak + queue) ----

  const playAudioData = useCallback((audioData: ArrayBuffer): Promise<void> => {
    return new Promise((resolve, reject) => {
      const blob = new Blob([audioData], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);

      // Revoke previous
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;

      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio();
        audioRef.current = audio;
      }
      audio.src = url;
      setAudioElement(audio);

      // Set up AudioContext + AnalyserNode for visualizer
      try {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') ctx.resume();

        if (!sourceRef.current) {
          const source = ctx.createMediaElementSource(audio);
          const analyserNode = ctx.createAnalyser();
          analyserNode.fftSize = 64;
          source.connect(analyserNode);
          analyserNode.connect(ctx.destination);
          sourceRef.current = source;
          setAnalyser(analyserNode);
        }
      } catch { /* AudioContext not critical */ }

      setIsSpeaking(true);
      playbackSettleRef.current = () => {
        playbackSettleRef.current = null;
        resolve();
      };
      audio.onended = () => {
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
        playbackSettleRef.current = null;
        resolve();
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        playbackSettleRef.current = null;
        reject(new Error('Audio playback error'));
      };

      audio.play().catch(() => {
        setIsSpeaking(false);
        setVoiceBlocked(true);
        reject(new Error('Audio play failed — browser blocked autoplay'));
      });
    });
  }, []);

  // ---- Queue processor: plays sentences sequentially ----

  const processQueue = useCallback(async () => {
    if (isPlayingQueueRef.current) return; // Already processing
    isPlayingQueueRef.current = true;
    const generation = queueGenerationRef.current;

    while (sentenceQueueRef.current.length > 0) {
      if (queueStoppedRef.current || generation !== queueGenerationRef.current) break;

      const item = sentenceQueueRef.current.shift()!;
      let audioData: ArrayBuffer | null = null;
      try {
        audioData = await item.audio;
      } catch (e) {
        console.warn('[Voice] Audio fetch failed for sentence, skipping:', e);
        continue;
      }

      if (queueStoppedRef.current || generation !== queueGenerationRef.current) break;
      if (!audioData || audioData.byteLength < 100) continue; // Skip failed/empty fetches

      // Accumulate for voice note sharing
      responseAudioChunksRef.current.push(audioData);
      setHasResponseAudio(true);

      try {
        await playAudioData(audioData);
      } catch (e) {
        console.warn('[Voice] Playback failed, continuing queue:', e);
        continue;
      }
    }

    isPlayingQueueRef.current = false;
    // Only set not speaking if queue is truly empty and nothing else playing
    if (sentenceQueueRef.current.length === 0) {
      setIsSpeaking(false);
    }
  }, [playAudioData]);

  const stop = useCallback(() => {
    // Clear the sentence queue and invalidate any in-flight processor
    queueGenerationRef.current++;
    abortActiveVoiceFetches();
    queueStoppedRef.current = true;
    sentenceQueueRef.current = [];
    isPlayingQueueRef.current = false;

    // Stop current audio and settle its pending playback promise
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    playbackSettleRef.current?.();
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setIsSpeaking(false);

    // Reset stop flag after a tick so new queues can start
    setTimeout(() => { queueStoppedRef.current = false; }, 0);
  }, []);

  // ---- Queue a single sentence for streaming TTS ----
  // Fetches audio immediately (parallel with other sentences)
  // Plays in order as audio becomes available

  const queueSentence = useCallback((sentence: string, voice?: string, lang?: string) => {
    const clean = sentence.replace(/[-*_#>]/g, '').replace(/\n+/g, ' ').trim();
    if (clean.length < 8) return; // Skip trivial fragments

    // Start fetching audio immediately (non-blocking) — voice selects Alpha/Red/CIO
    const audioPromise = fetchAudio(clean, voice, lang);

    sentenceQueueRef.current.push({ text: clean, audio: audioPromise });
    setIsSpeaking(true);

    // Kick off the processor if not already running
    processQueue();
  }, [processQueue]);

  // ---- Flush: signal that no more sentences will be added ----
  // (Currently a no-op since processQueue auto-drains, but useful for signaling)

  const flushQueue = useCallback(() => {
    // If queue is empty and not playing, mark done
    if (sentenceQueueRef.current.length === 0 && !isPlayingQueueRef.current) {
      setIsSpeaking(false);
    }
  }, []);

  // ---- Voice note sharing: concatenate all sentence audio into one blob ----

  const getLastResponseAudio = useCallback((): Blob | null => {
    const chunks = responseAudioChunksRef.current;
    if (chunks.length === 0) return null;
    // Concatenate all MP3 chunks — MP3 is frame-based so raw concat works
    return new Blob(chunks, { type: 'audio/mpeg' });
  }, []);

  const clearResponseAudio = useCallback(() => {
    responseAudioChunksRef.current = [];
    setHasResponseAudio(false);
  }, []);

  // ---- Full text speak (legacy — for greetings, one-shot phrases) ----

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    stop();

    const audioData = await fetchAudio(text);
    if (!audioData) return;

    try {
      await playAudioData(audioData);
    } catch { /* silent */ }
    setIsSpeaking(false);
  }, [stop, playAudioData]);

  // Local speak — changed to use regular voice queue for Hackathon Demo to guarantee Edge TTS
  const speakLocal = useCallback(async (text: string, lang: string = 'en') => {
    if (!text.trim()) return;
    stop();
    queueSentence(text, 'cio', lang);
  }, [stop, queueSentence]);

  return { speak, speakLocal, queueSentence, flushQueue, stop, initVoiceContext, getLastResponseAudio, clearResponseAudio, hasResponseAudio, voiceBlocked, isSpeaking, analyser, audioElement };
}
