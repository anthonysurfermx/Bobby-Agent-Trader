// Win Probability + Smart Money Sizing (Kelly Criterion)
// Port from BetWhisper — pure math, no API calls

export interface ProbabilityInput {
  marketImplied: number       // 0-100 from market price
  smartMoneyDirection: 'Yes' | 'No' | 'Divided' | 'No Signal'
  smartMoneyPct: number       // 0-100
  agentRate: number           // 0-100
  redFlagCount: number
  vpinScore: number | null    // 0-1
  evaluatingSide: 'Yes' | 'No'
  betAmountUSD: number
  marketVolumeUSD: number
}

export interface ProbabilityResult {
  winProbability: number
  recommendedSide: 'Yes' | 'No' | null
  confidence: 'high' | 'medium' | 'low'
  edge: number
  kellyFraction: number
  smartMoneySize: number
  betAmount: number
  breakdown: {
    marketImplied: number
    agentAdjustment: number
    vpinAdjustment: number
    redFlagPenalty: number
    marketImpact: number
  }
}

export function calculateWinProbability(input: ProbabilityInput): ProbabilityResult {
  const {
    marketImplied,
    smartMoneyDirection,
    smartMoneyPct,
    agentRate,
    redFlagCount,
    vpinScore,
    evaluatingSide,
    betAmountUSD,
    marketVolumeUSD,
  } = input

  // 1. Agent adjustment: smart money conviction, +/- up to 10%
  let agentAdjustment = 0
  if (smartMoneyDirection === evaluatingSide && smartMoneyPct > 50) {
    agentAdjustment = Math.min(10, ((smartMoneyPct - 50) / 50) * 10)
  } else if (
    smartMoneyDirection !== 'Divided' &&
    smartMoneyDirection !== 'No Signal' &&
    smartMoneyDirection !== evaluatingSide
  ) {
    agentAdjustment = -Math.min(10, ((smartMoneyPct - 50) / 50) * 10)
  }

  // 2. Red flag penalty
  let redFlagPenalty = 0
  if (agentRate >= 60) redFlagPenalty = -10
  else if (agentRate >= 40) redFlagPenalty = -5
  if (redFlagCount >= 3) redFlagPenalty -= 5
  redFlagPenalty = Math.max(-15, redFlagPenalty)

  // 3. VPIN adjustment (+/- up to 8%)
  let vpinAdjustment = 0
  if (vpinScore !== null && vpinScore > 0.5) {
    const strength = (vpinScore - 0.5) / 0.5
    if (smartMoneyDirection === evaluatingSide) {
      vpinAdjustment = Math.min(8, strength * 8)
    } else if (smartMoneyDirection !== 'Divided' && smartMoneyDirection !== 'No Signal') {
      vpinAdjustment = -Math.min(8, strength * 8)
    }
  }
  vpinAdjustment = Math.round(vpinAdjustment * 10) / 10

  // 4. Market impact penalty (bet size vs volume)
  let marketImpact = 0
  if (marketVolumeUSD > 0 && betAmountUSD > 0) {
    const sizeRatio = betAmountUSD / marketVolumeUSD
    if (sizeRatio >= 0.50) marketImpact = -20
    else if (sizeRatio >= 0.25) marketImpact = -10 - ((sizeRatio - 0.25) / 0.25) * 10
    else if (sizeRatio >= 0.05) marketImpact = -2 - ((sizeRatio - 0.05) / 0.20) * 8
    marketImpact = Math.round(marketImpact * 10) / 10
  }

  // 5. Composite win probability (capped 5-95)
  const winProbability = Math.max(5, Math.min(95,
    Math.round(marketImplied + agentAdjustment + vpinAdjustment + redFlagPenalty + marketImpact)
  ))

  // 6. Edge calculation
  const marketPrice = marketImplied / 100
  const ourProbability = winProbability / 100
  const edge = marketPrice > 0 ? (ourProbability - marketPrice) / marketPrice : 0

  // 7. Half-Kelly, capped at 25%
  const b = marketPrice > 0 ? (1 / marketPrice) - 1 : 0
  const p = ourProbability
  const q = 1 - p
  const kellyRaw = b > 0 ? (b * p - q) / b : 0
  const kellyFraction = Math.max(0, Math.min(0.25, kellyRaw * 0.5))

  // 8. Smart Money Size
  const smartMoneySize = betAmountUSD > 0
    ? Math.max(1, Math.round(kellyFraction * betAmountUSD))
    : Math.max(0.01, Math.round(kellyFraction * 100) / 100)

  // 9. Confidence
  let confidence: 'high' | 'medium' | 'low'
  if (edge > 0.1 && redFlagCount === 0 && marketImpact > -5) confidence = 'high'
  else if (edge > 0 && marketImpact > -10) confidence = 'medium'
  else confidence = 'low'

  return {
    winProbability,
    recommendedSide: edge > 0 ? evaluatingSide : null,
    confidence,
    edge: Math.round(edge * 1000) / 1000,
    kellyFraction: Math.round(kellyFraction * 1000) / 1000,
    smartMoneySize,
    betAmount: betAmountUSD,
    breakdown: {
      marketImplied: Math.round(marketImplied),
      agentAdjustment: Math.round(agentAdjustment * 10) / 10,
      vpinAdjustment,
      redFlagPenalty: Math.round(redFlagPenalty * 10) / 10,
      marketImpact,
    },
  }
}
