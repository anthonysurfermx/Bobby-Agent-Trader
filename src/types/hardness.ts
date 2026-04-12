/**
 * Hardness Finance — Type System
 * The canonical types for the Financial Orchestration Layer.
 */

// ---- Agent Identity & Policy ----

export interface RiskPolicy {
  minHardnessScore: number;
  maxNotionalUsd: number;
  allowedSymbols: string[];
  requireJudge: boolean;
  autoSettle: boolean;
  // Guardrails (Principles #2, #5)
  maxDrawdownPct?: number;        // Max portfolio drawdown before auto-block
  maxRecursionDepth?: number;     // Termination limit for agent loops
  stepBudgetOkb?: string;         // Cost ceiling per session
  mode: 'advisory' | 'auto' | 'paper';
}

export interface AgentProfile {
  agentId: string;
  owner: string;
  name: string;
  type: 'trading-agent' | 'strategy-agent' | 'observer';
  version?: string;
  capabilities: string[];
  mcpEndpoint?: string;
  riskPolicy: RiskPolicy;
  metadataURI?: string;
  memoryTier?: 'hot' | 'cold' | 'archived';  // Hierarchical memory (Principle #10)
  registeredAt?: number;
  stake?: string;
  status?: 'active' | 'paused' | 'banned';
}

// ---- HardnessSpec: The Intake Spec ----

/**
 * HardnessSpec: The canonical "Spec Packet" for every trading decision.
 * Implements the Disciplined Harness pattern.
 * Every prediction must pass through this schema before entering the sandbox.
 */
export interface HardnessSpec {
  // Identity & Tracing (Principle #18)
  agentId: string;
  traceId?: string;               // Causal chain link to previous session
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  timeframe: '1H' | '4H' | '1D' | '1W';

  // Operational Parameters (precision 8 decimals for on-chain)
  entryPrice: number;
  targetPrice: number;
  stopLossPrice: number;
  riskAmountOkb?: number;

  // Thesis Specification (the "contract" of the decision)
  thesis: string;
  catalysts: string[];
  invalidationLogic: string;

  // Regime Snapshot
  marketRegime?: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE';
  indicatorsSnapshot?: {
    rsi?: number;
    macd?: string;
    fundingRate?: number;
    smartMoneyFlow?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  };

  // Memory (Principle #1, #12)
  previousObservations?: string[];  // Trace from last action observed

  // Provenance
  timestamp: number;
}

export interface HardnessVerdict {
  spec: HardnessSpec;
  hardnessScore: number; // 0-100
  causalChain?: string[];  // Principle #18: causal antecedents of the verdict
  judgeScores: {
    dataIntegrity: number;
    adversarialQuality: number;
    decisionLogic: number;
    riskManagement: number;
    calibrationAlignment: number;
    novelty: number;
  };
  action: 'EXECUTE' | 'REDUCE_SIZE' | 'PAPER_ONLY' | 'PUBLISH_ONLY' | 'REJECT' | 'REQUIRE_HUMAN_APPROVAL';
  biasesDetected: string[];
  redFlags: string[];
  rationale: string;
  sizing?: {
    suggestedSizeUsd: number;
    maxLeverage: number;
    riskRewardRatio: number;
  };
}

export interface OrchestrateRequest {
  agent: string;
  intent: 'evaluate_trade' | 'publish_signal' | 'hardness_test';
  prediction: {
    symbol: string;
    direction: 'long' | 'short';
    entry: number;
    target: number;
    stop: number;
    conviction?: number;
    thesis: string;
    catalysts?: string[];
    invalidation?: string;
    timeframe?: string;
  };
  options?: {
    runDebate?: boolean;
    runJudge?: boolean;
    commitOnchain?: boolean;
    publishSignal?: boolean;
  };
}

export interface OrchestrateResponse {
  ok: boolean;
  decision: 'execute' | 'reduce_size' | 'paper_only' | 'publish_only' | 'reject';
  hardnessScore: number;
  conviction: number;
  biases: string[];
  redFlags: string[];
  rationale: string;
  debate: {
    alpha: { thesis: string; evidence: string[] };
    redTeam: { counterpoints: string[]; failureModes: string[] };
    cio: { recommendation: string; conviction: number; rationale: string };
  };
  judge: {
    dimensions: Record<string, number>;
    recommendation: string;
  };
  proofs: {
    predictionHash?: string;
    commitTxHash?: string;
    signalTxHash?: string;
  } | null;
}
