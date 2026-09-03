// ============================================================
// stock-signals — keyless signal source for the Base tokenized-stock rail.
//
// For each B20 stock with a Uniswap pool: the pool's execution price vs the
// Chainlink reference (discount/premium), the reference's age, the issuer's
// pause flags, and the underlying's 5-day move from Yahoo. Produces the
// RawSignal shape the debate already consumes. No OKX, no credentials.
// A stock whose transfers are paused or whose reference is stale is not a
// candidate at all — that is the security pre-gate for this asset class.
// ============================================================

import { quoteBaseSwap } from './base-swap.js';
import { BASE_SWAP_TOKENS, BASE_SWAP_CHAIN_ID, type BaseSwapToken } from '../../src/lib/base-swap/tokens.js';
import type { RawSignal } from './signals.js';

const SAMPLE_USDC = 100;
const MAX_REFERENCE_AGE_SEC = 96 * 3600;

export interface StockSignalMeta {
  referenceUsd: number;
  dexUsd: number;
  deviationPct: number;
  referenceAgeSec: number;
  pausedFeatures: string;
  move5dPct: number | null;
  route: string;
}

async function fiveDayMove(underlying: string): Promise<number | null> {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${underlying}?range=5d&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { chart?: { result?: Array<{ indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };
    const closes = (json.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter((c): c is number => typeof c === 'number' && c > 0);
    if (closes.length < 2) return null;
    return ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;
  } catch {
    return null;
  }
}

export async function collectStockSignals(options: { logPrefix?: string } = {}): Promise<RawSignal[]> {
  const log = options.logPrefix || '[StockSignals]';
  const stocks = BASE_SWAP_TOKENS.filter((t): t is BaseSwapToken & { underlyingSymbol: string } => t.assetClass === 'tokenized-stock' && Boolean(t.underlyingSymbol));
  const out: RawSignal[] = [];
  await Promise.all(stocks.map(async (stock) => {
    try {
      const [q, move5dPct] = await Promise.all([
        quoteBaseSwap({ tokenIn: 'USDC', tokenOut: stock.symbol, amount: String(SAMPLE_USDC) }),
        fiveDayMove(stock.underlyingSymbol),
      ]);
      const ref = q.stockReference;
      if (!ref) return;
      if (ref.transferPaused) { console.warn(`${log} ${stock.symbol}: transfers paused, not a candidate`); return; }
      if (ref.ageSec > MAX_REFERENCE_AGE_SEC) { console.warn(`${log} ${stock.symbol}: reference ${Math.round(ref.ageSec / 3600)}h old, not a candidate`); return; }
      const dexUsd = 1 / q.executionPrice;
      const signedDeviation = ((dexUsd - ref.usdPrice) / ref.usdPrice) * 100; // negative = pool below reference
      const meta: StockSignalMeta = {
        referenceUsd: ref.usdPrice,
        dexUsd,
        deviationPct: signedDeviation,
        referenceAgeSec: ref.ageSec,
        pausedFeatures: ref.pausedFeatures,
        move5dPct,
        route: q.route.description,
      };
      out.push({
        source: 'base_b20',
        chain: String(BASE_SWAP_CHAIN_ID),
        tokenSymbol: stock.symbol,
        tokenAddress: stock.address,
        signalType: signedDeviation <= -0.5 ? 'dex_discount' : signedDeviation >= 1.5 ? 'dex_premium' : 'at_reference',
        amountUsd: SAMPLE_USDC,
        timestamp: Date.now(),
        confidence: Math.max(0, Math.min(1, 0.5 - signedDeviation / 10)),
        metadata: meta as unknown as Record<string, unknown>,
      });
    } catch (error) {
      console.warn(`${log} ${stock.symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }));
  return out;
}
