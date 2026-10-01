// ============================================================
// provider-alert — tells the owner when an AI provider refuses for exhausted credit, so it can be
// topped up while the desk is answering from the other provider (api/_lib/desk-levels.ts).
// One email per provider per ALERT_WINDOW_SEC across all instances (api_cache key), plus a per-instance
// guard so a burst of failed calls never reaches the database more than once. Never throws: an alert
// that fails must not change the analysis outcome. The email carries no question, account or provider text.
// ============================================================
import { waitUntil } from '@vercel/functions';
import { getCache, setCache } from './api-cache.js';

export type AlertProvider = 'openai' | 'anthropic';
const ALERT_WINDOW_SEC = 6 * 3600;
const BILLING_URL: Record<AlertProvider, string> = {
  openai: 'https://platform.openai.com/settings/organization/billing/overview',
  anthropic: 'https://console.anthropic.com/settings/billing',
};
const NAME: Record<AlertProvider, string> = { openai: 'OpenAI', anthropic: 'Anthropic (Claude Sonnet)' };
const lastSent = new Map<AlertProvider, number>();

async function send(provider: AlertProvider, code: string, endpoint: string): Promise<void> {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  const to = (process.env.BOBBY_ALERT_EMAIL || process.env.WAITLIST_NOTIFY_EMAIL || '').trim();
  if (!apiKey || !to) {
    console.error('[provider-alert] credit exhausted but no alert email configured', provider, code);
    return;
  }
  const key = `provider-credit-alert:${provider}`;
  if (await getCache(key)) return;
  // Claim the window before sending, so concurrent instances do not all email.
  await setCache(key, { code, endpoint, at: new Date().toISOString() }, ALERT_WINDOW_SEC);
  const other: AlertProvider = provider === 'openai' ? 'anthropic' : 'openai';
  const at = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const text = [
    `${NAME[provider]} rechazó una llamada de Bobby por falta de créditos (${code}) a las ${at} UTC, en ${endpoint}.`,
    '',
    `Mientras tanto Bobby responde con ${NAME[other]} si ese proveedor tiene crédito. Si los dos se quedan sin crédito, el análisis devuelve "no disponible" y no se cobra la lectura.`,
    provider === 'openai' ? 'La voz de los personajes (TTS) usa OpenAI: sin crédito en OpenAI la voz no suena.' : '',
    '',
    `Recarga aquí: ${BILLING_URL[provider]}`,
    '',
    'No vuelvo a avisar de este proveedor en las próximas 6 horas.',
  ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n');
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: (process.env.BOBBY_ALERT_FROM || process.env.WAITLIST_NOTIFY_FROM || '').trim() || 'Bobby Alerts <onboarding@resend.dev>',
        to: [to],
        subject: `Bobby: ${NAME[provider]} sin créditos — recarga`,
        text,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error('[provider-alert] email failed', res.status);
    else console.error(JSON.stringify({ route: endpoint, event: 'provider_credit_alert_sent', provider, code }));
  } catch (error) {
    console.error('[provider-alert] email error', error instanceof Error ? error.name : 'unknown');
  }
}

/** Fire-and-forget: kept alive past the response with waitUntil. */
export function alertProviderCredit(provider: AlertProvider, code: string, endpoint: string): void {
  const now = Date.now();
  if (now - (lastSent.get(provider) ?? 0) < ALERT_WINDOW_SEC * 1000) return;
  lastSent.set(provider, now);
  const task = send(provider, code, endpoint).catch(() => undefined);
  try { waitUntil(task); } catch { /* outside a request context the promise still runs */ }
}

/** Tests only: forget the per-instance window. */
export function resetProviderAlerts(): void { lastSent.clear(); }
