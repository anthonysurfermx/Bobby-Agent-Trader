import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requestOriginHost } from './_lib/origins.js';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { getClientIpKey } from './_lib/rate-limit.js';
import { DESK_QUESTION_MAX, DeskOutputRejected, loadDeskEvidence, runDeskDebate } from './_lib/desk-debate.js';

export const config = { maxDuration: 95 };

/** Mirrors bobby_consume_desk_quota (20260919190000): a key over its ceiling is exhausted. */
const QUOTA_CEILING = { global: 600, caller: 30 } as const;

const Body = z.object({ symbol: z.string().regex(/^[A-Z0-9.^=-]{1,20}$/), assetType: z.enum(['equity','crypto']).optional(), question: z.string().trim().min(1), language: z.enum(['en','es']).default('en') });

type Lang = 'en' | 'es';
const copy = (lang: Lang, en: string, es: string) => lang === 'es' ? es : en;

/**
 * Every refusal carries a stable `code` the app can switch on:
 * invalid_request / question_too_long (400), daily_limit (429),
 * desk_unavailable / analysis_failed (503).
 */
function refuse(res: VercelResponse, status: number, code: string, error: string, extra: Record<string, unknown> = {}) {
  return res.status(status).json({ error, code, ...extra });
}

/** Seconds until the exhausted quota window reopens; best effort, never blocks the answer. */
async function quotaRetryAfter(caller: string): Promise<number> {
  const DAY = 86_400;
  try {
    const keys = `("caller:${caller}",global)`;
    const r = await fetch(bobbyRest(`bobby_desk_quotas?key=in.${encodeURIComponent(keys)}&select=key,hits,expires_at`), { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(3000) });
    if (!r.ok) return DAY;
    const rows = await r.json() as Array<{ key: string; hits: number; expires_at: string }>;
    const waits = rows.filter(row => row.hits > (row.key === 'global' ? QUOTA_CEILING.global : QUOTA_CEILING.caller))
      .map(row => Math.ceil((Date.parse(row.expires_at) - Date.now()) / 1000)).filter(Number.isFinite);
    return waits.length ? Math.min(DAY, Math.max(60, ...waits)) : 60;
  } catch {
    return DAY;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requestOriginHost(req.headers)) return res.status(403).json({ error: 'Origin not allowed' });
  const lang: Lang = (req.body as { language?: unknown } | undefined)?.language === 'es' ? 'es' : 'en';
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    return refuse(res, 400, 'invalid_request', copy(lang, 'Choose an asset and type a question.', 'Elige un activo y escribe una pregunta.'));
  }
  const { symbol, question, language, assetType } = parsed.data;
  // A code point is at most two UTF-16 units: the first test bounds Array.from's work.
  if (question.length > DESK_QUESTION_MAX * 2 || Array.from(question).length > DESK_QUESTION_MAX) {
    return refuse(res, 400, 'question_too_long', copy(language, 'Your question is too long. Keep it to 1,200 characters or fewer.', 'Tu pregunta es demasiado larga. Usa 1,200 caracteres o menos.'), { maxLength: DESK_QUESTION_MAX });
  }
  const unavailable = copy(language, 'The analysis desk is temporarily unavailable.', 'La mesa de análisis no está disponible por ahora.');
  try {
    if (!process.env.OPENAI_API_KEY) return refuse(res, 503, 'desk_unavailable', unavailable);
    // Atomic, cross-instance, fail-closed limits. No model calls if storage fails.
    const caller = getClientIpKey(req);
    const quota = await fetch(bobbyRest('rpc/bobby_consume_desk_quota'), {
      method: 'POST', headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ p_caller: caller }),
    });
    if (!quota.ok) return refuse(res, 503, 'desk_unavailable', unavailable);
    if (await quota.json() !== true) {
      // Per-caller and global windows are both 24 h: this is not "retry in a moment".
      res.setHeader('Retry-After', String(await quotaRetryAfter(caller)));
      return refuse(res, 429, 'daily_limit', copy(language, "Bobby reached today's analysis limit. Try again tomorrow.", 'Bobby llegó al límite de análisis de hoy. Vuelve a intentarlo mañana.'));
    }
    return res.status(200).json(await runDeskDebate(question, await loadDeskEvidence(symbol, assetType), language));
  } catch (error) {
    // Never log private questions, model payloads, or provider credentials — only the rejection class.
    if (error instanceof DeskOutputRejected) console.error('[desk-debate] model output rejected', error.reason);
    return refuse(res, 503, 'analysis_failed', copy(language, 'The analysis could not finish. Please retry. No verdict was issued.', 'El análisis no pudo terminar. Inténtalo de nuevo. No se emitió ningún veredicto.'));
  }
}
