// ============================================================
// api/_lib/telegram-bots.ts — Multi-bot registry
// ------------------------------------------------------------
// One deployment, many bots. Each bot has its own token +
// webhook secret in env, and its own default language. Bots
// are selected per-request via ?bot=<key> on the webhook URL,
// e.g. /api/telegram-webhook?bot=gts
//
// Secrets NEVER live in code — only the env-var NAMES do.
// To add an influencer bot: add an entry here, then set its
// TELEGRAM_BOT_TOKEN_<KEY> and TELEGRAM_WEBHOOK_SECRET_<KEY>.
// ============================================================

export interface BotConfig {
  key: string;
  token: string;
  webhookSecret: string;
  /** Default language for UI + voice (ISO: 'es' | 'en'). */
  lang: string;
  label: string;
}

interface BotEntry {
  tokenEnv: string;
  secretEnv: string;
  lang: string;
  label: string;
}

const REGISTRY: Record<string, BotEntry> = {
  // Legacy / main Bobby bot — keeps existing env vars for backwards-compat.
  default: {
    tokenEnv: 'TELEGRAM_BOT_TOKEN',
    secretEnv: 'TELEGRAM_WEBHOOK_SECRET',
    lang: 'en',
    label: 'Bobby Agent Trader',
  },
  // "Genera Tu Sueldo" influencer bot (@aigts_bot) — Spanish.
  gts: {
    tokenEnv: 'TELEGRAM_BOT_TOKEN_GTS',
    secretEnv: 'TELEGRAM_WEBHOOK_SECRET_GTS',
    lang: 'es',
    label: 'Genera Tu Sueldo',
  },
};

function normalizeKey(raw?: string | string[]): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const k = (v || 'default').toLowerCase().trim();
  return REGISTRY[k] ? k : 'default';
}

/**
 * Resolve a bot from the webhook's ?bot= query value. Returns null if the
 * resolved bot has no token configured (so the handler can fail closed).
 */
export function resolveBot(raw?: string | string[]): BotConfig | null {
  const key = normalizeKey(raw);
  const entry = REGISTRY[key];
  const token = process.env[entry.tokenEnv] || '';
  const webhookSecret = process.env[entry.secretEnv] || '';
  if (!token) return null;
  return { key, token, webhookSecret, lang: entry.lang, label: entry.label };
}
