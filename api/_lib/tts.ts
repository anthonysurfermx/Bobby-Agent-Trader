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
  /** Voice persona id: coral | ballad | sage | ash | mellow | male | female | alpha | red | cio */
  voice?: string;
  /** Agent vibe — modulates delivery style: direct | analytical | wise */
  vibe?: string;
  /** opus → Telegram voice-note bubble; mp3 → web-safe playback */
  format?: 'opus' | 'mp3';
  /** Legacy per-user Edge Neural voice (iOS "Configura tu Bobby" menu).
   *  Strictly allowlisted; when valid it flips the chain to edge-first. */
  edgeVoice?: string;
  /** Per-call provider override (e.g. degrade to free Edge when a global
   *  spend budget is exhausted). Beats TTS_PROVIDER and the key-based default. */
  provider?: 'openai' | 'edge';
}

// ---- Voice persona mapping ----

// Every gpt-4o-mini-tts voice, so each squad companion can own a distinct one.
const OPENAI_VOICES = ['coral', 'ballad', 'sage', 'ash', 'alloy', 'echo', 'shimmer', 'verse', 'nova', 'marin', 'cedar', 'onyx', 'fable'];

/**
 * Gen Z tuning (user-validated bake-off, 2026-08-24): persona ids stay
 * stable for every client, but each maps to the YOUNGEST natural voice in
 * the catalog — nova/shimmer (fem) and verse/echo (masc) beat the older-
 * sounding defaults with the native-speaker instructions below.
 */
const PERSONA_VOICE: Record<string, string> = {
  coral: 'nova',      // warm · close → young bright fem
  sage: 'shimmer',    // calm · wise → young light fem
  ash: 'verse',       // steady · direct → young energetic masc
  ballad: 'echo',     // chill · smooth → young relaxed masc
  // KEO is a thirty-year soul surfer, not a 22-year-old: the Gen Z remap above
  // left him sharing BOBBY's `verse`, young and quick, which is the opposite of
  // the character. `mellow` is the way to reach the raw `ash` voice — deeper and
  // unhurried, and the only catalog voice nobody else resolves to.
  mellow: 'ash',      // unhurried · grounded masc
};

/** Feminine-voiced personas get feminine-gendered Spanish instructions. */
const FEM_VOICES = new Set(['nova', 'shimmer', 'coral', 'sage', 'alloy', 'marin', 'fable']);

function resolveOpenAIVoice(voice?: string): string {
  if (voice && PERSONA_VOICE[voice]) return PERSONA_VOICE[voice];
  if (voice && OPENAI_VOICES.includes(voice)) return voice;
  switch (voice) {
    case 'female': return PERSONA_VOICE.coral;
    case 'male': return PERSONA_VOICE.ash;
    case 'alpha': return PERSONA_VOICE.ash;   // opportunity hunter — lively
    case 'red': return PERSONA_VOICE.sage;    // risk voice — calm, firm
    case 'cio': return PERSONA_VOICE.ballad;  // the boss — young but grounded
    default: return process.env.TTS_OPENAI_VOICE || PERSONA_VOICE.coral;
  }
}

// ---- Delivery style instructions (the anti-robot layer) ----
// Gen Z native-speaker persona: a 22-year-old talking with their best
// friend. The native-accent line is what killed the "foreigner speaking
// Spanish" feel in the bake-off; the age is what makes it land with the
// audience. Gendered variants match the voice actually speaking.

const BASE_INSTRUCTIONS: Record<string, string> = {
  es: 'Eres una chava mexicana de 22 años de la CDMX platicando con tu mejor amiga. Voz joven, fresca y con energía natural — pero relajada y segura, nada de caricatura ni ánimo forzado. Español mexicano nativo auténtico; JAMÁS suenes como extranjera. Habla como Gen Z real: fluida, cercana, con confianza. Baja un poco el tono al hablar de riesgo, como cuidando a tu amiga. Pronuncia siglas y números con naturalidad. Cero robot, cero locutora, sin muletillas.',
  en: 'You are a 22-year-old talking with your best friend. Young, fresh, naturally energetic — but relaxed and confident, never cartoonish or forced. Native American English. Talk like real Gen Z: fluid, close, self-assured. Lower your tone a bit when mentioning risk, like you are looking out for them. Pronounce tickers and numbers naturally. Zero robot, zero announcer, no filler words.',
  pt: 'Você é um jovem brasileiro de 22 anos conversando com seu melhor amigo. Voz jovem, fresca e com energia natural — mas relaxada e segura, nada de caricatura. Português brasileiro nativo autêntico. Fale como Gen Z de verdade: fluido, próximo, confiante. Abaixe um pouco o tom ao falar de risco. Zero robô, zero locutor.',
};

const BASE_INSTRUCTIONS_MASC_ES = 'Eres un chavo mexicano de 23 años de la CDMX platicando con tu mejor amigo. Voz joven, fresca y con energía natural — pero relajado y seguro, nada de caricatura ni ánimo forzado. Español mexicano nativo auténtico; JAMÁS suenes como extranjero. Habla como Gen Z real: fluido, cercano, con confianza. Baja un poco el tono al hablar de riesgo, como cuidando a tu amigo. Pronuncia siglas y números con naturalidad. Cero robot, cero locutor, sin muletillas.';

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

// English carried a single ungendered persona, so a feminine voice got no cue
// at all to read young and feminine — the wave 2 companions came out sounding
// neutral and older than they are. Both languages now pick a persona per
// (language, voice gender), the way Spanish already did.
const BASE_INSTRUCTIONS_FEM_EN = 'You are a 22-year-old woman talking with your best friend. Bright, warm and naturally energetic, with a light youthful lift at the end of your phrases — but relaxed and self-assured, never cartoonish, never breathy, never a forced smile. Native American English. Talk like real Gen Z: fluid, close, confident. Lower your tone a bit when mentioning risk, like you are looking out for her. Pronounce tickers and numbers naturally. Zero robot, zero announcer, no filler words.';

const BASE_INSTRUCTIONS_MASC_EN = 'You are a 23-year-old guy talking with your best friend. Young, fresh, naturally energetic — but relaxed and confident, never cartoonish or forced. Native American English. Talk like real Gen Z: fluid, close, self-assured. Lower your tone a bit when mentioning risk, like you are looking out for him. Pronounce tickers and numbers naturally. Zero robot, zero announcer, no filler words.';

// Every persona above reads as the same 22-year-old, which is right for the
// squad but wrong for a character built on patience. A persona listed here
// replaces the age/energy persona entirely — the accent rule is repeated
// verbatim, because it is what kept Spanish from sounding foreign.
const PERSONA_INSTRUCTIONS: Record<string, Record<string, string>> = {
  mellow: {
    es: 'Eres un surfista mexicano de unos treinta y cinco años, de costa, platicando con un amigo en la arena. Voz grave, tranquila y sin ninguna prisa: hablas despacio, con pausas cómodas, como quien lleva media vida esperando la ola buena y sabe que llega. Español mexicano nativo auténtico; JAMÁS suenes como extranjero. Nada de energía forzada, nada de vender: solo calma. Baja todavía más el tono al hablar de riesgo. Pronuncia siglas y números con naturalidad. Cero robot, cero locutor, sin muletillas.',
    en: 'You are a Mexican surfer in your mid-thirties talking with a friend on the sand. Low, calm voice with no hurry at all: you speak slowly, with comfortable pauses, like someone who has spent half a life waiting for the good wave and knows it comes. Native English, warm and unhurried. No forced energy, nothing to sell: just calm. Drop your tone further when mentioning risk. Pronounce tickers and numbers naturally. Zero robot, zero announcer, no filler words.',
    pt: 'Você é um surfista de uns trinta e cinco anos conversando com um amigo na areia. Voz grave, tranquila e sem nenhuma pressa: fala devagar, com pausas confortáveis, como quem passou meia vida esperando a onda boa e sabe que ela vem. Português brasileiro nativo. Nada de energia forçada. Abaixe ainda mais o tom ao falar de risco. Zero robô, zero locutor.',
  },
};

function buildInstructions(lang: string, vibe?: string, resolvedVoice?: string, persona?: string): string {
  let base = process.env.TTS_INSTRUCTIONS || BASE_INSTRUCTIONS[lang] || BASE_INSTRUCTIONS.es;
  // A masculine voice reading feminine self-references ("una chava…
  // extranjera") breaks the illusion instantly, and the reverse leaves the
  // feminine voices reading flat.
  if (!process.env.TTS_INSTRUCTIONS && resolvedVoice) {
    const feminine = FEM_VOICES.has(resolvedVoice);
    if (lang === 'es' && !feminine) base = BASE_INSTRUCTIONS_MASC_ES;
    else if (lang === 'en') base = feminine ? BASE_INSTRUCTIONS_FEM_EN : BASE_INSTRUCTIONS_MASC_EN;
  }
  const character = persona ? PERSONA_INSTRUCTIONS[persona] : undefined;
  if (!process.env.TTS_INSTRUCTIONS && character) base = character[lang] || character.es;
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
 * All agents share one Edge identity per language, so `agent` is accepted for
 * API stability but doesn't change the fallback.
 */
export function resolveEdgeVoice(lang: string, _agent = 'cio', edgeVoice?: string): string {
  return (edgeVoice && EDGE_VOICE_MENU.has(edgeVoice))
    ? edgeVoice
    : EDGE_VOICE[lang] || EDGE_VOICE.es;
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

async function edgeTTS(text: string, opts: Required<Pick<SpeechOptions, 'lang' | 'format'>> & Pick<SpeechOptions, 'voice' | 'edgeVoice'>): Promise<SpeechResult> {
  const voice = resolveEdgeVoice(opts.lang, opts.voice, opts.edgeVoice);
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
  const resolvedVoice = resolveOpenAIVoice(opts.voice);
  const body: Record<string, unknown> = {
    model,
    voice: resolvedVoice,
    input: text.slice(0, MAX_CHARS),
    response_format: opts.format,
  };
  // gpt-4o-mini-tts steers delivery via `instructions`; tts-1 only has `speed`.
  if (model.includes('gpt-4o')) {
    body.instructions = buildInstructions(opts.lang, opts.vibe, resolvedVoice, opts.voice);
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
    // Only honored when it's on the strict menu — invalid names are dropped
    edgeVoice: opts.edgeVoice && EDGE_VOICE_MENU.has(opts.edgeVoice) ? opts.edgeVoice : undefined,
  };

  const provider = (opts.provider || process.env.TTS_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : 'edge')).toLowerCase();
  const makers: Record<TtsProvider, () => Promise<SpeechResult>> = {
    edge: () => edgeTTS(clean, resolved),
    openai: () => openaiTTS(clean, resolved),
  };
  // An explicit 'edge' override is a spend cap — never fall back to paid.
  // Otherwise a valid per-user Edge voice flips the order to edge-first.
  const chain = opts.provider === 'edge'
    ? [makers.edge]
    : ttsProviderOrder(provider, resolved.edgeVoice).map((name) => makers[name]);

  for (const fn of chain) {
    try {
      return await fn();
    } catch (err) {
      console.error('[tts]', err instanceof Error ? err.message : err);
    }
  }
  return null;
}
