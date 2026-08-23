// ============================================================
// api/_lib/tts.ts — Unified Text-to-Speech for Bobby
// ------------------------------------------------------------
// Default: OpenAI gpt-4o-mini-tts with warm, close `instructions`
// (the "bestie" voice — never robotic). Falls back to free
// Microsoft Edge Neural voices if OpenAI fails or has no key.
// Force the free chain with TTS_PROVIDER=edge.
//
// Voice personas map to OpenAI voices; legacy ids still work:
//   coral (cálida) · ballad (chill) · sage (serena) · ash (táctico)
//   male → ash · female → coral · alpha/red/cio → agent voices
//
// Format: 'opus' (default) yields a TRUE Telegram voice-note
// bubble; 'mp3' is for web playback (Safari iOS can't play opus).
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

export interface SpeechOptions {
  lang?: string;
  /** Voice persona id: coral | ballad | sage | ash | male | female | alpha | red | cio */
  voice?: string;
  /** Agent vibe — modulates delivery style: direct | analytical | wise */
  vibe?: string;
  /** opus → Telegram voice-note bubble; mp3 → web-safe playback */
  format?: 'opus' | 'mp3';
  /** Per-call provider override (e.g. degrade to free Edge when a global
   *  spend budget is exhausted). Beats TTS_PROVIDER and the key-based default. */
  provider?: 'openai' | 'edge';
}

// ---- Voice persona mapping ----

const OPENAI_VOICES = ['coral', 'ballad', 'sage', 'ash', 'alloy', 'echo', 'shimmer', 'verse'];

function resolveOpenAIVoice(voice?: string): string {
  if (voice && OPENAI_VOICES.includes(voice)) return voice;
  switch (voice) {
    case 'female': return 'coral';
    case 'male': return 'ash';
    case 'alpha': return 'verse';   // opportunity hunter — lively
    case 'red': return 'sage';      // risk voice — calm, firm
    case 'cio': return 'ash';       // the boss — sober, warm
    default: return process.env.TTS_OPENAI_VOICE || 'coral';
  }
}

// ---- Delivery style instructions (the anti-robot layer) ----

const BASE_INSTRUCTIONS: Record<string, string> = {
  es: 'Habla en español mexicano neutral. Suena como una amistad de confianza: voz cálida, cercana, suave y segura. Ritmo conversacional relajado, con pausas breves y naturales. Sonríe sutilmente al saludar o celebrar; baja el tono y habla más despacio al mencionar riesgo o pérdidas. Pronuncia siglas y números con claridad. Evita por completo el tono de locutor, de asistente corporativo o de robot. Sin muletillas.',
  en: 'Speak like a trusted friend: warm, close, soft and confident. Relaxed conversational pace with brief natural pauses. Smile subtly when greeting or celebrating; lower your tone and slow down when mentioning risk or losses. Pronounce tickers and numbers clearly. Never sound like an announcer, a corporate assistant, or a robot. No filler words.',
  pt: 'Fale em português brasileiro. Soe como uma amizade de confiança: voz calorosa, próxima, suave e segura. Ritmo de conversa relaxado, com pausas breves e naturais. Sorria sutilmente ao cumprimentar; abaixe o tom ao falar de risco. Nunca soe como locutor, assistente corporativo ou robô.',
};

const VIBE_INSTRUCTIONS: Record<string, Record<string, string>> = {
  direct: {
    es: ' Energía un poco más viva y franca: di las cosas sin rodeos, pero siempre con calidez, nunca agresivo.',
    en: ' Slightly livelier and franker energy: say it straight, but always warm, never aggressive.',
    pt: ' Energia um pouco mais viva e franca: fale sem rodeios, mas sempre com calor humano.',
  },
  analytical: {
    es: ' Frases claras y concentradas, dicción precisa. Prioriza datos, riesgo y siguiente paso, sin sonar frío.',
    en: ' Clear, focused sentences with precise diction. Prioritize data, risk and next step, without sounding cold.',
    pt: ' Frases claras e concentradas, dicção precisa. Priorize dados e risco, sem soar frio.',
  },
  wise: {
    es: ' Tono sereno y cómplice, como quien explica con calma y sin juzgar. Transmite: "te cuido la espalda".',
    en: ' Serene, understanding tone, explaining calmly without judging. The feeling: "I\'ve got your back".',
    pt: ' Tom sereno e cúmplice, explicando com calma e sem julgar.',
  },
};

function buildInstructions(lang: string, vibe?: string): string {
  const base = process.env.TTS_INSTRUCTIONS || BASE_INSTRUCTIONS[lang] || BASE_INSTRUCTIONS.es;
  const extra = vibe && VIBE_INSTRUCTIONS[vibe] ? (VIBE_INSTRUCTIONS[vibe][lang] || VIBE_INSTRUCTIONS[vibe].es) : '';
  return base + extra;
}

// ---- Edge TTS (free fallback) ----

const EDGE_VOICE: Record<string, string> = {
  es: process.env.TTS_EDGE_VOICE_ES || 'es-MX-DaliaNeural',
  en: process.env.TTS_EDGE_VOICE_EN || 'en-US-AriaNeural',
  pt: process.env.TTS_EDGE_VOICE_PT || 'pt-BR-FranciscaNeural',
};

const MAX_CHARS = 4000;

async function edgeTTS(text: string, opts: Required<Pick<SpeechOptions, 'lang' | 'format'>>): Promise<SpeechResult> {
  const voice = EDGE_VOICE[opts.lang] || EDGE_VOICE.es;
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

// ---- OpenAI TTS (warm default) ----

async function openaiTTS(text: string, opts: Required<Pick<SpeechOptions, 'lang' | 'format'>> & Pick<SpeechOptions, 'voice' | 'vibe'>): Promise<SpeechResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('openai-tts: OPENAI_API_KEY missing');
  const model = process.env.TTS_OPENAI_MODEL || 'gpt-4o-mini-tts';
  const body: Record<string, unknown> = {
    model,
    voice: resolveOpenAIVoice(opts.voice),
    input: text.slice(0, MAX_CHARS),
    response_format: opts.format,
  };
  // gpt-4o-mini-tts steers delivery via `instructions`; tts-1 only has `speed`.
  if (model.includes('gpt-4o')) {
    body.instructions = buildInstructions(opts.lang, opts.vibe);
  } else {
    body.speed = Number(process.env.TTS_SPEED || '1.0');
  }
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`openai-tts ${res.status}: ${(await res.text()).slice(0, 180)}`);
  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.length === 0) throw new Error('openai-tts: empty audio');
  const isOpus = opts.format === 'opus';
  return {
    audio,
    telegramMethod: isOpus ? 'sendVoice' : 'sendAudio',
    mime: isOpus ? 'audio/ogg' : 'audio/mpeg',
    filename: isOpus ? 'bobby-analysis.ogg' : 'bobby-analysis.mp3',
    provider: 'openai',
  };
}

/**
 * Generate speech with automatic provider fallback.
 * Default chain: OpenAI warm voice first (when OPENAI_API_KEY exists),
 * free Edge Neural as the $0 safety net. Set TTS_PROVIDER=edge to
 * flip the order and keep OpenAI as backup only.
 * Returns null only if every provider fails.
 */
export async function generateSpeech(
  text: string,
  opts: SpeechOptions = {},
): Promise<SpeechResult | null> {
  const clean = (text || '').trim();
  if (!clean) return null;

  const resolved = {
    lang: opts.lang || 'es',
    format: opts.format || 'opus' as const,
    voice: opts.voice,
    vibe: opts.vibe,
  };

  const provider = (opts.provider || process.env.TTS_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : 'edge')).toLowerCase();
  // An explicit 'edge' override is a spend cap — never fall back to paid
  const chain = provider === 'edge'
    ? (opts.provider === 'edge'
      ? [() => edgeTTS(clean, resolved)]
      : [() => edgeTTS(clean, resolved), () => openaiTTS(clean, resolved)])
    : [() => openaiTTS(clean, resolved), () => edgeTTS(clean, resolved)];

  for (const fn of chain) {
    try {
      return await fn();
    } catch (err) {
      console.error('[tts]', err instanceof Error ? err.message : err);
    }
  }
  return null;
}
