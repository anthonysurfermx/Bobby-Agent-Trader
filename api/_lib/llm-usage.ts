// ============================================================
// The LLM cost ledger: one bobby_llm_usage row per model call (tokens, cost at list price, latency, how it
// stopped). Best effort and bounded: a ledger outage never fails or delays an answer by more than ~1.5 s,
// and no prompt, answer or user data is ever written — only the numbers.
// ============================================================
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import type { LlmUsage } from './llm.js';

export async function logLlmUsage(rows: LlmUsage[], context: { surface: string; level?: string | null }): Promise<void> {
  if (!rows.length) return;
  try {
    const body = rows.map((u) => ({
      surface: context.surface, level: context.level ?? null, role: u.role, provider: u.provider, model: u.model,
      tokens_in: u.tokensIn, tokens_out: u.tokensOut, tokens_cached: u.tokensCached, tokens_reasoning: u.tokensReasoning,
      usd: Number(u.usd.toFixed(6)), latency_ms: u.latencyMs, stop: u.stop, ok: u.ok,
    }));
    const r = await fetch(bobbyRest('bobby_llm_usage'), {
      method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(body), signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) console.error('[llm-usage] write failed', r.status);
  } catch {
    console.error('[llm-usage] write failed');
  }
}
