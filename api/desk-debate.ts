import type { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';
import { APP_LANGUAGES, APP_LOCALES, appLanguage, appLocale, isAppLocale, type AppLanguage } from '../src/lib/app-language.js';
import { deskErrorCopy } from './_lib/desk-localization.js';
import { requestOriginHost } from './_lib/origins.js';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { getClientQuotaKeys, saltedKey } from './_lib/rate-limit.js';
import { DESK_QUESTION_MAX, DeskOutputRejected, DeskThesisSchema, horizonOf, loadDeskEvidenceFor, runDeskDebate, timeframeRequestOf } from './_lib/desk-debate.js';
import { levelPlan } from './_lib/desk-levels.js';
import { clientPlatform, consumeRead, refundRead, consumeLevel, refundLevel, recordOutcome, resolveCaller, type Access, type DeskOutcome } from './_lib/access.js';
import { llmBudget, logLlmUsage } from './_lib/llm-usage.js';
import { LlmHttpError, type LlmUsage } from './_lib/llm.js';
import type { Identity } from './_lib/user-identity.js';
import { clientBinding, issueClientReadReceipt } from './_lib/client-telemetry.js';
import { memoryDeskAllowed, MEMORY_RECORD_TIMEOUT_MS, MEMORY_SUMMARY_TIMEOUT_MS, memoryIdentity, memoryReceipt, memorySummary, readerContext, recordAsk, type MemoryReceipt, type MemorySummary } from './_lib/user-memory.js';

// Máximo runs four Sonnet calls inside a 160 s budget (api/_lib/desk-levels.ts).
export const config = { maxDuration: 180 };

/**
 * Mirrors bobby_consume_desk_quota (20260919200000). A refused call consumes
 * nothing, so an exhausted key holds exactly its ceiling.
 */
const QUOTA_CEILING = { global: 600, network: 60, caller: 30 } as const;
const quotaCeiling = (key: string) => key === 'global' ? QUOTA_CEILING.global : key.startsWith('net:') ? QUOTA_CEILING.network : QUOTA_CEILING.caller;

// `thesis` (1.8) is the only field a 1.5-1.7 client never sends. The outer body stays tolerant (unknown keys are
// dropped, as before); the thesis object itself is strict, and an invalid one is a 400 like any other field.
const Body = z.object({ symbol: z.string().regex(/^[A-Z0-9.^=-]{1,20}$/), assetType: z.enum(['equity','crypto']).optional(), question: z.string().trim().min(1), language: z.enum(APP_LANGUAGES).default('en'), locale: z.enum(APP_LOCALES).optional(), level: z.enum(['rapido','profundo','maximo']).default('rapido'), requestId: z.string().uuid().optional(), thesis: DeskThesisSchema.nullish() })
  .refine(body => body.locale === undefined || isAppLocale(body.locale, body.language), { path: ['locale'], message: 'Locale must match language' });

/**
 * Kill switch for the thesis review: with BOBBY_THESIS_REVIEW exactly 'off' a valid `thesis` is ignored and the
 * request is answered as a plain read (no reviewer call, no `review` key, the note goes nowhere). Unset or
 * anything else = on. Read per request, never cached.
 */
const thesisReviewOn = (env: NodeJS.ProcessEnv = process.env) => env.BOBBY_THESIS_REVIEW !== 'off';

type Lang = AppLanguage;
const copy = deskErrorCopy;

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
 * `personalized: true`. Everything here is off unless BOBBY_MEMORY === 'on'; iOS also requires an explicit opt-in on this request. The ask is
 * recorded once the answer is complete and its reader is still there, never on a refusal, a failure or an
 * abandoned read. Anonymous and wallet requests make no memory call; the iPhone and Android apps also need
 * their per-request memory opt-in. For a request memory applies to, the write is awaited (at most
 * MEMORY_RECORD_TIMEOUT_MS) before the reply is built, and the body carries `memory: { recorded, asks,
 * lastAskedDaysAgo, changeSinceLastAskPct }`: `recorded` is true only when the database confirmed the write, and
 * `asks` counts this question only then. Numbers only, from the summary the CIO's reader was built from; `asks`
 * is null when that count was not read (memory paused, or the summary unavailable: the ask is still offered to
 * the database, which decides, and `recorded` says what it answered). No `memory` key at all when memory does
 * not apply, and then no memory call is made either.
 *
 * Thesis review (1.8): a request may carry `thesis`, the person's own note (hypothesis, what worries them, what
 * would change their mind, a horizon, when they saved it and at what price). The read is the same read at the
 * requested level, with the same meters, quotas and refunds, and no agent of the debate sees the note: Alpha,
 * Red Team, the second round and the CIO receive exactly the requests of the same question without it, so the
 * verdict, the direction, the sufficiency note and the synthesis cannot depend on it. When they are final, one
 * more model call (the "reviewer": the level's cheapest model at low effort, with a small token ceiling) reads
 * the note as untrusted data beside the same evidence, the finished answer and the server-computed change since
 * the note was saved, and returns three lists and nothing else. The body gains
 * `review: { supports, challenges, unknowns, notChecked }` (the NDJSON `final` line carries the same body; no
 * new event is streamed). `notChecked` is written by the server: the evidence kinds the desk does not load. If
 * the reviewer fails, times out, is cut off, is skipped for lack of time or has every item rejected by the
 * guard, the read is served all the same with three empty lists and `notChecked`: it is never an
 * `analysis_failed`, never refunded and never asked again. Its cost is a row of its own in the ledger (role
 * `reviewer`, surface `desk`), which the spend guard sums. A request without `thesis` is answered exactly as
 * before, with no reviewer call and no `review` key; so is every request while BOBBY_THESIS_REVIEW is 'off'.
 * The note is used for that one answer and leaves the server in that one request to the AI provider: it is
 * never stored, logged, or written to the ledger or the funnel.
 *
 * Chart timeframe: a question that names one ("en diario", "weekly chart", "4H") is analysed on it at every level.
 * Its candles are loaded beside the level's evidence and its block becomes `technicals`, with `provenance.timeframe`
 * and `provenance.asOf` naming it; `sufficiency.requested` lists what was asked and `sufficiency.missing` what the
 * desk could not load (monthly; weekly or 4H for a stock), in which case the nearest timeframe leads and the answer
 * says so first. The level, the model calls and the meters are the same as without it. The question is the only
 * signal: no request field, and a question that names none answers on 1H exactly as before.
 *
 * Next question: `agents.synthesis.followUp` is always a string of 6 to 160 characters (shipped clients decode
 * it). It is the CIO's own when that is a what-or-why question about the asset; when it breaks the output guard
 * or the next-question rule (api/_lib/desk-next-question.ts: whether or when to act, a statement, a price, a word
 * the copy never uses, another language than the reply's, a word outside the list such a question is written
 * with), or is the very question this request asked, the reply carries a fixed question in the reply's language
 * instead and the read is served: never an `analysis_failed`, never a refund. There are two fixed questions, so
 * a reader who taps the first and is answered is offered the second, never the one just answered. The log line
 * `{ route: 'desk-debate', event: 'follow_up_replaced', reason, language, level }` counts how often, by class
 * (advice, guarantee, act, word, number, shape, opener, language, unlisted; 'repeat' for the question just
 * asked) and without any text.
 *
 * Outcomes (bobby_events, the owner's funnel): every request that passes validation records exactly one, with the
 * caller resolved before any gate (a budget pause by a signed-in account carries that account). A 405, a foreign
 * origin or a 400 is not a desk attempt and records none. A reader who closes the request before the answer
 * reaches them is `read_abandoned`, never `read_failed`.
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
  const lang: Lang = appLanguage(rawLang);
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    return refuse(res, 400, 'invalid_request', copy(lang, 'Choose an asset and type a question.', 'Elige un activo y escribe una pregunta.'));
  }
  const { symbol, question, language, assetType, level, requestId } = parsed.data;
  const locale = appLocale(language, parsed.data.locale);
  // Validated above even when the review is switched off; from here on it only ever travels to the reviewer call.
  const thesis = thesisReviewOn() ? parsed.data.thesis ?? null : null;
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
  // Resolved once, before any gate, and handed to both meters and every outcome. An auth outage counts as
  // anonymous, as on every desk read (never throws).
  const knownIdentity: Identity | null = await resolveCaller(req);
  let streaming = false;
  // What happened, for the owner's funnel: at most once per request, recorded after answering and never on the
  // reader's time. Registered with waitUntil and awaited in `finally`, once the response is already sent.
  let pending: Promise<void> | null = null;
  const outcome = (event: DeskOutcome, detail: string | null = null) => {
    if (pending) return;
    pending = recordOutcome(req, event, knownIdentity, detail);
    waitUntil(pending);
  };
  // The reader left before the answer reached them: nothing was delivered, so the read and a premium use are
  // given back.
  // The ledger marks the run as abandoned too, so the dashboard never counts it as a failed analysis.
  let abandoned = false;
  const abandon = async () => { abandoned = true; const pendingRefund = refund(); waitUntil(pendingRefund); outcome('read_abandoned', 'left'); await pendingRefund; };
  try {
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) { outcome('desk_blocked', 'no_provider_keys'); return refuse(res, 503, 'desk_unavailable', unavailable); }
    // The spend guard reads the ledger before anything is spent: premium pauses above the daily cap, the
    // whole desk at the monthly hard cap (api/_lib/llm-usage.ts).
    const budget = await llmBudget();
    if (budget.allPaused || (level !== 'rapido' && budget.premiumPaused)) {
      outcome('desk_blocked', budget.allPaused ? 'budget_paused' : 'premium_paused');
      return refuse(res, 503, 'budget_paused', level === 'rapido' || budget.allPaused
        ? copy(language, 'The desk is paused for now. Try again later.', 'El desk está en pausa por ahora. Inténtalo más tarde.')
        : copy(language, 'Deep and Max are paused for today. Quick still works.', 'Profundo y Máximo están en pausa por hoy. Rápido sigue disponible.'), { level, quickAvailable: !budget.allPaused });
    }
    const addressKeys = getClientQuotaKeys(req);
    if (!addressKeys) { outcome('desk_blocked', 'no_address'); return refuse(res, 503, 'desk_unavailable', unavailable); }
    // A premium level spends its own allowance before any model call; a failed analysis gives it back.
    if (level !== 'rapido') {
      const gate = await consumeLevel(req, level, symbol, { identity: knownIdentity });
      if (!gate) { outcome('desk_blocked', 'level_unavailable'); return refuse(res, 503, 'desk_unavailable', unavailable); }
      if (!gate.allowed) {
        const meter = { tier: gate.tier, used: gate.used, limit: gate.limit, resetsAt: gate.resetsAt };
        // A guest asked to sign in is the sign-in wall, not a paying intent; only plan limits are wall_level.
        if (gate.code === 'signin_required') outcome('wall_signin', level);
        else outcome('wall_level', `${level}-${gate.code ?? 'refused'}`);
        if (gate.code === 'signin_required') return refuse(res, 403, 'signin_required', copy(language, 'Create your free account to use this level.', 'Crea tu cuenta gratis para usar este nivel.'), { level, meter });
        if (gate.code === 'upgrade_required') return refuse(res, 403, 'upgrade_required', copy(language, 'You used this level for now. Get Bobby Pro or invite a friend.', 'Ya usaste este nivel por ahora. Obtén Bobby Pro o invita a un amigo.'), { level, meter });
        return refuse(res, 403, 'level_exhausted', copy(language, 'You used this level for this month.', 'Ya usaste este nivel este mes.'), { level, meter });
      }
      useId = gate.useId;
    }
    // One meter owner for all clients: a denied premium request never spends a general read.
    // Missing device identity or unavailable storage cannot bypass the anonymous cap.
    const read = await consumeRead(req, symbol, { strict: true, identity: knownIdentity });
    if (!read.allowed) {
      await refund();
      outcome(read.code === 'signin_required' ? 'wall_signin' : read.code === 'subscription_required' ? 'wall_paywall' : 'desk_blocked',
        read.code === 'signin_required' || read.code === 'subscription_required' ? level : 'unavailable');
      if (read.code === 'access_unavailable') return refuse(res, 503, 'desk_unavailable', unavailable);
      return refuse(res, read.code === 'signin_required' ? 401 : 402, read.code ?? 'subscription_required',
        read.code === 'signin_required'
          ? copy(language, 'Create your free account to keep reading.', 'Crea tu cuenta gratis para seguir leyendo.')
          : copy(language, 'Your general read allowance is used for now.', 'Tu cupo de lecturas generales se agotó por ahora.'), { access: read.access });
    }
    readId = read.readId;
    access = read.access;
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
    if (!quota?.ok) { await refund(); outcome('desk_blocked', 'unavailable'); return refuse(res, 503, 'desk_unavailable', unavailable); }
    if (await quota.json() !== true) {
      await refund();
      outcome('desk_blocked', 'daily_limit');
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
    const memoryOwner = memoryDeskAllowed(req, clientPlatform(req)) ? memoryIdentity(req, knownIdentity) : Promise.resolve(null);
    const summaryTask = memoryOwner.then((id) => (id ? memorySummary(id.id, symbol) : null));
    const evidence = await loadDeskEvidenceFor(symbol, assetType, levelPlan(level).evidence, timeframeRequestOf(question, language));
    const summary: MemorySummary | null = await within(summaryTask, MEMORY_SUMMARY_TIMEOUT_MS);
    const reader = readerContext(summary, symbol, Date.now(), summary?.enabled ? (await memoryOwner.catch(() => null))?.firstName : null, evidence.technicals.price, language, locale, evidence.provenance.assetType === 'crypto' ? 'crypto' : 'equity');
    const asked = horizonOf(question, language);
    const result = await runDeskDebate(question, evidence, language, { locale, level, usage, signal: left.signal, onEvent: live ? send : undefined, reader, ...(thesis ? { thesis } : {}) });
    // The reader left while the last call was already in flight.
    if (left.signal.aborted) { await abandon(); return; }
    const telemetry = issueClientReadReceipt(clientBinding(req, knownIdentity), requestId);
    // Memory, for a request it applies to (no owner: no memory call and no `memory` key). The answer is complete
    // and its reader is still here, so the ask is recorded now and the reply says what really happened: the
    // write is awaited for at most MEMORY_RECORD_TIMEOUT_MS and `recorded` is the database's own answer, false
    // when it refused, failed or did not confirm in time. A memory the summary showed paused is not even asked;
    // when the summary was unavailable the database decides (it skips paused memories and non-accounts).
    // Nothing is recorded on a refusal, a failure or an abandoned read: none of them reaches this line. (A
    // reader who goes away during this last wait is like one who goes away as the reply is being sent: the
    // answer was complete and theirs, and it is sent.)
    const owner = await memoryOwner.catch(() => null);
    let memory: MemoryReceipt | null = null;
    if (owner) {
      const paused = summary !== null && !summary.enabled;
      const kept = !paused && await within(recordAsk(owner.id, symbol, asked, evidence.technicals.price, MEMORY_RECORD_TIMEOUT_MS), MEMORY_RECORD_TIMEOUT_MS) === true;
      // The counts come from the summary the reader was built from: no second query.
      memory = memoryReceipt(summary, reader, kept);
    }
    const body = { ...result, access, ...(reader ? { personalized: true } : {}), ...(memory ? { memory } : {}), ...(telemetry ? { telemetry } : {}) };
    if (!live) { res.status(200).json(body); outcome('read_done', level); return; }
    send({ type: 'final', data: body });
    res.end();
    outcome('read_done', level);
    return;
  } catch (error) {
    // The reader left and the next role refused to start for nobody ('Desk request closed'): abandoned, not failed.
    if (left.signal.aborted) { await abandon(); return; }
    const refunded = await refund();
    outcome('read_failed', error instanceof LlmHttpError ? 'provider_http' : error instanceof DeskOutputRejected ? 'output_rejected' : 'analysis_error');
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
    waitUntil(logLlmUsage(usage, { surface: 'desk', level, abandoned }));
    if (!pending) { console.error('[desk-debate] exit without outcome'); outcome('read_failed', 'unsettled'); }
    await pending;
  }
}
