import type { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';
import { requestOriginHost } from './_lib/origins.js';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { getClientQuotaKeys, saltedKey } from './_lib/rate-limit.js';
import { DESK_QUESTION_MAX, DeskOutputRejected, horizonOf, loadDeskEvidence, loadDeskEvidenceV2, runDeskDebate } from './_lib/desk-debate.js';
import { levelPlan } from './_lib/desk-levels.js';
import { clientPlatform, consumeRead, refundRead, consumeLevel, refundLevel, type Access } from './_lib/access.js';
import { llmBudget, logLlmUsage } from './_lib/llm-usage.js';
import { LlmHttpError, type LlmUsage } from './_lib/llm.js';
import type { Identity } from './_lib/user-identity.js';
import { MEMORY_PLATFORMS, memoryPersonalizationOn, MEMORY_SUMMARY_TIMEOUT_MS, memoryIdentity, memorySummary, readerContext, recordAsk, type MemorySummary } from './_lib/user-memory.js';

// Máximo runs four Sonnet calls inside a 160 s budget (api/_lib/desk-levels.ts).
export const config = { maxDuration: 180 };

/**
 * Mirrors bobby_consume_desk_quota (20260919200000). A refused call consumes
 * nothing, so an exhausted key holds exactly its ceiling.
 */
const QUOTA_CEILING = { global: 600, network: 60, caller: 30 } as const;
const quotaCeiling = (key: string) => key === 'global' ? QUOTA_CEILING.global : key.startsWith('net:') ? QUOTA_CEILING.network : QUOTA_CEILING.caller;

const Body = z.object({ symbol: z.string().regex(/^[A-Z0-9.^=-]{1,20}$/), assetType: z.enum(['equity','crypto']).optional(), question: z.string().trim().min(1), language: z.enum(['en','es','pt']).default('en'), level: z.enum(['rapido','profundo','maximo']).default('rapido') });

type Lang = 'en' | 'es' | 'pt';
const copy = (lang: Lang, en: string, es: string) => lang === 'es' ? es : en;

/**
 * Every refusal carries a stable `code` the app can switch on:
 * invalid_request / question_too_long (400), daily_limit (429),
 * signin_required / upgrade_required / level_exhausted (403, a premium level's allowance; carries `level`
 * and the meter), budget_paused / desk_unavailable / analysis_failed (503). A request without `level` is
 * Rápido, as before.
 *
 * Live desk: a client that sends `Accept: application/x-ndjson` gets, once every gate has passed, one JSON
 * line per step — {type:"accepted"}, {type:"evidence"}, {type:"agent", role, text} for Alpha, Red Team and
 * Máximo's second round (each already through the guard), then {type:"final", data} with the same body the
 * JSON reply carries, or {type:"error", code, error}. Refusals stay plain JSON with their status. Clients
 * without the header (the iOS app) get the single JSON reply, unchanged.
 *
 * Memory (api/_lib/user-memory.ts): for a signed-in Apple/Google account with memory on, the CIO also sees a
 * compact `reader` (explicit preferences, how often they asked), for framing only: sufficiency and the verdict
 * depend on the question and the evidence alone. The reader never reaches the client: the body only says
 * `personalized: true`. Everything here is off unless BOBBY_MEMORY === 'on' (memoryPersonalizationOn). The ask is
 * recorded after the answer was delivered, never on a refusal or a failure. Anonymous and wallet requests
 * make no memory call; neither does the iPhone app until it can show and delete memory (MEMORY_PLATFORMS).
 */
function refuse(res: VercelResponse, status: number, code: string, error: string, extra: Record<string, unknown> = {}) {
  return res.status(status).json({ error, code, ...extra });
}

/** The promise's value, or null once `ms` have passed. Never rejects. */
function within<T>(task: Promise<T | null>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    task.then((v) => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(null); });
  });
}

/** Seconds until the exhausted quota window reopens; best effort, never blocks the answer. */
async function quotaRetryAfter(quota: { caller: string; network: string }): Promise<number> {
  const DAY = 86_400;
  try {
    const keys = `("caller:${quota.caller}","net:${quota.network}",global)`;
    const r = await fetch(bobbyRest(`bobby_desk_quotas?key=in.${encodeURIComponent(keys)}&select=key,hits,expires_at`), { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(3000) });
    if (!r.ok) return DAY;
    const rows = await r.json() as Array<{ key: string; hits: number; expires_at: string }>;
    const waits = rows.filter(row => row.hits >= quotaCeiling(row.key))
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
  const rawLang = (req.body as { language?: unknown } | undefined)?.language;
  const lang: Lang = rawLang === 'es' || rawLang === 'pt' ? rawLang : 'en';
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    return refuse(res, 400, 'invalid_request', copy(lang, 'Choose an asset and type a question.', 'Elige un activo y escribe una pregunta.'));
  }
  const { symbol, question, language, assetType, level } = parsed.data;
  // A code point is at most two UTF-16 units: the first test bounds Array.from's work.
  if (question.length > DESK_QUESTION_MAX * 2 || Array.from(question).length > DESK_QUESTION_MAX) {
    return refuse(res, 400, 'question_too_long', copy(language, 'Your question is too long. Keep it to 1,200 characters or fewer.', 'Tu pregunta es demasiado larga. Usa 1,200 caracteres o menos.'), { maxLength: DESK_QUESTION_MAX });
  }
  const unavailable = copy(language, 'The analysis desk is temporarily unavailable.', 'La mesa de análisis no está disponible por ahora.');
  const failed = copy(language, 'The analysis could not finish. Please retry. No verdict was issued.', 'El análisis no pudo terminar. Inténtalo de nuevo. No se emitió ningún veredicto.');
  const live = String(req.headers.accept ?? '').includes('application/x-ndjson');
  // The reader closed the stream: the remaining model calls are not made for nobody.
  const left = new AbortController();
  res.on?.('close', () => { if (!res.writableFinished) left.abort(); });
  const usage: LlmUsage[] = [];
  let useId: number | null = null;
  let readId: number | null = null;
  let access: Access | null = null;
  const refund = async () => {
    const results = await Promise.all([refundRead(readId), refundLevel(useId)]);
    return results.every(Boolean);
  };
  // undefined: not resolved yet; the premium meter resolves the caller and hands it over.
  let knownIdentity: Identity | null | undefined;
  let streaming = false;
  try {
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) return refuse(res, 503, 'desk_unavailable', unavailable);
    // The spend guard reads the ledger before anything is spent: premium pauses above the daily cap, the
    // whole desk at the monthly hard cap (api/_lib/llm-usage.ts).
    const budget = await llmBudget();
    if (budget.allPaused || (level !== 'rapido' && budget.premiumPaused)) {
      return refuse(res, 503, 'budget_paused', level === 'rapido' || budget.allPaused
        ? copy(language, 'The desk is paused for now. Try again later.', 'El desk está en pausa por ahora. Inténtalo más tarde.')
        : copy(language, 'Deep and Max are paused for today. Quick still works.', 'Profundo y Máximo están en pausa por hoy. Rápido sigue disponible.'), { level, quickAvailable: !budget.allPaused });
    }
    const addressKeys = getClientQuotaKeys(req);
    if (!addressKeys) return refuse(res, 503, 'desk_unavailable', unavailable);
    // A premium level spends its own allowance before any model call; a failed analysis gives it back.
    if (level !== 'rapido') {
      const gate = await consumeLevel(req, level, symbol);
      if (!gate) return refuse(res, 503, 'desk_unavailable', unavailable);
      if (!gate.allowed) {
        const meter = { tier: gate.tier, used: gate.used, limit: gate.limit, resetsAt: gate.resetsAt };
        if (gate.code === 'signin_required') return refuse(res, 403, 'signin_required', copy(language, 'Create your free account to use this level.', 'Crea tu cuenta gratis para usar este nivel.'), { level, meter });
        if (gate.code === 'upgrade_required') return refuse(res, 403, 'upgrade_required', copy(language, 'You used this level for now. Get Bobby Pro or invite a friend.', 'Ya usaste este nivel por ahora. Obtén Bobby Pro o invita a un amigo.'), { level, meter });
        return refuse(res, 403, 'level_exhausted', copy(language, 'You used this level for this month.', 'Ya usaste este nivel este mes.'), { level, meter });
      }
      useId = gate.useId;
      knownIdentity = gate.identity;
    }
    // One meter owner for all clients: a denied premium request never spends a general read.
    // Missing device identity or unavailable storage cannot bypass the anonymous cap.
    const read = await consumeRead(req, symbol, { strict: true, identity: knownIdentity });
    if (!read.allowed) {
      await refund();
      if (read.code === 'access_unavailable') return refuse(res, 503, 'desk_unavailable', unavailable);
      return refuse(res, read.code === 'signin_required' ? 401 : 402, read.code ?? 'subscription_required',
        read.code === 'signin_required'
          ? copy(language, 'Create your free account to keep reading.', 'Crea tu cuenta gratis para seguir leyendo.')
          : copy(language, 'Your general read allowance is used for now.', 'Tu cupo de lecturas generales se agotó por ahora.'), { access: read.access });
    }
    readId = read.readId;
    access = read.access;
    knownIdentity = read.identity;
    // Atomic, cross-instance, fail-closed daily limits, spent only once the reader's own meter allowed the
    // read (a refused request never uses the shared budget). Caller (IPv4 / IPv6 /64) and network (/24 / /48)
    // budgets keep a handful of addresses from spending everyone's global budget. A Bobby Pro account is keyed
    // by the account instead, so a shared office or carrier network never caps a paying reader; the global
    // ceiling still applies to everyone. No model calls if storage fails.
    const keys = access?.tier === 'pro' && knownIdentity
      ? { caller: saltedKey(`pro-caller:${knownIdentity.id}`), network: saltedKey(`pro-network:${knownIdentity.id}`) }
      : addressKeys;
    const quota = await fetch(bobbyRest('rpc/bobby_consume_desk_quota'), {
      method: 'POST', headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ p_caller: keys.caller, p_network: keys.network }),
    }).catch(() => null);
    if (!quota?.ok) { await refund(); return refuse(res, 503, 'desk_unavailable', unavailable); }
    if (await quota.json() !== true) {
      await refund();
      // Caller, network and global windows are all 24 h: this is not "retry in a moment".
      res.setHeader('Retry-After', String(await quotaRetryAfter(keys)));
      return refuse(res, 429, 'daily_limit', copy(language, "Bobby reached today's analysis limit. Try again tomorrow.", 'Bobby llegó al límite de análisis de hoy. Vuelve a intentarlo mañana.'));
    }
    const send = (line: Record<string, unknown>) => { if (!res.writableEnded) res.write(`${JSON.stringify(line)}\n`); };
    if (live) {
      streaming = true;
      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();
      send({ type: 'accepted', level, access });
    }
    // Memory runs beside the evidence and never delays the answer by more than its timeout: a slow or failed
    // lookup is simply no memory. No call at all without an Apple/Google session, nor from a platform whose app
    // cannot show and delete memory yet (MEMORY_PLATFORMS), nor while the kill switch is off (BOBBY_MEMORY).
    const memoryOwner = memoryPersonalizationOn() && MEMORY_PLATFORMS.has(clientPlatform(req)) ? memoryIdentity(req, knownIdentity) : Promise.resolve(null);
    const summaryTask = memoryOwner.then((id) => (id ? memorySummary(id.id, symbol) : null));
    const evidence = levelPlan(level).evidence === 'v2' ? await loadDeskEvidenceV2(symbol, assetType) : await loadDeskEvidence(symbol, assetType);
    const summary: MemorySummary | null = await within(summaryTask, MEMORY_SUMMARY_TIMEOUT_MS);
    const reader = readerContext(summary, symbol, Date.now(), summary?.enabled ? (await memoryOwner.catch(() => null))?.firstName : null, evidence.technicals.price, language);
    const asked = horizonOf(question);
    const result = await runDeskDebate(question, evidence, language, { level, usage, signal: left.signal, onEvent: live ? send : undefined, reader });
    // The reader left before the answer reached them (the last call was already in flight): nothing was
    // delivered, so a premium use is given back.
    if (left.signal.aborted) { const pendingRefund = refund(); waitUntil(pendingRefund); await pendingRefund; return; }
    const body = { ...result, access, ...(reader ? { personalized: true } : {}) };
    // Only a delivered answer is remembered. A memory the summary showed paused is not even asked; when the
    // summary was unavailable the database decides (it skips paused memories and non-accounts).
    const remember = () => {
      if (summary && !summary.enabled) return;
      waitUntil(memoryOwner.then((id) => (id ? recordAsk(id.id, symbol, asked, evidence.technicals.price) : false)).catch(() => false));
    };
    if (!live) { res.status(200).json(body); remember(); return; }
    send({ type: 'final', data: body });
    res.end();
    remember();
    return;
  } catch (error) {
    const refunded = await refund();
    // Never log private questions, model payloads, or provider credentials — only the rejection class.
    if (error instanceof DeskOutputRejected) console.error('[desk-debate] model output rejected', error.reason);
    // Readers always get the same plain failure; the provider detail stays in the log below and, for exhausted
    // credit, in the owner's alert email (api/_lib/provider-alert.ts).
    const failureMessage = failed;
    // Safe diagnostics only: no question, bearer, account, raw provider error or generated text.
    console.error(JSON.stringify({ route: 'desk-debate', event: 'analysis_failed',
      providerStatus: error instanceof LlmHttpError ? error.status : null,
      providerCode: error instanceof LlmHttpError ? error.providerCode : null,
      failureKind: error instanceof LlmHttpError ? 'provider_http' : error instanceof DeskOutputRejected ? 'output_rejected' : 'analysis_error',
      role: usage.at(-1)?.role ?? null, level, refunded }));
    if (streaming) {
      if (!res.writableEnded) { res.write(`${JSON.stringify({ type: 'error', code: 'analysis_failed', error: failureMessage, refunded: (useId !== null || readId !== null) && refunded })}\n`); res.end(); }
      return;
    }
    return refuse(res, 503, 'analysis_failed', failureMessage);
  } finally {
    // The response is already sent here and Vercel freezes the function once it has ended: the ledger
    // write must be registered with waitUntil, or it only lands when the instance wakes for another request
    // (seen in prod on 2026-09-29: a Rápido read was never recorded).
    waitUntil(logLlmUsage(usage, { surface: 'desk', level }));
  }
}
