// ============================================================
// risk-gate — deterministic sizing + position-limit gate.
// Extracted from agent-run.ts so the same logic can back the sandbox,
// hardness-test, and future stage-split orchestrators without copy-paste.
//
// Key invariant (Codex P1 audit): LLM confidence is used ONLY for
// explanation. Gate and sizing run on backend-computed dynamicConviction
// from on-chain data.
// ============================================================

export interface TradeDecision {
  action: 'BUY' | 'SKIP';
  chain: string;
  tokenAddress: string;
  tokenSymbol: string;
  amountUsd: number;
  reason: string;
  confidence: number;
  signalSources: string[];
}

/**
 * Blend OKX signal strength, Polymarket consensus, and a latency penalty
 * into a single 0-1 conviction score. Weights favor Polymarket (0.6) over
 * OKX (0.4) because crowd-predicted breakouts tend to lead whale flows.
 */
export function calculateDynamicConviction(
  okxScore: number,      // 0-1, normalized from filterScore (0-100)
  polyConsensus: number, // 0-1, normalized from Polymarket edgePct
  latencyMs: number,     // age of signal in ms
): number {
  // Exponential penalty tightened: <=5min = fresh (0), 15min ≈ 0.16, 30min ≈ 0.55,
  // 60min capped at 0.7. On-chain smart-money alpha decays fast — a 1h-old signal
  // means whales have already rotated. Previous curve (0.02 * e^(0.04 * min)) was
  // too permissive and let stale signals cross threshold.
  const minutes = latencyMs / 60000;
  const latencyPenalty = minutes <= 5 ? 0 : Math.min(0.7, 0.05 * Math.exp(0.08 * minutes));
  const raw = okxScore * 0.4 + polyConsensus * 0.6 - latencyPenalty;
  return Math.max(0, Math.min(1, raw));
}

/**
 * Half-Kelly position sizing, floored at $5 and capped at $75.
 *   f* = (p*(b+1) - 1) / b,  b = win/loss ratio (2:1 default for crypto).
 * Returns 0 if the edge is negative so the risk gate can skip.
 */
export function kellySize(confidence: number, bankroll: number, maxExposurePct = 0.33): number {
  const b = 2.0;
  const p = Math.max(0.5, Math.min(0.95, confidence)); // clamp to avoid degenerate sizes
  const kelly = (p * (b + 1) - 1) / b;
  if (kelly <= 0) return 0;

  const halfKelly = kelly * 0.5;
  const size = Math.min(bankroll * halfKelly, bankroll * maxExposurePct);
  return Math.max(5, Math.min(75, Math.round(size * 100) / 100));
}

export interface RiskGateResult {
  approved: TradeDecision[];
  blocked: number;
  sizingMethod: string;
}

/**
 * Apply the deterministic risk gate to a list of candidate trades:
 *   - conviction threshold (0.7 normal, 0.8 safe mode)
 *   - max 3 concurrent positions
 *   - no duplicate symbols
 *   - max daily loss = 10% of bankroll
 *   - max exposure = 30% (15% safe mode)
 * Mutates each approved decision's `amountUsd` (Kelly) and `confidence`
 * (overwritten with deterministic score for downstream transparency).
 */
export function applyRiskGate(
  decisions: TradeDecision[],
  bankroll = 500,
  isSafeMode = false,
  backendConvictions?: Map<string, number>, // symbol → dynamicConviction from backend
  openExposureUsd = 0, // USD currently at risk in open (unsettled) positions — counts against caps.
): RiskGateResult {
  const approved: TradeDecision[] = [];
  let exposure = openExposureUsd;
  const maxExposurePct = isSafeMode ? 0.15 : 0.30;
  const maxExposure = bankroll * maxExposurePct;
  const confidenceThreshold = isSafeMode ? 0.8 : 0.7;
  const maxDailyLoss = bankroll * 0.10;
  const maxPositions = 3;
  const recentSymbols = new Set<string>();

  for (const d of decisions) {
    const deterministicConv = backendConvictions?.get(d.tokenSymbol) ?? d.confidence;

    if (deterministicConv < confidenceThreshold) {
      console.log(
        `[RiskGate] Blocked ${d.tokenSymbol}: backend conviction ${deterministicConv.toFixed(2)} < threshold ${confidenceThreshold}`,
      );
      continue;
    }
    if (approved.length >= maxPositions) continue;
    if (recentSymbols.has(d.tokenSymbol)) continue;
    recentSymbols.add(d.tokenSymbol);

    const kellyAmount = kellySize(deterministicConv, bankroll, maxExposurePct);
    d.amountUsd = isSafeMode ? kellyAmount * 0.5 : kellyAmount;

    if (exposure + d.amountUsd > maxDailyLoss) {
      console.log(`[RiskGate] Blocked ${d.tokenSymbol}: would exceed maxDailyLoss ($${maxDailyLoss.toFixed(2)}), current exposure $${exposure.toFixed(2)}`);
      continue;
    }
    if (exposure + d.amountUsd > maxExposure) {
      console.log(`[RiskGate] Blocked ${d.tokenSymbol}: would exceed maxExposure ($${maxExposure.toFixed(2)}), current exposure $${exposure.toFixed(2)}`);
      continue;
    }

    // Preserve both scores on the decision for downstream auditability.
    (d as unknown as { deterministicConviction: number }).deterministicConviction = deterministicConv;
    (d as unknown as { llmConfidence: number }).llmConfidence = d.confidence;
    d.confidence = deterministicConv;

    approved.push(d);
    exposure += d.amountUsd;
  }

  return {
    approved,
    blocked: decisions.length - approved.length,
    sizingMethod: isSafeMode ? 'half-kelly-safe-mode' : 'half-kelly',
  };
}
