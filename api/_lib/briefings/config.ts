// ============================================================
// Bobby Pro market briefings — configuration. Env is read per call (never cached), so a kill switch or a cap
// change takes effect on the next request. Static configuration (asset universe, companion voices, limits,
// consent versions, push copy) lives here as constants: it is config, not data.
// Spec: docs/product/pro-market-briefings-implementation.md §1.
// ============================================================
import type { BriefLanguage, Cadence, DeviceEnvironment } from './types.js';
import { appTextModel } from '../app-model.js';

type Env = NodeJS.ProcessEnv;

/** Preparation, dispatch and synthesis run only when this is exactly 'on'. Retained reports stay readable either way. */
export const briefingsEnabled = (env: Env = process.env): boolean => env.BOBBY_BRIEFINGS_ENABLED === 'on';

/** Product policy: only the Monday 08:00 weekly briefing. Legacy env values cannot activate daily/close work. */
export function adoptedCadences(_env: Env = process.env): Set<Cadence> {
  return new Set<Cadence>(['weekly']);
}

/** Proposal P1: every calendar day ('all') or only equity session days ('sessions'). */
export const morningDays = (env: Env = process.env): 'all' | 'sessions' => (env.BOBBY_BRIEFINGS_MORNING_DAYS === 'sessions' ? 'sessions' : 'all');

/** Memory may shape reports only with this flag on (plus account consent and memory enabled). */
export const briefingsMemoryOn = (env: Env = process.env): boolean => env.BOBBY_BRIEFINGS_MEMORY === 'on';

const positive = (raw: string | undefined): number | null => {
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const positiveInt = (raw: string | undefined, fallback: number, max: number): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
};

/** Dedicated monetary caps. Null when missing or invalid: no paid work is started without them. */
export function budgetCaps(env: Env = process.env): { dayUsd: number; monthUsd: number } | null {
  const dayUsd = positive(env.BOBBY_BRIEFINGS_DAILY_CAP_USD);
  const monthUsd = positive(env.BOBBY_BRIEFINGS_MONTHLY_CAP_USD);
  return dayUsd !== null && monthUsd !== null ? { dayUsd, monthUsd } : null;
}

export interface LlmChoice { provider: 'anthropic' | 'openai'; model: string }
/** Ordered provider:model list for the shared narrative; each entry is a separately reserved attempt. */
export function llmChoices(env: Env = process.env): LlmChoice[] {
  const raw = env.BOBBY_BRIEFINGS_LLM || `anthropic:${appTextModel(env)},openai:gpt-4o-mini`;
  const out: LlmChoice[] = [];
  for (const part of raw.split(',')) {
    const [provider, model] = part.trim().split(':');
    if ((provider === 'anthropic' || provider === 'openai') && model && /^[a-z0-9.-]{3,64}$/.test(model)) out.push({ provider, model });
  }
  return out.slice(0, 3);
}
export const llmMaxTokens = (env: Env = process.env): number => positiveInt(env.BOBBY_BRIEFINGS_LLM_MAX_TOKENS, 3000, 8000);
/** Per-attempt timeout for the shared narrative call. */
export const LLM_TIMEOUT_MS = 40_000;

export const TTS_MODEL = (env: Env = process.env): string => env.TTS_OPENAI_MODEL || 'gpt-4o-mini-tts';
/** Reservation per character (upper bound) and settlement estimate: /v1/audio/speech returns no usage. */
export const ttsReserveUsdPerChar = (env: Env = process.env): number => positive(env.BOBBY_BRIEFINGS_TTS_RESERVE_USD_PER_CHAR) ?? 0.00004;
export const ttsEstimateUsdPerChar = (env: Env = process.env): number => positive(env.BOBBY_BRIEFINGS_TTS_ESTIMATE_USD_PER_CHAR) ?? 0.000017;
export const TTS_TIMEOUT_MS = 15_000;
/** Spoken style for briefings (tts.ts vibe). */
export const BRIEF_VIBE = 'analytical';

export const llmSlots = (env: Env = process.env): number => positiveInt(env.BOBBY_BRIEFINGS_LLM_SLOTS, 2, 8);
export const ttsSlots = (env: Env = process.env): number => positiveInt(env.BOBBY_BRIEFINGS_TTS_SLOTS, 2, 8);
export const settleSeconds = (env: Env = process.env): number => positiveInt(env.BOBBY_BRIEFINGS_SETTLE_SECONDS, 300, 3600);
/** Paid attempts per provider work item (one shared narrative, one audio cache key). */
export const MAX_ATTEMPTS_PER_WORK = 2;

// ---- worker bounds ----
export const WORKER_MAX_DURATION_S = 60;
export const WORKER_BUDGET_MS = 45_000;
/** Do not start a provider attempt with less than this left in the tick. */
export const PROVIDER_MIN_REMAINING_MS = 20_000;
export const PREPARE_BATCH = 10;
export const DELIVERY_BATCH = 50;
export const LEASE_SECONDS = 90;
export const SHARED_MAX_ATTEMPTS = 3;
export const BRIEF_MAX_ATTEMPTS = 3;
export const OUTBOX_MAX_ATTEMPTS = 3;

// ---- retention (proposals D11; parameters of bobby_brief_purge) ----
export const RETENTION = {
  reportDays: 90,
  audioDays: 14,
  outboxDays: 30,
  attemptDays: 400,
  deviceDays: 30,
  idempotencyHours: 24,
  sharedDays: 120,
  purgeBatch: 500,
} as const;

// ---- content limits ----
export const LIMITS = {
  assetsPerAccount: 6,
  reportBytes: 24 * 1024,
  narrationSegments: 4,
  segmentChars: 800,
  narrationChars: 2400,
  weeklyNarrationSegments: 3,
  weeklyNarrationChars: 1200,
  sharedAssetSections: 17,
  settingsBodyBytes: 2048,
  deviceBodyBytes: 2048,
  voiceBodyBytes: 1024,
  devicesPerAccount: 5,
  apnsTokenMinHex: 32,
  apnsTokenMaxHex: 400,
  inboxMax: 20,
} as const;

/** Account-keyed limits per minute (contract §Proposed rate and payload bounds). */
export const RATE = {
  read: 120,
  settingsPatch: 20,
  device: 10,
  voice: 12,
  audio: 240,
  preAuthPerIp: 600,
} as const;

export const CONSENT_VERSIONS = { analysis: 1, audio: 1 } as const;

/** The supported universe: symbols the market snapshot covers with real quotes. */
export const SUPPORTED_ASSETS: Readonly<Record<string, 'crypto' | 'equity' | 'etf' | 'metal'>> = {
  BTC: 'crypto', ETH: 'crypto', SOL: 'crypto', XAUT: 'metal', XAG: 'metal',
  NVDA: 'equity', AAPL: 'equity', TSLA: 'equity', META: 'equity', MSFT: 'equity', COIN: 'equity',
  GOOGL: 'equity', AMZN: 'equity', AMD: 'equity', MSTR: 'equity', SPY: 'etf', QQQ: 'etf',
};
export const isSupportedAsset = (s: string): boolean => Object.prototype.hasOwnProperty.call(SUPPORTED_ASSETS, s);
/** Sections a reader gets when they follow nothing (a cold start or memory off). */
export const DEFAULT_ASSETS: readonly string[] = ['BTC', 'ETH', 'SPY', 'NVDA'];

/** Companion → TTS persona (mirrors ios/Bobby/Sources/Companion.swift voicePersona). */
export const COMPANION_VOICES: Readonly<Record<string, string>> = {
  orb: 'ash', byte: 'ballad', kora: 'coral', zip: 'sage', glitch: 'cedar', momo: 'marin', flux: 'alloy', rook: 'onyx',
  halo: 'shimmer', axiom: 'fable', iris: 'sage', sol: 'coral', zuri: 'nova', mira: 'alloy', nalu: 'marin', vega: 'shimmer',
  noor: 'fable', keo: 'mellow',
};
export const DEFAULT_COMPANION = 'orb';
export const voiceForCompanion = (companionId: string | null | undefined): string =>
  COMPANION_VOICES[companionId ?? ''] ?? COMPANION_VOICES[DEFAULT_COMPANION];

/** Generic lock-screen copy. Never a name, a symbol, a figure or an account reference. */
export const PUSH_COPY: Readonly<Record<BriefLanguage, { title: string; body: string }>> = {
  es: { title: 'Bobby', body: 'Bobby tiene tu resumen de mercado listo' },
  en: { title: 'Bobby', body: 'Bobby has your market briefing ready' },
  fr: { title: 'Bobby', body: 'Votre résumé de marché est prêt dans Bobby' },
  pt: { title: 'Bobby', body: 'O teu resumo de mercado está pronto no Bobby' },
  'pt-BR': { title: 'Bobby', body: 'Seu resumo de mercado está pronto no Bobby' },
  it: { title: 'Bobby', body: 'Il tuo riepilogo di mercato è pronto in Bobby' },
  de: { title: 'Bobby', body: 'Dein Marktüberblick ist in Bobby bereit' },
};

// ---- APNs ----
export interface ApnsConfig { keyId: string; teamId: string; privateKey: string; topic: string; environments: Set<DeviceEnvironment> }
/** Null when any credential is missing: dispatch pauses, nothing is sent. */
export function apnsConfig(env: Env = process.env): ApnsConfig | null {
  const keyId = (env.BOBBY_APNS_KEY_ID || '').trim();
  const teamId = (env.BOBBY_APNS_TEAM_ID || '').trim();
  const privateKey = (env.BOBBY_APNS_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!/^[A-Z0-9]{10}$/.test(keyId) || !/^[A-Z0-9]{10}$/.test(teamId) || !privateKey.includes('PRIVATE KEY')) return null;
  return { keyId, teamId, privateKey, topic: apnsTopic(env), environments: apnsEnvironments(env) };
}
export const apnsTopic = (env: Env = process.env): string => (env.BOBBY_APNS_TOPIC || 'xyz.bobbyprotocol.bobby').trim();
export function apnsEnvironments(env: Env = process.env): Set<DeviceEnvironment> {
  const raw = (env.BOBBY_APNS_ENVIRONMENTS || 'production').split(',').map((s) => s.trim());
  return new Set(raw.filter((e): e is DeviceEnvironment => e === 'production' || e === 'sandbox'));
}

/** base64 32-byte master key for push token encryption/fingerprints and receipt sealing. Null when absent/invalid. */
export function pushMasterKey(env: Env = process.env): Buffer | null {
  const raw = (env.BOBBY_PUSH_TOKEN_KEY || '').trim();
  if (!raw) return null;
  try {
    const key = Buffer.from(raw, 'base64');
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

export const cronSecret = (env: Env = process.env): string => (env.CRON_SECRET || '').trim();
export const opsSecret = (env: Env = process.env): string => (env.BOBBY_OPS_SECRET || '').trim();
export const isProductionDeployment = (env: Env = process.env): boolean => env.VERCEL_ENV === 'production';

/** Storage bucket for shared narration audio (private; served only through the authenticated audio op). */
export const AUDIO_BUCKET = 'briefing-audio';
export const AUDIO_MIME = 'audio/mpeg';
