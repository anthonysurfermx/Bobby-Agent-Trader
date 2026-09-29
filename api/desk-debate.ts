import type { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';
import { requestOriginHost } from './_lib/origins.js';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { getClientQuotaKeys } from './_lib/rate-limit.js';
import { DESK_QUESTION_MAX, DeskOutputRejected, horizonOf, loadDeskEvidence, loadDeskEvidenceV2, runDeskDebate } from './_lib/desk-debate.js';
import { levelPlan, needsAnthropic } from './_lib/desk-levels.js';
import { clientPlatform, consumeLevel, refundLevel } from './_lib/access.js';
import { llmBudget, logLlmUsage } from './_lib/llm-usage.js';
import type { LlmUsage } from './_lib/llm.js';
import type { Identity } from './_lib/user-identity.js';
import { memoryPersonalizationOn, memoryPlatformAllowed, MEMORY_SUMMARY_TIMEOUT_MS, memoryIdentity, memorySummary, preferredNameFrom, readerContext, recordRead, updatePrefs, type MemorySummary } from './_lib/user-memory.js';
import { personalNote, type CurrentRead, type PersonalNote } from './_lib/memory-note.js';
import { asksForRelated, loadRelated } from './_lib/desk-related.js';

// Máximo runs four Sonnet calls inside a 160 s budget (api/_lib/desk-levels.ts).
export const config = { maxDuration: 180 };

/**
 * Mirrors bobby_consume_desk_quota (20260919200000). A refused call consumes
 * nothing, so an exhausted key holds exactly its ceiling.
 */
const QUOTA_CEILING = { global: 600, network: 60, caller: 30 } as const;
const quotaCeiling = (key: string) => key === 'global' ? QUOTA_CEILING.global : key.startsWith('net:') ? QUOTA_CEILING.network : QUOTA_CEILING.caller;

const Body = z.object({ symbol: z.string().regex(/^[A-Z0-9.^=-]{1,20}$/), assetType: z.enum(['equity','crypto']).optional(), question: z.string().trim().min(1), language: z.enum(['en','es','pt']).default('en'), level: z.enum(['rapido','profundo','maximo']).default('rapido'), tz: z.string().max(64).optional() });

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
 * Memory (api/_lib/user-memory.ts): the debate never sees it, so the verdict depends on the question and the
 * evidence alone. For a signed-in Apple/Google account with memory on, a short personal note is written AFTER
 * the verdict from what Bobby remembers (name, past asks, the stored previous answer on this asset, the price
 * change since) and returned as `personal: {note, basedOn, source}` with `personalized: true`; the memory itself
 * never reaches the client. The read is recorded (price with its own time, and what Bobby answered) after it
 * was delivered, never on a refusal or a failure. "Call me X" in the question sets the preferred name. Off
 * unless BOBBY_MEMORY === 'on'. Anonymous and wallet requests make no memory call; the iPhone app joins only
 * from a build that can show and delete memory (X-Bobby-Memory: 1).
 *
 * A question about the sector, alternatives or a comparison also loads a small peer set with current daily
 * data (api/_lib/desk-related.ts), returned as `related`.
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
  const { symbol, question, language, assetType, level, tz } = parsed.data;
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
  // undefined: not resolved yet; the premium meter resolves the caller and hands it over.
  let knownIdentity: Identity | null | undefined;
  let streaming = false;
  try {
    if (!process.env.OPENAI_API_KEY || (needsAnthropic(level) && !process.env.ANTHROPIC_API_KEY)) return refuse(res, 503, 'desk_unavailable', unavailable);
    // The spend guard reads the ledger before anything is spent: premium pauses above the daily cap, the
    // whole desk at the monthly hard cap (api/_lib/llm-usage.ts).
    const budget = await llmBudget();
    if (budget.allPaused || (level !== 'rapido' && budget.premiumPaused)) {
      return refuse(res, 503, 'budget_paused', level === 'rapido' || budget.allPaused
        ? copy(language, 'The desk is paused for now. Try again later.', 'El desk está en pausa por ahora. Inténtalo más tarde.')
        : copy(language, 'Deep and Max are paused for today. Quick still works.', 'Profundo y Máximo están en pausa por hoy. Rápido sigue disponible.'), { level });
    }
    // Atomic, cross-instance, fail-closed limits. No model calls if storage fails.
    // Caller (IPv4 address / IPv6 /64) and network (/24 / /48) budgets keep a
    // handful of addresses from spending everyone's global budget.
    const keys = getClientQuotaKeys(req);
    if (!keys) return refuse(res, 503, 'desk_unavailable', unavailable);
    const quota = await fetch(bobbyRest('rpc/bobby_consume_desk_quota'), {
      method: 'POST', headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ p_caller: keys.caller, p_network: keys.network }),
    });
    if (!quota.ok) return refuse(res, 503, 'desk_unavailable', unavailable);
    if (await quota.json() !== true) {
      // Caller, network and global windows are all 24 h: this is not "retry in a moment".
      res.setHeader('Retry-After', String(await quotaRetryAfter(keys)));
      return refuse(res, 429, 'daily_limit', copy(language, "Bobby reached today's analysis limit. Try again tomorrow.", 'Bobby llegó al límite de análisis de hoy. Vuelve a intentarlo mañana.'));
    }
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
    const send = (line: Record<string, unknown>) => { if (!res.writableEnded) res.write(`${JSON.stringify(line)}\n`); };
    if (live) {
      streaming = true;
      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();
      send({ type: 'accepted', level });
    }
    // Memory runs beside the evidence and never delays the answer by more than its timeout: a slow or failed
    // lookup is simply no memory. No call at all without an Apple/Google session, nor from an app build that
    // cannot show and delete memory, nor while the kill switch is off (BOBBY_MEMORY).
    const platform = clientPlatform(req);
    const memoryOwner = memoryPersonalizationOn() && memoryPlatformAllowed(platform, req) ? memoryIdentity(req, knownIdentity) : Promise.resolve(null);
    const summaryTask = memoryOwner.then((id) => (id ? memorySummary(id.id, symbol) : null));
    const relatedTask = asksForRelated(question) ? loadRelated(symbol, language) : Promise.resolve(null);
    const evidence = levelPlan(level).evidence === 'v2' ? await loadDeskEvidenceV2(symbol, assetType) : await loadDeskEvidence(symbol, assetType);
    const [summary, related] = await Promise.all([within(summaryTask, MEMORY_SUMMARY_TIMEOUT_MS), relatedTask]);
    const saidName = preferredNameFrom(question);
    const owner = summary?.enabled ? await memoryOwner.catch(() => null) : null;
    const reader = readerContext(summary, {
      symbol, name: saidName ?? summary?.preferredName ?? owner?.firstName ?? null,
      priceNow: evidence.technicals.price, priceNowAt: evidence.provenance.asOf, language, timeZone: tz,
    });
    const asked = horizonOf(question);
    const result = await runDeskDebate(question, evidence, language, { level, usage, signal: left.signal, onEvent: live ? send : undefined, related });
    // The verdict is final here. The note is written from it and from memory; it cannot change it.
    const said = result.agents.synthesis as CurrentRead['synthesis'];
    const plan = levelPlan('rapido');
    const personal: PersonalNote | null = reader
      ? await personalNote(reader, symbol, { verdict: result.agents.verdict, direction: result.agents.direction, synthesis: said }, language,
        { spec: plan.cio, fallback: plan.fallback, usage, signal: left.signal })
      : null;
    // The reader left before the answer reached them (the last call was already in flight): nothing was
    // delivered, so a premium use is given back.
    if (left.signal.aborted) { const refund = refundLevel(useId); waitUntil(refund); await refund; return; }
    const body = personal ? { ...result, personal, personalized: true } : result;
    // Only a delivered answer is remembered: the price with its own time and source, and what Bobby said. A
    // memory the summary showed paused is not even asked; when the summary was unavailable the database
    // decides (it skips paused memories and non-accounts).
    const remember = () => {
      if (summary && !summary.enabled) return;
      const s = said;
      waitUntil(memoryOwner.then(async (id) => {
        if (!id) return false;
        if (saidName) await updatePrefs(id.id, { preferredName: saidName }).catch(() => undefined);
        return recordRead(id.id, symbol, asked, {
          price: evidence.technicals.price, priceAt: evidence.provenance.asOf, priceSource: evidence.provenance.provider,
          read: { verdict: result.agents.verdict, direction: result.agents.direction, headline: s.headline, why: s.why, risk: s.risk, watch: s.watch, level, language, platform },
        });
      }).catch(() => false));
    };
    if (!live) { res.status(200).json(body); remember(); return; }
    send({ type: 'final', data: body });
    res.end();
    remember();
    return;
  } catch (error) {
    await refundLevel(useId);
    // Never log private questions, model payloads, or provider credentials — only the rejection class.
    if (error instanceof DeskOutputRejected) console.error('[desk-debate] model output rejected', error.reason);
    if (streaming) {
      if (!res.writableEnded) { res.write(`${JSON.stringify({ type: 'error', code: 'analysis_failed', error: failed, refunded: useId !== null })}\n`); res.end(); }
      return;
    }
    return refuse(res, 503, 'analysis_failed', failed);
  } finally {
    // The response is already sent here and Vercel freezes the function once it has ended: the ledger
    // write must be registered with waitUntil, or it only lands when the instance wakes for another request
    // (seen in prod on 2026-09-29: a Rápido read was never recorded).
    waitUntil(logLlmUsage(usage, { surface: 'desk', level }));
  }
}
