// ============================================================
// Bobby Pro market briefings — the paid-attempt reservation (bobby_brief_budget_* RPCs, decision D8).
// Every provider HTTP attempt runs inside withReservation:
//   reserve (dedicated UTC day/month caps, global slots per kind, attempts per work item, no unresolved attempt)
//   → dispatch (marked right before the call) → ONE call → settle (actual, no_charge or unknown) → ledger row.
// Invariants:
//   · fail closed: missing caps ⇒ 'budget_unavailable'; any database error before the call ⇒ 'storage_unavailable';
//     in both cases no provider call is made;
//   · never retries: the caller decides whether another reserved attempt is worth it (the reservation's own
//     attempt cap and the work_unresolved rule bound that);
//   · a settle that fails after the call leaves the attempt 'dispatched'; reconciliation assumes the reserved
//     charge after BOBBY_BRIEFINGS_SETTLE_SECONDS, so an unrecorded spend is over-counted, never lost. A paid,
//     usable value is still returned to the caller;
//   · the bobby_llm_usage row carries numbers only (surface 'briefing' / 'briefing-voice'): no prompt, no text,
//     no identity. An `unknown` attempt is logged at its reserved amount so the global spend view never
//     under-reports.
// ============================================================
import * as dbModule from './db.js';
import { logLlmUsage } from '../llm-usage.js';
import type { LlmUsage } from '../llm.js';
import { budgetCaps, llmSlots, MAX_ATTEMPTS_PER_WORK, ttsSlots } from './config.js';
import type { AttemptResult } from './providers.js';
import type { AttemptKind } from './types.js';

export type ReservationFailure =
  | 'budget_unavailable' | 'slots_full' | 'budget_exhausted' | 'work_unresolved' | 'attempts_exhausted'
  | 'provider_failed' | 'provider_unknown' | 'storage_unavailable';

export interface ReservationParams { kind: AttemptKind; workRef: string; provider: string; model: string; reserveUsd: number; worker: string }
export interface ReservationDeps { db: typeof import('./db.js'); logUsage: typeof logLlmUsage }

const SURFACE: Record<AttemptKind, string> = { llm: 'briefing', tts: 'briefing-voice' };
const ROLE: Record<AttemptKind, string> = { llm: 'narrative', tts: 'tts' };

const REFUSAL: Record<string, ReservationFailure> = {
  not_configured: 'budget_unavailable',
  slots_full: 'slots_full',
  budget_exhausted: 'budget_exhausted',
  work_unresolved: 'work_unresolved',
  attempts_exhausted: 'attempts_exhausted',
};

export async function withReservation<T>(
  p: ReservationParams,
  call: () => Promise<AttemptResult<T>>,
  deps?: Partial<ReservationDeps>,
): Promise<{ ok: true; value: T } | { ok: false; code: ReservationFailure }> {
  const db = deps?.db ?? dbModule;
  const logUsage = deps?.logUsage ?? logLlmUsage;
  const caps = budgetCaps();
  if (!caps) return { ok: false, code: 'budget_unavailable' };

  let attemptId: string;
  try {
    const r = await db.reserveAttempt({
      kind: p.kind, workRef: p.workRef, provider: p.provider, model: p.model, reserveUsd: p.reserveUsd,
      dayCap: caps.dayUsd, monthCap: caps.monthUsd, maxSlots: p.kind === 'llm' ? llmSlots() : ttsSlots(),
      maxAttemptsPerWork: MAX_ATTEMPTS_PER_WORK, worker: p.worker,
    });
    if (!r || typeof r !== 'object') return { ok: false, code: 'storage_unavailable' };
    if (!r.ok) return { ok: false, code: REFUSAL[(r as { code?: string }).code ?? ''] ?? 'storage_unavailable' };
    if (typeof r.attemptId !== 'string' || !r.attemptId) return { ok: false, code: 'storage_unavailable' };
    attemptId = r.attemptId;
  } catch {
    console.error('[briefings-budget]', p.kind, 'reserve', 'storage');
    return { ok: false, code: 'storage_unavailable' };
  }

  try {
    await db.dispatchAttempt(attemptId);
  } catch {
    // No call is made. Release the slot best effort; if that fails too the row stays 'reserved' for reconcile.
    console.error('[briefings-budget]', p.kind, 'dispatch', 'storage');
    try { await db.settleAttempt(attemptId, 'no_charge', 0, { latencyMs: 0 }); } catch { /* reconcile */ }
    return { ok: false, code: 'storage_unavailable' };
  }

  const started = Date.now();
  let result: AttemptResult<T>;
  try {
    result = await call();
  } catch {
    // An adapter must classify, never throw; if one does, the request may have been sent.
    result = { ok: false, outcome: 'unknown', code: 'adapter_threw', status: null, latencyMs: Date.now() - started };
  }

  // strict is off in tsconfig.api.json, so the union is narrowed by explicit casts, not by `ok`.
  type Paid = Extract<AttemptResult<T>, { usd: number }>;
  type Failed = Extract<AttemptResult<T>, { ok: false }>;
  const failed = result.ok ? null : (result as Failed);
  const paid = !failed || failed.outcome === 'charged' ? (result as Paid) : null;
  let outcome: 'settled' | 'no_charge' | 'unknown';
  let actual: number | null;
  if (paid) { outcome = 'settled'; actual = paid.usd; }
  else if (failed.outcome === 'no_charge') { outcome = 'no_charge'; actual = 0; }
  else { outcome = 'unknown'; actual = null; }
  const usage = paid ? paid.usage : { latencyMs: failed.latencyMs } as { tokensIn?: number; tokensOut?: number; chars?: number; latencyMs: number };
  const estimated = paid ? paid.estimated : false;

  try {
    await db.settleAttempt(attemptId, outcome, actual, { ...usage, estimated });
  } catch {
    console.error('[briefings-budget]', p.kind, 'settle', 'storage');
  }

  const row: LlmUsage = {
    provider: p.provider === 'anthropic' ? 'anthropic' : 'openai',
    model: p.model,
    role: ROLE[p.kind],
    tokensIn: usage.tokensIn ?? 0,
    tokensOut: usage.tokensOut ?? 0,
    tokensCached: 0,
    tokensReasoning: 0,
    usd: actual ?? p.reserveUsd,
    latencyMs: usage.latencyMs,
    stop: failed ? `${failed.outcome}:${failed.code}`.slice(0, 48) : 'stop',
    ok: result.ok,
  };
  try { await logUsage([row], { surface: SURFACE[p.kind] }); } catch { /* the ledger is best effort */ }

  if (!failed) return { ok: true, value: (result as Extract<AttemptResult<T>, { ok: true }>).value };
  return { ok: false, code: failed.outcome === 'unknown' ? 'provider_unknown' : 'provider_failed' };
}
