// ============================================================
// Signal Collectors — Gather alpha from multiple sources
// 1. OKX dex-signal: Smart Money / Whale / KOL buys
// 2. Polymarket: Smart money consensus from top 50 PnL traders
// 3. OKX CEX: Funding rate + open interest anomalies
// ============================================================

import type { RawSignal } from './types';

const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : process.env.NEXT_PUBLIC_SITE_URL || 'https://defi-mexico-hub.vercel.app';

// ---- 1. OKX On-chain Whale/Smart Money Signals ----
export async function collectDexSignals(chains = ['1', '501', '8453']): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      chains: chains.join(','),
      walletType: '1,2,3', // Smart Money + KOL + Whale
      minAmountUsd: '5000',
    });

    const res = await fetch(`${BASE_URL}/api/okx-signal?${params}`);
    if (!res.ok) throw new Error(`Signal API ${res.status}`);
    const data = await res.json();

    if (!data.ok || !Array.isArray(data.signals)) return [];

    return data.signals.map((s: Record<string, unknown>) => ({
      source: 'okx_dex_signal' as const,
      chain: String(s.chain || '1'),
      tokenSymbol: String(s.tokenSymbol || 'UNKNOWN'),
      tokenAddress: String(s.tokenAddress || ''),
      signalType: String(s.walletType || 'UNKNOWN'),
      amountUsd: Number(s.amountUsd) || 0,
      triggerWalletCount: Number(s.triggerWalletCount) || 0,
      soldRatioPct: Number(s.soldRatioPct) || 0,
      marketCapUsd: Number(s.marketCapUsd) || 0,
    }));
  } catch (err) {
    console.error('[Collector] dex-signal error:', err);
    return [];
  }
}

// ---- 2. Polymarket Smart Money Consensus ----
export async function collectPolymarketConsensus(): Promise<RawSignal[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/scan-traders?count=50`);
    if (!res.ok) throw new Error(`Scan traders API ${res.status}`);
    const data = await res.json();

    if (!data.ok || !Array.isArray(data.results)) return [];

    // Group by top PnL humans (not bots) and extract consensus
    const humans = data.results.filter((r: Record<string, unknown>) =>
      r.classification === 'human' || r.classification === 'mixed'
    );

    if (humans.length === 0) return [];

    // Aggregate: which crypto assets are these traders bullish on?
    // This is a simplified version — the full engine runs in useSmartMoneyScan
    const signals: RawSignal[] = [];
    const topTraders = humans.slice(0, 20);
    const avgPnl = topTraders.reduce((sum: number, t: Record<string, unknown>) => sum + (Number(t.pnl) || 0), 0) / topTraders.length;

    // If top human traders are profitable, that's a bullish signal for the market
    if (avgPnl > 10000) {
      signals.push({
        source: 'polymarket',
        chain: 'polygon', // Polymarket runs on Polygon
        tokenSymbol: 'POLYMARKET_CONSENSUS',
        tokenAddress: '',
        signalType: 'consensus',
        amountUsd: avgPnl,
        confidence: Math.min(0.95, topTraders.length / 30),
        metadata: {
          humanTraders: topTraders.length,
          avgPnl,
          topTrader: topTraders[0]?.userName,
        },
      });
    }

    return signals;
  } catch (err) {
    console.error('[Collector] polymarket error:', err);
    return [];
  }
}

// ---- 3. OKX CEX Funding Rate + OI Anomalies ----
export async function collectCEXSignals(): Promise<RawSignal[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/okx-tickers`);
    if (!res.ok) throw new Error(`OKX tickers API ${res.status}`);
    const data = await res.json();

    if (!data.ok || !Array.isArray(data.tickers)) return [];

    const signals: RawSignal[] = [];

    for (const ticker of data.tickers as Array<Record<string, unknown>>) {
      const funding = ticker.funding as Record<string, unknown> | undefined;
      if (!funding) continue;

      const rate = Number(funding.rate) || 0;
      const symbol = String(ticker.symbol || '');
      const change24h = Number(ticker.change24h) || 0;

      // Extreme funding rate = crowding signal
      if (Math.abs(rate) > 0.01) {
        signals.push({
          source: 'okx_cex',
          chain: 'cex',
          tokenSymbol: symbol,
          tokenAddress: '',
          signalType: rate > 0 ? 'funding_long_crowded' : 'funding_short_crowded',
          amountUsd: 0,
          confidence: Math.min(0.9, Math.abs(rate) * 50),
          metadata: {
            fundingRate: rate,
            annualized: Number(funding.annualized) || 0,
            change24h,
            spotPrice: Number(ticker.last) || 0,
          },
        });
      }

      // Big 24h move + extreme funding = momentum signal
      if (Math.abs(change24h) > 5 && Math.abs(rate) > 0.005) {
        signals.push({
          source: 'okx_cex',
          chain: 'cex',
          tokenSymbol: symbol,
          tokenAddress: '',
          signalType: change24h > 0 ? 'momentum_bullish' : 'momentum_bearish',
          amountUsd: 0,
          confidence: Math.min(0.85, (Math.abs(change24h) / 20) + (Math.abs(rate) * 30)),
          metadata: {
            change24h,
            fundingRate: rate,
            spotPrice: Number(ticker.last) || 0,
          },
        });
      }
    }

    return signals;
  } catch (err) {
    console.error('[Collector] CEX error:', err);
    return [];
  }
}

// ---- Collect all signals in parallel ----
export async function collectAllSignals(): Promise<RawSignal[]> {
  const [dexSignals, polymarketSignals, cexSignals] = await Promise.all([
    collectDexSignals(),
    collectPolymarketConsensus(),
    collectCEXSignals(),
  ]);

  return [...dexSignals, ...polymarketSignals, ...cexSignals];
}
