// ============================================================
// useBobbyVoice — Hook that orchestrates Bobby's vocal presence
// Manages: ElevenLabs API calls, IndexedDB caching, AudioContext + AnalyserNode
// Smart routing: ElevenLabs for key moments, Web Speech API for fillers
// Sentence-level streaming: Bobby speaks first sentence while LLM still generates
// Returns: speak(), speakLocal(), queueSentence(), flushQueue(), stop()
// ============================================================

import { useState, useRef, useCallback, useEffect } from 'react';

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
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const result = req.result;
        if (result && (Date.now() - result.timestamp) < CACHE_TTL) {
          resolve(result.data);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function setCachedAudio(key: string, data: ArrayBuffer): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ key, data, timestamp: Date.now() });
  } catch { /* silent */ }
}

// ---- Fetch audio: ElevenLabs → Edge TTS (free) fallback chain ----

let useFreeTTS = false; // Once ElevenLabs fails, switch to free for the session

async function fetchAudio(text: string, voice?: string, lang?: string): Promise<ArrayBuffer | null> {
  const cacheKey = hashText(text + (voice || 'cio') + (lang || 'en'));
  const cached = await getCachedAudio(cacheKey);
  if (cached) return cached;

  // Codex P1: Skip ElevenLabs for Spanish — ElevenLabs voices are English only
  // Edge TTS has native Mexican voices (Jorge, Dalia) that sound much better
  if (!useFreeTTS && lang !== 'es') {
    try {
      const res = await fetch('/api/bobby-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: voice || 'cio' }),
      });
      if (res.ok) {
        const data = await res.arrayBuffer();
        await setCachedAudio(cacheKey, data);
        return data;
      }
      console.warn('[Voice] ElevenLabs unavailable, switching to free TTS');
      useFreeTTS = true;
    } catch {
      useFreeTTS = true;
    }
  }

  // Fallback: Edge TTS (Microsoft Neural, free forever) via Vercel proxy → DO droplet
  try {
    const res = await fetch('/api/bobby-voice-free', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: voice || 'cio', lang: lang || 'en' }),
    });
    if (!res.ok) return null;
    const data = await res.arrayBuffer();
    await setCachedAudio(cacheKey, data);
    return data;
  } catch { return null; }
}

// ---- Web Speech API wrapper for free local TTS (fillers, short text) ----

function speakWithBrowserTTS(text: string, lang: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) { resolve(); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'es' ? 'es-MX' : lang === 'pt' ? 'pt-BR' : 'en-US';
    utterance.rate = 1.05;
    utterance.pitch = 0.95;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

// ---- Hook ----

export interface BobbyVoiceState {
  speak: (text: string) => Promise<void>;
  speakLocal: (text: string, lang?: string) => Promise<void>;
  queueSentence: (sentence: string, voice?: string, lang?: string) => void;
  flushQueue: () => void;
  stop: () => void;
  getLastResponseAudio: () => Blob | null;
  clearResponseAudio: () => void;
  hasResponseAudio: boolean;
  isSpeaking: boolean;
  analyser: AnalyserNode | null;
  audioElement: HTMLAudioElement | null;
}

export function useBobbyVoice(): BobbyVoiceState {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // ---- Sentence queue for streaming TTS ----
  // Sentences are fetched in parallel, played sequentially
  const sentenceQueueRef = useRef<Array<{ text: string; audio: Promise<ArrayBuffer | null> }>>([]);
  const isPlayingQueueRef = useRef(false);
  const queueStoppedRef = useRef(false);

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
      audio.onended = () => {
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
        resolve();
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        reject(new Error('Audio playback error'));
      };

      audio.play().catch(() => {
        setIsSpeaking(false);
        reject(new Error('Audio play failed'));
      });
    });
  }, []);

  // ---- Queue processor: plays sentences sequentially ----

  const processQueue = useCallback(async () => {
    if (isPlayingQueueRef.current) return; // Already processing
    isPlayingQueueRef.current = true;

    while (sentenceQueueRef.current.length > 0) {
      if (queueStoppedRef.current) break;

      const item = sentenceQueueRef.current.shift()!;
      let audioData: ArrayBuffer | null = null;
      try {
        audioData = await item.audio;
      } catch (e) {
        console.warn('[Voice] Audio fetch failed for sentence, skipping:', e);
        continue;
      }

      if (queueStoppedRef.current) break;
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
    // Clear the sentence queue
    queueStoppedRef.current = true;
    sentenceQueueRef.current = [];
    isPlayingQueueRef.current = false;

    // Stop ElevenLabs audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    // Stop browser TTS
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
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

  return { speak, speakLocal, queueSentence, flushQueue, stop, getLastResponseAudio, clearResponseAudio, hasResponseAudio, isSpeaking, analyser, audioElement };
}
