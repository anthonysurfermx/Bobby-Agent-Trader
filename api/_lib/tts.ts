// ============================================================
// api/_lib/tts.ts — Unified Text-to-Speech for Bobby
// ------------------------------------------------------------
// Free by default: in-process Microsoft Edge Neural voices
// (edge-tts-universal handles the Sec-MS-GEC anti-bot token).
// No external droplet, no single point of failure.
//
// Optional premium: OpenAI TTS with response_format=opus, which
// yields native OGG/Opus → a TRUE Telegram voice-note bubble.
// Switch with TTS_PROVIDER=openai (uses existing OPENAI_API_KEY).
//
// Edge output is MP3 → delivered as a playable audio clip.
// OpenAI opus output → delivered as a voice-note bubble.
// ============================================================

import { Communicate } from 'edge-tts-universal';

export interface SpeechResult {
  audio: Buffer;
  /** How Telegram should deliver it. sendVoice needs OGG/Opus. */
  telegramMethod: 'sendVoice' | 'sendAudio';
  mime: string;
  filename: string;
  provider: 'edge' | 'openai';
}

// Deep, authoritative neural voices — the "Bobby Axelrod" tone.
const EDGE_VOICE: Record<string, string> = {
  es: process.env.TTS_EDGE_VOICE_ES || 'es-MX-JorgeNeural',
  en: process.env.TTS_EDGE_VOICE_EN || 'en-US-GuyNeural',
};

const MAX_CHARS = 4000;

async function edgeTTS(text: string, lang: string): Promise<SpeechResult> {
  const voice = EDGE_VOICE[lang] || EDGE_VOICE.es;
  const communicate = new Communicate(text.slice(0, MAX_CHARS), { voice });
  const chunks: Buffer[] = [];
  for await (const msg of communicate.stream()) {
    if (msg.type === 'audio' && msg.data) chunks.push(Buffer.from(msg.data));
  }
  if (chunks.length === 0) throw new Error('edge-tts: empty audio stream');
  return {
    audio: Buffer.concat(chunks),
    telegramMethod: 'sendAudio',
    mime: 'audio/mpeg',
    filename: 'bobby-analysis.mp3',
    provider: 'edge',
  };
}

async function openaiTTS(text: string, _lang: string): Promise<SpeechResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('openai-tts: OPENAI_API_KEY missing');
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.TTS_OPENAI_MODEL || 'gpt-4o-mini-tts',
      voice: process.env.TTS_OPENAI_VOICE || 'onyx',
      input: text.slice(0, MAX_CHARS),
      response_format: 'opus',
    }),
  });
  if (!res.ok) throw new Error(`openai-tts ${res.status}: ${(await res.text()).slice(0, 180)}`);
  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.length === 0) throw new Error('openai-tts: empty audio');
  return {
    audio,
    telegramMethod: 'sendVoice',
    mime: 'audio/ogg',
    filename: 'bobby-analysis.ogg',
    provider: 'openai',
  };
}

/**
 * Generate speech with automatic provider fallback.
 * Default chain: free Edge first, OpenAI as backup. Set TTS_PROVIDER=openai
 * to prefer the voice-note bubble (Edge stays as the $0 safety net).
 * Returns null only if every provider fails.
 */
export async function generateSpeech(
  text: string,
  opts: { lang?: string } = {},
): Promise<SpeechResult | null> {
  const lang = opts.lang || 'es';
  const clean = (text || '').trim();
  if (!clean) return null;

  const provider = (process.env.TTS_PROVIDER || 'edge').toLowerCase();
  const chain = provider === 'openai' ? [openaiTTS, edgeTTS] : [edgeTTS, openaiTTS];

  for (const fn of chain) {
    try {
      return await fn(clean, lang);
    } catch (err) {
      console.error('[tts]', fn.name, err instanceof Error ? err.message : err);
    }
  }
  return null;
}
