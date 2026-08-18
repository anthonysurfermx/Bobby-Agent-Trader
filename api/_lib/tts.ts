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
  // One consistent Bobby identity across every debate card and fallback path.
  'es:alpha': process.env.TTS_EDGE_VOICE_ES || 'es-MX-DaliaNeural',
  'es:red': process.env.TTS_EDGE_VOICE_ES || 'es-MX-DaliaNeural',
  'es:cio': process.env.TTS_EDGE_VOICE_ES || 'es-MX-DaliaNeural',
  'en:alpha': process.env.TTS_EDGE_VOICE_EN || 'en-US-AriaNeural',
  'en:red': process.env.TTS_EDGE_VOICE_EN || 'en-US-AriaNeural',
  'en:cio': process.env.TTS_EDGE_VOICE_EN || 'en-US-AriaNeural',
};

const MAX_CHARS = 4000;

// Voice menu for per-user agent personalization (Bobby iOS "Configura tu
// Bobby"). STRICT allowlist — the client names a voice, but only these ship
// to edge-tts; anything else falls back to the Bobby identity above.
const EDGE_VOICE_MENU = new Set([
  'es-MX-DaliaNeural',
  'es-MX-JorgeNeural',
  'es-US-PalomaNeural',
  'es-US-AlonsoNeural',
  'en-US-AriaNeural',
  'en-US-GuyNeural',
]);

type TtsProvider = SpeechResult['provider'];

/**
 * Resolve a client-selected Edge voice without ever passing arbitrary input to
 * the synthesizer. An invalid selection deliberately returns Bobby's default
 * identity instead of falling through to an unrelated paid provider voice.
 */
export function resolveEdgeVoice(lang: string, agent = 'cio', edgeVoice?: string): string {
  return (edgeVoice && EDGE_VOICE_MENU.has(edgeVoice))
    ? edgeVoice
    : EDGE_VOICE[`${lang}:${agent}`] || EDGE_VOICE[`${lang}:cio`] || EDGE_VOICE['es:cio'];
}

/**
 * A per-user Edge voice is an explicit product choice, so it takes precedence
 * over the deployment-wide provider preference. Calls without a voice keep the
 * existing provider order for Telegram and other legacy consumers.
 */
export function ttsProviderOrder(provider: string, edgeVoice?: string): TtsProvider[] {
  if (edgeVoice) return ['edge', 'openai'];
  return provider === 'openai' ? ['openai', 'edge'] : ['edge', 'openai'];
}

async function edgeTTS(text: string, lang: string, agent = 'cio', edgeVoice?: string): Promise<SpeechResult> {
  const voice = resolveEdgeVoice(lang, agent, edgeVoice);
  const communicate = new Communicate(text.slice(0, MAX_CHARS), { voice });
  const chunks: Uint8Array[] = [];
  for await (const msg of communicate.stream()) {
    if (msg.type === 'audio' && msg.data) chunks.push(msg.data as Uint8Array);
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

async function openaiTTS(text: string, _lang: string, _agent?: string, _edgeVoice?: string): Promise<SpeechResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('openai-tts: OPENAI_API_KEY missing');
  const model = process.env.TTS_OPENAI_MODEL || 'gpt-4o-mini-tts';
  const body: Record<string, unknown> = {
    model,
    voice: process.env.TTS_OPENAI_VOICE || 'ash',
    input: text.slice(0, MAX_CHARS),
    response_format: 'opus',
  };
  // gpt-4o-mini-tts steers delivery via `instructions`; tts-1 only has `speed`.
  if (model.includes('gpt-4o')) {
    body.instructions = process.env.TTS_INSTRUCTIONS ||
      'Habla con MUCHA energía, entusiasmo y un ritmo ágil y rápido. Eres un analista de trading seguro, dinámico y motivador, con urgencia, como quien suelta una señal caliente en vivo. Proyecta confianza y emoción. Nada monótono, nada lento.';
  } else {
    body.speed = Number(process.env.TTS_SPEED || '1.12');
  }
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
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
  opts: { lang?: string; voice?: string; edgeVoice?: string } = {},
): Promise<SpeechResult | null> {
  const lang = opts.lang || 'es';
  const agent = opts.voice === 'alpha' || opts.voice === 'red' ? opts.voice : 'cio';
  const clean = (text || '').trim();
  if (!clean) return null;

  const provider = (process.env.TTS_PROVIDER || 'edge').toLowerCase();
  const providers = { edge: edgeTTS, openai: openaiTTS } as const;
  const chain = ttsProviderOrder(provider, opts.edgeVoice).map((name) => providers[name]);

  for (const fn of chain) {
    try {
      return await fn(clean, lang, agent, opts.edgeVoice);
    } catch (err) {
      console.error('[tts]', fn.name, err instanceof Error ? err.message : err);
    }
  }
  return null;
}
