// ============================================================
// VPIN — Volume-Synchronized Probability of Informed Trading
// Market-level signal: detects if informed traders are active
// Based on Easley, López de Prado & O'Hara (2012)
// ============================================================

export interface VPINResult {
  vpin: number              // 0-1 probability of informed trading
  vpinPct: number           // 0-100 for display
  bucketCount: number       // how many volume buckets were used
  totalVolume: number       // total USD volume analyzed
  classification: 'low' | 'moderate' | 'high' | 'extreme'
}

export interface VPINTrade {
  price: number
  size: number
  side: string    // 'BUY' or 'SELL'
  timestamp?: number
}

const MIN_TRADES = 50
const DEFAULT_BUCKETS = 50

/**
 * Calculate VPIN from a list of trades.
 * Trades are bucketed by cumulative volume (not time).
 * Each bucket accumulates approximately equal volume.
 * VPIN = mean(|V_buy - V_sell| / V_bucket) across all buckets.
 *
 * @param trades - Array of trades with price, size, side
 * @param numBuckets - Number of volume buckets (default 50)
 * @returns VPINResult or null if insufficient data
 */
export function calculateVPIN(
  trades: VPINTrade[],
  numBuckets: number = DEFAULT_BUCKETS,
): VPINResult | null {
  if (trades.length < MIN_TRADES) return null

  // Sort by timestamp ascending if available, otherwise preserve order
  const sorted = trades[0]?.timestamp != null
    ? [...trades].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    : trades

  // Calculate total volume (USD)
  const totalVolume = sorted.reduce((sum, t) => sum + Math.abs(t.size * t.price), 0)
  if (totalVolume <= 0) return null

  const actualBuckets = Math.min(numBuckets, Math.floor(trades.length / 3))
  if (actualBuckets < 5) return null

  const bucketVolume = totalVolume / actualBuckets

  // Walk through trades, filling volume buckets
  let buyVol = 0
  let sellVol = 0
  let currentBucketVol = 0
  const imbalances: number[] = []

  for (const trade of sorted) {
    const tradeVol = Math.abs(trade.size * trade.price)
    const side = (trade.side || '').toUpperCase()

    if (side === 'BUY') {
      buyVol += tradeVol
    } else {
      sellVol += tradeVol
    }
    currentBucketVol += tradeVol

    // Close bucket when full
    if (currentBucketVol >= bucketVolume) {
      const imbalance = Math.abs(buyVol - sellVol) / currentBucketVol
      imbalances.push(imbalance)

      // Reset for next bucket
      buyVol = 0
      sellVol = 0
      currentBucketVol = 0
    }
  }

  if (imbalances.length < 3) return null

  // VPIN = mean of bucket imbalances
  const vpin = imbalances.reduce((s, v) => s + v, 0) / imbalances.length

  // Classification thresholds
  let classification: VPINResult['classification']
  if (vpin > 0.75) classification = 'extreme'
  else if (vpin > 0.60) classification = 'high'
  else if (vpin > 0.40) classification = 'moderate'
  else classification = 'low'

  return {
    vpin: Math.round(vpin * 1000) / 1000,
    vpinPct: Math.round(vpin * 100),
    bucketCount: imbalances.length,
    totalVolume: Math.round(totalVolume),
    classification,
  }
}
