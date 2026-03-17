// ============================================================
// Risk Gate — Hard deterministic limits the AI CANNOT override
// ============================================================

import type { TradeDecision, PortfolioState, RiskConfig } from './types';

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxSingleTradeUsd: 50,          // Max $50 per trade
  maxDailyExposureUsd: 150,       // Max $150 total per cycle
  maxConcurrentPositions: 5,       // Max 5 open positions
  maxPortfolioConcentrationPct: 30,// No single token > 30% of portfolio
  dailyLossCircuitBreakerUsd: 100, // Stop if lost > $100 in 24h
  cooldownHours: 8,                // No re-entry within 8h
  enableLiveTrading: false,        // Default: simulation mode
};

export interface RiskResult {
  approved: TradeDecision[];
  blocked: Array<{ decision: TradeDecision; reason: string }>;
}

export function applyRiskGate(
  decisions: TradeDecision[],
  portfolio: PortfolioState,
  config: RiskConfig = DEFAULT_RISK_CONFIG,
): RiskResult {
  const approved: TradeDecision[] = [];
  const blocked: Array<{ decision: TradeDecision; reason: string }> = [];

  // Circuit breaker: if daily loss exceeds threshold, block ALL trades
  if (portfolio.dailyPnlUsd < -config.dailyLossCircuitBreakerUsd) {
    return {
      approved: [],
      blocked: decisions.map(d => ({
        decision: d,
        reason: `Circuit breaker: daily loss $${Math.abs(portfolio.dailyPnlUsd).toFixed(2)} exceeds limit $${config.dailyLossCircuitBreakerUsd}`,
      })),
    };
  }

  // Check too many open positions
  if (portfolio.positions.length >= config.maxConcurrentPositions) {
    return {
      approved: [],
      blocked: decisions.map(d => ({
        decision: d,
        reason: `Max positions reached: ${portfolio.positions.length}/${config.maxConcurrentPositions}`,
      })),
    };
  }

  let cycleExposure = 0;

  for (const decision of decisions) {
    // Single trade size limit
    if (decision.amountUsd > config.maxSingleTradeUsd) {
      decision.amountUsd = config.maxSingleTradeUsd; // Cap, don't block
    }

    // Cycle exposure limit
    if (cycleExposure + decision.amountUsd > config.maxDailyExposureUsd) {
      blocked.push({
        decision,
        reason: `Cycle exposure would exceed $${config.maxDailyExposureUsd} (current: $${cycleExposure})`,
      });
      continue;
    }

    // Portfolio concentration check
    const existingPosition = portfolio.positions.find(
      p => p.tokenSymbol === decision.tokenSymbol && p.chain === decision.chain
    );
    if (existingPosition) {
      const totalExposure = existingPosition.amountUsd + decision.amountUsd;
      const concentrationPct = portfolio.totalValueUsd > 0
        ? (totalExposure / portfolio.totalValueUsd) * 100
        : 100;

      if (concentrationPct > config.maxPortfolioConcentrationPct) {
        blocked.push({
          decision,
          reason: `Would create ${concentrationPct.toFixed(0)}% concentration (limit: ${config.maxPortfolioConcentrationPct}%)`,
        });
        continue;
      }
    }

    // Confidence check (belt & suspenders — LLM should already filter)
    if (decision.confidence < 0.7) {
      blocked.push({
        decision,
        reason: `Confidence too low: ${decision.confidence} (min: 0.7)`,
      });
      continue;
    }

    approved.push(decision);
    cycleExposure += decision.amountUsd;
  }

  return { approved, blocked };
}
