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
}

export interface AgentProfile {
  agentId: string;
  owner: string;
  name: string;
  type: 'trading-agent' | 'strategy-agent' | 'observer';
  capabilities: string[];
  mcpEndpoint?: string;
  riskPolicy: RiskPolicy;
  metadataURI?: string;
  registeredAt?: number;
  stake?: string;
}

// ---- HardnessSpec: The Intake Spec ----

/**
 * HardnessSpec: The canonical "Spec Packet" for every trading decision.
 * Implements the Disciplined Harness pattern.
 * Every prediction must pass through this schema before entering the sandbox.
 */
export interface HardnessSpec {
  // Identity
  agentId: string;
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

  // Provenance
  timestamp: number;
}

export interface HardnessVerdict {
  spec: HardnessSpec;
  hardnessScore: number; // 0-100
  judgeScores: {
    dataIntegrity: number;
    adversarialQuality: number;
    decisionLogic: number;
    riskManagement: number;
    calibrationAlignment: number;
    novelty: number;
  };
  action: 'EXECUTE' | 'REDUCE_SIZE' | 'PAPER_ONLY' | 'PUBLISH_ONLY' | 'REJECT';
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
