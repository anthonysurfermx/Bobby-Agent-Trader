// ============================================================
// Unified Harness Event Logger
// Every decision, payment, execution, and risk gate fires an
// event into agent_events. This makes Bobby auditable and
// powers the Finance Harness Console.
// ============================================================

const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

// ── Harness Verdict ──
// Standard decision object for all Bobby flows.
// Every cycle, MCP call, and risk gate produces one.
export interface HarnessVerdict {
  status: 'allow' | 'reduce' | 'deny' | 'stable';
  confidence: number;       // 0-1 (conviction normalized)
  risk_score: number;       // 0-100 (higher = riskier)
  policy_hits: string[];    // which guardrails were evaluated
  reason: string;           // human-readable explanation
}

// ── Agent Event ──
export interface AgentEvent {
  run_id: string;           // unique cycle/request ID
  thread_id?: string;       // forum_threads.id if applicable
  agent: string;            // 'alpha_hunter' | 'red_team' | 'cio' | 'judge' | 'harness' | 'mcp'
  event_type: string;       // 'debate_start' | 'verdict' | 'risk_gate' | 'execution' | 'payment' | 'skip' | 'park' | 'mcp_call'
  tool?: string;            // MCP tool name if applicable
  symbol?: string;          // trading pair
  direction?: string;       // 'long' | 'short' | 'none'
  decision?: string;        // 'allow' | 'reduce' | 'deny' | 'stable'
  conviction?: number;      // 0-1
  risk_score?: number;      // 0-100
  policy_hits?: string[];   // guardrail names
  reason?: string;          // human-readable
  payment_tx?: string;      // x402 payment tx hash
  trade_tx?: string;        // trade commit/resolve tx hash
  latency_ms?: number;      // operation duration
  tokens_in?: number;       // LLM input tokens
  tokens_out?: number;      // LLM output tokens
  meta?: Record<string, unknown>; // extra context
}

// ── Log Event ──
// Fire-and-forget insert into agent_events table.
// Never blocks the caller — failures are logged but swallowed.
export function logHarnessEvent(event: AgentEvent): void {
  if (!SB_KEY) return;

  const row = {
    ...event,
    policy_hits: event.policy_hits ? JSON.stringify(event.policy_hits) : null,
    meta: event.meta ? JSON.stringify(event.meta) : null,
    created_at: new Date().toISOString(),
  };

  fetch(`${SB_URL}/rest/v1/agent_events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  }).catch(err => {
    console.warn('[HarnessEvent] Failed to log event:', err.message);
  });
}

// ── Build Verdict ──
// Helper to construct a HarnessVerdict from cycle data.
export function buildVerdict(params: {
  executed: boolean;
  conviction: number | null;
  tradeRejectedReason?: string;
  isYieldPark?: boolean;
  policyHits?: string[];
}): HarnessVerdict {
  const { executed, conviction, tradeRejectedReason, isYieldPark, policyHits } = params;
  const conf = conviction ?? 0;
  const riskScore = Math.round((1 - conf) * 100);

  if (executed) {
    return {
      status: 'allow',
      confidence: conf,
      risk_score: riskScore,
      policy_hits: policyHits || ['conviction_gate_pass', 'stop_loss_set', 'risk_gate_pass'],
      reason: `Conviction ${(conf * 10).toFixed(1)}/10 passed all guardrails. Trade executed.`,
    };
  }

  if (isYieldPark) {
    return {
      status: 'stable',
      confidence: conf,
      risk_score: riskScore,
      policy_hits: policyHits || ['conviction_below_threshold', 'yield_evaluation'],
      reason: `Conviction ${(conf * 10).toFixed(1)}/10 too low to trade. Evaluating yield parking.`,
    };
  }

  return {
    status: 'deny',
    confidence: conf,
    risk_score: riskScore,
    policy_hits: policyHits || ['conviction_gate_block'],
    reason: tradeRejectedReason || `Conviction ${(conf * 10).toFixed(1)}/10 below 3.5/10 threshold.`,
  };
}

// ── Memory Object ──
// Distilled episode from a cycle trace.
// L0 = raw traces (agent_events)
// L1 = episodes (memory_objects kind=episode)
// L2 = heuristics (memory_objects kind=heuristic) — future
// L3 = calibration priors (memory_objects kind=calibration_prior) — future
export interface MemoryObject {
  kind: 'episode' | 'heuristic' | 'calibration_prior' | 'counterparty_profile';
  thread_id?: string;
  symbol?: string;
  direction?: string;
  regime?: string;
  conviction?: number;
  outcome?: string;       // 'win' | 'loss' | 'skip' | 'park' | 'break_even'
  pnl_pct?: number;
  lesson: string;          // distilled one-liner
  tags?: string[];
  source_events?: string[]; // run_ids that produced this memory
}

// ── Distill Episode ──
// Converts a cycle's verdict + context into a storable memory episode.
// Called at end of each cycle, fire-and-forget.
export function distillEpisode(params: {
  threadId?: string;
  symbol?: string;
  direction?: string;
  regime?: string;
  conviction: number | null;
  verdict: HarnessVerdict;
  executed: boolean;
  yieldTriggered: boolean;
  vibePhrase?: string;
  runId: string;
}): void {
  if (!SB_KEY) return;

  const { threadId, symbol, direction, regime, conviction, verdict, executed, yieldTriggered, vibePhrase, runId } = params;
  const conv = conviction ?? 0;

  // Build the lesson — a compressed, searchable summary
  let outcome: string;
  let lesson: string;

  if (executed) {
    outcome = 'executed';
    lesson = `${symbol} ${direction?.toUpperCase()} at conviction ${(conv * 10).toFixed(1)}/10 in ${regime || 'unknown'} regime. All guardrails passed. ${vibePhrase || ''}`.trim();
  } else if (yieldTriggered) {
    outcome = 'park';
    lesson = `${symbol || 'Market'} conviction ${(conv * 10).toFixed(1)}/10 — too low to trade, yield parking evaluated. ${regime || 'unknown'} regime. ${vibePhrase || ''}`.trim();
  } else {
    outcome = 'skip';
    lesson = `${symbol || 'Market'} ${direction?.toUpperCase() || 'NEUTRAL'} blocked at ${(conv * 10).toFixed(1)}/10 conviction. ${verdict.reason}`.trim();
  }

  // Build tags for searchability
  const tags: string[] = [];
  if (symbol) tags.push(symbol.toLowerCase());
  if (direction) tags.push(direction);
  if (regime) tags.push(regime.toLowerCase().replace(/\s+/g, '_'));
  if (conv >= 0.7) tags.push('high_conviction');
  else if (conv >= 0.35) tags.push('medium_conviction');
  else tags.push('low_conviction');
  tags.push(outcome);
  verdict.policy_hits.forEach(p => tags.push(p));

  const row = {
    kind: 'episode',
    thread_id: threadId || null,
    symbol: symbol || null,
    direction: direction || null,
    regime: regime || null,
    conviction: conv,
    outcome,
    pnl_pct: null, // filled later when trade resolves
    lesson,
    tags: JSON.stringify(tags),
    source_events: JSON.stringify([runId]),
    created_at: new Date().toISOString(),
  };

  fetch(`${SB_URL}/rest/v1/memory_objects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  }).catch(err => {
    console.warn('[HarnessMemory] Failed to distill episode:', err.message);
  });
}
