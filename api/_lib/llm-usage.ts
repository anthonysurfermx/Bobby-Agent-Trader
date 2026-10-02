// ============================================================
// The LLM cost ledger: one bobby_llm_usage row per model call (tokens, cost at list price, latency, how it
// stopped). Best effort and bounded: a ledger outage never fails or delays an answer by more than ~1.5 s,
// and no prompt, answer or user data is ever written — only the numbers.
// ============================================================
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import type { LlmUsage } from './llm.js';

/** `abandoned`: the reader left before the answer reached them. One marker row (role 'left', provider 'none', $0)
 *  is written with the run's batch, so the owner dashboard counts that run apart instead of as a failed analysis
 *  (bobby_admin_overview → llm.deskRuns.abandoned); provider figures never read it. */
export async function logLlmUsage(rows: LlmUsage[], context: { surface: string; level?: string | null; abandoned?: boolean }): Promise<void> {
  if (!rows.length) return;
  try {
    const body: Array<Record<string, unknown>> = rows.map((u) => ({
      surface: context.surface, level: context.level ?? null, role: u.role, provider: u.provider, model: u.model,
      tokens_in: u.tokensIn, tokens_out: u.tokensOut, tokens_cached: u.tokensCached, tokens_reasoning: u.tokensReasoning,
      usd: Number(u.usd.toFixed(6)), latency_ms: u.latencyMs, stop: u.stop, ok: u.ok,
    }));
    if (context.abandoned) {
      body.push({ surface: context.surface, level: context.level ?? null, role: 'left', provider: 'none', model: 'none',
        tokens_in: 0, tokens_out: 0, tokens_cached: 0, tokens_reasoning: 0, usd: 0, latency_ms: 0, stop: 'left', ok: false });
    }
    const r = await fetch(bobbyRest('bobby_llm_usage'), {
      method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(body), signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) console.error('[llm-usage] write failed', r.status);
  } catch {
    console.error('[llm-usage] write failed');
  }
}

// ------------------------------------------------------------
// The spend guard (Codex review of PR #103): the ledger's own sum decides, before any model call, whether
// the desk may spend. Premium levels pause above the daily cap; everything pauses at the monthly hard cap.
// Caps are env (USD): BOBBY_LLM_DAILY_CAP_USD (15), BOBBY_LLM_MONTHLY_CAP_USD (300), BOBBY_LLM_ALERT_USD (100).
// It covers what the ledger records — the desk today; voice and the cycle are not in it yet — so the
// provider consoles' own limits stay the real backstop.
// ------------------------------------------------------------
const cap = (name: string, fallback: number) => { const n = Number(process.env[name]); return Number.isFinite(n) && n > 0 ? n : fallback; };
export const llmCaps = () => ({ dayUsd: cap('BOBBY_LLM_DAILY_CAP_USD', 15), monthUsd: cap('BOBBY_LLM_MONTHLY_CAP_USD', 300), alertUsd: cap('BOBBY_LLM_ALERT_USD', 100) });

export interface LlmBudget { day: number; month: number; premiumPaused: boolean; allPaused: boolean }
let cached: { at: number; day: number; month: number } | null = null;
let alertedAt = 0;
const CACHE_MS = 60_000;

/** Today's and this month's desk spend (UTC), cached for a minute per instance. Null when the ledger is unreadable. */
export async function llmSpend(): Promise<{ day: number; month: number } | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached;
  try {
    const r = await fetch(bobbyRest('rpc/bobby_llm_spend'), { method: 'POST', headers: bobbyServiceHeaders(), body: '{}', signal: AbortSignal.timeout(2500) });
    if (!r.ok) return null;
    const v = await r.json() as { day?: unknown; month?: unknown };
    const day = Number(v?.day), month = Number(v?.month);
    if (!Number.isFinite(day) || !Number.isFinite(month)) return null;
    cached = { at: Date.now(), day, month };
    return cached;
  } catch {
    return null;
  }
}

/** Whether the desk may spend now. An unreadable ledger never stops the desk (the level meter already fails closed). */
export async function llmBudget(): Promise<LlmBudget> {
  const spend = await llmSpend();
  if (!spend) return { day: 0, month: 0, premiumPaused: false, allPaused: false };
  const caps = llmCaps();
  if (spend.month >= caps.alertUsd && Date.now() - alertedAt > 3_600_000) {
    alertedAt = Date.now();
    console.error('[llm-budget] ALERT month spend', spend.month.toFixed(2), 'USD ≥', caps.alertUsd);
  }
  const allPaused = spend.month >= caps.monthUsd;
  return { ...spend, allPaused, premiumPaused: allPaused || spend.day >= caps.dayUsd };
}

/** Tests only: forget the cached spend. */
export function resetLlmSpendCache() { cached = null; }
