// ============================================================
// Agent Radar Autonomous — Type definitions
// ============================================================

export interface RawSignal {
  source: 'okx_dex_signal' | 'polymarket' | 'okx_trenches' | 'okx_cex';
  chain: string;
  tokenSymbol: string;
  tokenAddress: string;
  signalType: string; // SMART_MONEY, WHALE, KOL, consensus, funding_arb
  amountUsd: number;
  triggerWalletCount?: number;
  soldRatioPct?: number;
  marketCapUsd?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface FilteredSignal extends RawSignal {
  filterScore: number; // 0-100, higher = stronger signal
  reasons: string[];
}

export interface TradeDecision {
  action: 'BUY' | 'SELL' | 'SKIP';
  chain: string;
  tokenAddress: string;
  tokenSymbol: string;
  amountUsd: number;
  reason: string;
  confidence: number;
  signalSources: string[];
}

export interface TradeResult {
  decision: TradeDecision;
  txHash: string | null;
  status: 'confirmed' | 'failed' | 'simulated';
  entryPrice?: number;
  error?: string;
}

export interface CycleResult {
  cycleId: string;
  startedAt: string;
  completedAt: string;
  signalsFound: number;
  signalsFiltered: number;
  llmDecisions: number;
  tradesExecuted: number;
  tradesBlocked: number;
  totalUsdDeployed: number;
  latencyMs: number;
  trades: TradeResult[];
  llmReasoning: string;
  error?: string;
}

export interface PortfolioState {
  positions: Array<{
    chain: string;
    tokenSymbol: string;
    tokenAddress: string;
    amountUsd: number;
    entryPrice: number;
  }>;
  totalValueUsd: number;
  dailyPnlUsd: number;
  tradesLast24h: number;
}

export interface RiskConfig {
  maxSingleTradeUsd: number;
  maxDailyExposureUsd: number;
  maxConcurrentPositions: number;
  maxPortfolioConcentrationPct: number;
  dailyLossCircuitBreakerUsd: number;
  cooldownHours: number;
  enableLiveTrading: boolean;
}
