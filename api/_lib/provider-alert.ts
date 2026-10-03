// ============================================================
// provider-alert — tells the owner when an AI provider refuses for exhausted credit, so it can be
// topped up while the desk is answering from the other provider (api/_lib/desk-levels.ts).
// One alert per provider per ALERT_WINDOW_SEC across all instances (atomic api_cache claim), plus a per-instance
// guard so a burst of failed calls never reaches the database more than once. The claim is the alert fact the
// dashboard reads (bobby_admin_overview → llm.providers.<p>.creditAlert), so it is written even when no recipient
// is configured; the email outcome is added to it. Never throws: an alert that fails must not change the analysis
// outcome. The email carries no question, account or provider text.
// Every email reports what Resend did with it: `accepted` means Resend took it (2xx), never that it was delivered.
// ============================================================
import { waitUntil } from '@vercel/functions';
import { claimCache, setCache } from './api-cache.js';

export type AlertProvider = 'openai' | 'anthropic';
const ALERT_WINDOW_SEC = 6 * 3600;
const BILLING_URL: Record<AlertProvider, string> = {
  openai: 'https://platform.openai.com/settings/organization/billing/overview',
  anthropic: 'https://console.anthropic.com/settings/billing',
};
const NAME: Record<AlertProvider, string> = { openai: 'OpenAI', anthropic: 'Anthropic (Claude Sonnet)' };
const lastSent = new Map<AlertProvider, number>();

/** What Resend did with an email: accepted (2xx, with its id) or why not. Accepted is not delivered. */
export interface EmailResult { accepted: boolean; id?: string; error?: string }

/** Sends one email to the owner and waits for Resend's answer. Never throws. */
export async function sendOwnerEmail(subject: string, text: string): Promise<EmailResult> {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  const to = (process.env.BOBBY_ALERT_EMAIL || process.env.WAITLIST_NOTIFY_EMAIL || '').trim();
  if (!apiKey || !to) {
    console.error('[provider-alert] owner email not sent: no alert email configured');
    return { accepted: false, error: 'not_configured' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: (process.env.BOBBY_ALERT_FROM || process.env.WAITLIST_NOTIFY_FROM || '').trim() || 'Bobby Alerts <onboarding@resend.dev>',
        to: [to], subject, text,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error('[provider-alert] owner email not accepted', res.status);
      return { accepted: false, error: `resend_${res.status}` };
    }
    const body = await res.json().catch(() => null) as { id?: unknown } | null;
    return typeof body?.id === 'string' && body.id ? { accepted: true, id: body.id } : { accepted: true };
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    console.error('[provider-alert] owner email error', timeout ? 'timeout' : 'network');
    return { accepted: false, error: timeout ? 'timeout' : 'network' };
  }
}

async function send(provider: AlertProvider, code: string, endpoint: string): Promise<void> {
  const key = `provider-credit-alert:${provider}`;
  const fact = { code, endpoint, at: new Date().toISOString() };
  // false: another instance already holds this window's alert. null: storage is down — still email (the
  // per-instance guard limits the repeats).
  if (await claimCache(key, ALERT_WINDOW_SEC, fact) === false) return;
  const other: AlertProvider = provider === 'openai' ? 'anthropic' : 'openai';
  const at = fact.at.replace('T', ' ').slice(0, 16);
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
  const email = await sendOwnerEmail(`Bobby: ${NAME[provider]} sin créditos — recarga`, text);
  if (email.accepted) console.error(JSON.stringify({ route: endpoint, event: 'provider_credit_alert_accepted', provider, code }));
  await setCache(key, { ...fact, email }, ALERT_WINDOW_SEC);
}

/** Fire-and-forget: kept alive past the response with waitUntil. */
export function alertProviderCredit(provider: AlertProvider, code: string, endpoint: string): void {
  const now = Date.now();
  if (now - (lastSent.get(provider) ?? 0) < ALERT_WINDOW_SEC * 1000) return;
  lastSent.set(provider, now);
  const task = send(provider, code, endpoint).catch(() => undefined);
  try { waitUntil(task); } catch { /* outside a request context the promise still runs */ }
}

/**
 * A plain operational email to the owner (same sender and recipient as the credit alert), kept alive past the
 * response with waitUntil; callers that do not await it keep the old fire-and-forget behaviour. Never rejects.
 * Callers pass only what the owner needs to act — never questions, emails, wallets or free-text from users.
 */
export function notifyOwner(subject: string, text: string): Promise<EmailResult> {
  const task = sendOwnerEmail(subject, text);
  try { waitUntil(task); } catch { /* outside a request context the promise still runs */ }
  return task;
}

/** Tests only: forget the per-instance window. */
export function resetProviderAlerts(): void { lastSent.clear(); }
