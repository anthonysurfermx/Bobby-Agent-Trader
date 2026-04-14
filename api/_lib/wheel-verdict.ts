// ============================================================
// Wheel Verdict — Bobby's pressure test for b1nary positions
// ------------------------------------------------------------
// Any agent running a Wheel strategy (sell put → assigned → sell call)
// can call this layer to get a SELL / SKIP / WAIT verdict before
// committing collateral. We intentionally keep this narrow and
// composable: one call, no persistence, no side effects. Caller is
// responsible for passing it through the harness-events logger.
// ============================================================

import {
  annualizeYield,
  strikeDistancePct,
  B1NARY_DEPLOYMENT_STATUS,
  B1NARY_SOURCE_CHAIN_ID,
  type B1naryAsset,
  type B1naryOptionType,
} from './b1nary.js';

export type WheelVerdict = 'SELL' | 'SKIP' | 'WAIT';

export interface WheelEvaluateInput {
  asset: B1naryAsset;
  side: B1naryOptionType;
  strike: number;
  spot: number;
  premium: number;       // in the quote token for the leg
  collateral: number;    // same unit as premium
  expiryDays: number;
  regime?: string;       // Bobby's current market regime (from bobby-intel)
  marketOpen?: boolean;  // b1nary circuit-breaker / market status flag
}

export interface WheelEvaluateOutput {
  verdict: WheelVerdict;
  conviction: number;              // 0-100
  reasoning: string;
  guardrailsTriggered: string[];   // guardrail names that were hit
  yield: {
    annualized_bps: number;
    collateral_ratio: number;
    days_to_expiry: number;
  };
  strike_distance_pct: number;
  regime: string;
  source_chain: typeof B1NARY_SOURCE_CHAIN_ID;
  deployment_status: typeof B1NARY_DEPLOYMENT_STATUS;
}

// ── Thresholds ──
// Conservative defaults. Each regime shifts them; DOWNTREND tightens,
// BULL loosens. These are intentionally boring numbers — the point is
// that a verdict exists and is explainable, not that the thresholds
// are optimal. Calibration lives in future work.
const MIN_EXPIRY_DAYS = 2;        // below this, theta decay too noisy
const MAX_EXPIRY_DAYS = 35;       // above this, gamma risk dominates
const MIN_ANNUALIZED_BPS = 500;   // 5% APR floor or SKIP
const MIN_PUT_DISTANCE = 0.02;    // put strike ≥ 2% below spot (neutral regime)
const MIN_CALL_DISTANCE = 0.02;   // call strike ≥ 2% above spot (neutral regime)

function regimeAdjustedDistance(regime: string, side: B1naryOptionType): number {
  const r = (regime || '').toLowerCase();
  // In downtrends: tighten puts (need more cushion), loosen calls (still risky but premium is the only reward).
  // In bulls: loosen puts (spot unlikely to drop), tighten calls (spot more likely to blow through strike).
  if (r.includes('down') || r.includes('bear')) {
    return side === 'put' ? 0.05 : 0.015;
  }
  if (r.includes('up') || r.includes('bull')) {
    return side === 'put' ? 0.015 : 0.04;
  }
  return side === 'put' ? MIN_PUT_DISTANCE : MIN_CALL_DISTANCE;
}

export function evaluateWheel(input: WheelEvaluateInput): WheelEvaluateOutput {
  const { asset, side, strike, spot, premium, collateral, expiryDays, regime, marketOpen } = input;
  const triggered: string[] = [];

  // Hard block: market closed / circuit breaker. Fail-closed philosophy:
  // Bobby will never recommend selling into a paused venue.
  if (marketOpen === false) {
    return {
      verdict: 'WAIT',
      conviction: 0,
      reasoning: 'b1nary market is paused or circuit-broken. Wait until it reopens before committing collateral.',
      guardrailsTriggered: ['wheel_market_breaker'],
      yield: { annualized_bps: 0, collateral_ratio: 0, days_to_expiry: Math.max(1, expiryDays) },
      strike_distance_pct: strikeDistancePct(strike, spot),
      regime: regime || 'unknown',
      source_chain: B1NARY_SOURCE_CHAIN_ID,
      deployment_status: B1NARY_DEPLOYMENT_STATUS,
    };
  }

  const y = annualizeYield({ premium, collateral, expiryDays });
  const distance = strikeDistancePct(strike, spot);
  const requiredDistance = regimeAdjustedDistance(regime || '', side);

  // Distance guardrail is signed: puts want negative distance (below spot),
  // calls want positive (above spot). Compare magnitudes to the required floor.
  const signedDistance = side === 'put' ? -distance : distance;
  if (signedDistance < requiredDistance) {
    triggered.push('wheel_strike_distance');
  }

  if (expiryDays < MIN_EXPIRY_DAYS) {
    triggered.push('wheel_expiry_too_short');
  } else if (expiryDays > MAX_EXPIRY_DAYS) {
    triggered.push('wheel_expiry_too_long');
  }

  if (y.annualized_bps < MIN_ANNUALIZED_BPS) {
    triggered.push('wheel_premium_floor');
  }

  // Regime gate: in downtrends, block calls with very low premium — you're
  // selling upside cheap while the market may rip on a relief bounce.
  const regimeLc = (regime || '').toLowerCase();
  if (side === 'call' && (regimeLc.includes('down') || regimeLc.includes('bear')) && y.annualized_bps < 2000) {
    triggered.push('wheel_regime_gate');
  }

  let verdict: WheelVerdict;
  let conviction: number;
  let reasoning: string;

  if (triggered.length === 0) {
    verdict = 'SELL';
    // Conviction = distance margin * yield margin, capped at 95.
    const distanceMargin = Math.max(0, signedDistance - requiredDistance) / Math.max(0.01, requiredDistance);
    const yieldMargin = Math.max(0, y.annualized_bps - MIN_ANNUALIZED_BPS) / MIN_ANNUALIZED_BPS;
    conviction = Math.min(95, Math.round(60 + 20 * Math.min(1, distanceMargin) + 15 * Math.min(1, yieldMargin)));
    reasoning = `${side.toUpperCase()} at strike ${strike} passes all wheel guardrails: ${(signedDistance * 100).toFixed(2)}% strike cushion, ${(y.annualized_bps / 100).toFixed(1)}% APR in ${regime || 'neutral'} regime.`;
  } else if (triggered.includes('wheel_expiry_too_short') || triggered.includes('wheel_expiry_too_long')) {
    verdict = 'WAIT';
    conviction = 25;
    reasoning = `Expiry window (${expiryDays}d) outside usable range [${MIN_EXPIRY_DAYS}d, ${MAX_EXPIRY_DAYS}d]. Wait for a better strike ladder.`;
  } else {
    verdict = 'SKIP';
    conviction = 15;
    const reasons: string[] = [];
    if (triggered.includes('wheel_strike_distance')) {
      reasons.push(`strike cushion ${(signedDistance * 100).toFixed(2)}% < required ${(requiredDistance * 100).toFixed(2)}% for ${regime || 'neutral'} regime`);
    }
    if (triggered.includes('wheel_premium_floor')) {
      reasons.push(`premium APR ${(y.annualized_bps / 100).toFixed(1)}% below floor ${(MIN_ANNUALIZED_BPS / 100).toFixed(1)}%`);
    }
    if (triggered.includes('wheel_regime_gate')) {
      reasons.push(`${side.toUpperCase()} blocked in ${regime} — premium must be ≥20% APR to compensate`);
    }
    reasoning = `Skip: ${reasons.join('; ')}.`;
  }

  return {
    verdict,
    conviction,
    reasoning,
    guardrailsTriggered: triggered,
    yield: y,
    strike_distance_pct: signedDistance,
    regime: regime || 'unknown',
    source_chain: B1NARY_SOURCE_CHAIN_ID,
    deployment_status: B1NARY_DEPLOYMENT_STATUS,
  };
  // asset is part of the public input signature; we surface it back via the
  // calling layer so callers can correlate across b1nary vaults. No need to
  // echo here — meta is the right place for that.
  void asset;
}
