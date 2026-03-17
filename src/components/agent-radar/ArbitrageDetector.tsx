// ============================================================
// ArbitrageDetector — Cross-market divergence scanner
// Compares: Polymarket price vs OKX CEX implied probability
// Finds: Mispricing opportunities + funding rate edges
// ============================================================

import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { fetchTickers, type OKXTicker } from '@/services/okx-market.service';
import type { SmartMoneyMarket } from '@/services/polymarket.service';

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

// Map market titles to CEX assets for comparison
const CRYPTO_KEYWORDS: Record<string, string> = {
  bitcoin: 'BTC', btc: 'BTC',
  ethereum: 'ETH', eth: 'ETH',
  solana: 'SOL', sol: 'SOL',
  okb: 'OKB',
};

function detectCryptoAsset(title: string): string | null {
  const lower = title.toLowerCase();
  for (const [keyword, symbol] of Object.entries(CRYPTO_KEYWORDS)) {
    if (lower.includes(keyword)) return symbol;
  }
  return null;
}

interface ArbitrageSignal {
  market: SmartMoneyMarket;
  asset: string;
  ticker: OKXTicker;
  polymarketImplied: number;     // Polymarket YES price (0-1)
  smartMoneyDirection: string;    // YES or NO
  smartMoneyConviction: number;   // % consensus
  edgeVsMarket: number;          // Smart money edge pts
  fundingSignal: 'long-crowded' | 'short-crowded' | 'neutral';
  fundingRate: number;
  divergenceScore: number;        // 0-100, higher = more opportunity
  signal: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
}

interface Props {
  markets: SmartMoneyMarket[];
}

export function ArbitrageDetector({ markets }: Props) {
  const [tickers, setTickers] = useState<OKXTicker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchTickers()
      .then(data => { if (mounted) setTickers(data); })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const signals = useMemo<ArbitrageSignal[]>(() => {
    if (tickers.length === 0 || markets.length === 0) return [];

    const tickerMap = new Map(tickers.map(t => [t.symbol, t]));
    const results: ArbitrageSignal[] = [];

    for (const market of markets) {
      const asset = detectCryptoAsset(market.title);
      if (!asset) continue;

      const ticker = tickerMap.get(asset);
      if (!ticker) continue;

      const polyPrice = market.currentPrice || market.marketPrice || 0;
      if (polyPrice === 0) continue;

      // Smart money edge: are whales positioned differently than market price?
      const smartMoneyDirection = market.topOutcome;
      const smartMoneyConviction = market.capitalConsensus;
      const edgeVsMarket = market.edgePercent;

      // Funding rate signal
      let fundingSignal: ArbitrageSignal['fundingSignal'] = 'neutral';
      let fundingRate = 0;
      if (ticker.funding) {
        fundingRate = ticker.funding.rate;
        if (fundingRate > 0.005) fundingSignal = 'long-crowded';
        else if (fundingRate < -0.005) fundingSignal = 'short-crowded';
      }

      // Calculate divergence score (0-100)
      let divergenceScore = 0;

      // Factor 1: Smart money edge (0-40pts)
      divergenceScore += Math.min(Math.abs(edgeVsMarket) * 3, 40);

      // Factor 2: Consensus strength (0-30pts)
      divergenceScore += Math.min(smartMoneyConviction * 0.3, 30);

      // Factor 3: Funding rate divergence (0-20pts)
      if (fundingSignal !== 'neutral') {
        // If smart money is long AND shorts are crowded → bullish confirmation
        const isAligned = (smartMoneyDirection.toLowerCase() === 'yes' && fundingSignal === 'short-crowded')
          || (smartMoneyDirection.toLowerCase() === 'no' && fundingSignal === 'long-crowded');
        divergenceScore += isAligned ? 20 : 10;
      }

      // Factor 4: CEX momentum alignment (0-10pts)
      const cexBullish = ticker.change24h > 2;
      const cexBearish = ticker.change24h < -2;
      const smartMoneyBullish = smartMoneyDirection.toLowerCase() === 'yes';
      if ((cexBullish && smartMoneyBullish) || (cexBearish && !smartMoneyBullish)) {
        divergenceScore += 10;
      }

      // Generate signal
      let signal: ArbitrageSignal['signal'] = 'NEUTRAL';
      if (divergenceScore >= 70) signal = smartMoneyBullish ? 'STRONG_BUY' : 'STRONG_SELL';
      else if (divergenceScore >= 45) signal = smartMoneyBullish ? 'BUY' : 'SELL';

      results.push({
        market,
        asset,
        ticker,
        polymarketImplied: polyPrice,
        smartMoneyDirection,
        smartMoneyConviction,
        edgeVsMarket,
        fundingSignal,
        fundingRate,
        divergenceScore,
        signal,
      });
    }

    return results.sort((a, b) => b.divergenceScore - a.divergenceScore);
  }, [markets, tickers]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-neutral-500 animate-pulse py-2">
        <Activity className="w-3 h-3" />
        Scanning cross-market divergences...
      </div>
    );
  }

  if (signals.length === 0) return null;

  const topSignals = signals.filter(s => s.divergenceScore >= 30).slice(0, 4);
  if (topSignals.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md bg-orange-500/10 flex items-center justify-center">
          <AlertTriangle className="w-3 h-3 text-orange-400" />
        </div>
        <span className="text-[11px] font-medium text-neutral-300">Cross-Market Arbitrage</span>
        <span className="text-[9px] text-neutral-600">Polymarket × OKX CEX</span>
      </div>

      {/* Signal cards */}
      <div className="space-y-2">
        {topSignals.map(s => {
          const signalColors: Record<string, string> = {
            STRONG_BUY: 'border-green-500/30 bg-green-500/5',
            BUY: 'border-green-500/15 bg-green-500/3',
            NEUTRAL: 'border-neutral-800 bg-neutral-900/30',
            SELL: 'border-red-500/15 bg-red-500/3',
            STRONG_SELL: 'border-red-500/30 bg-red-500/5',
          };
          const signalBadgeColors: Record<string, string> = {
            STRONG_BUY: 'bg-green-500/20 text-green-400',
            BUY: 'bg-green-500/10 text-green-400/80',
            NEUTRAL: 'bg-neutral-800 text-neutral-500',
            SELL: 'bg-red-500/10 text-red-400/80',
            STRONG_SELL: 'bg-red-500/20 text-red-400',
          };

          return (
            <div
              key={s.market.conditionId}
              className={`border rounded-xl p-3 ${signalColors[s.signal]}`}
            >
              {/* Top row: signal + market */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${signalBadgeColors[s.signal]}`}>
                      {s.signal.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] text-neutral-500">{s.asset}-USDT</span>
                  </div>
                  <div className="text-xs text-neutral-300 line-clamp-1">{s.market.title}</div>
                </div>
                {/* Divergence meter */}
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold text-neutral-200">{s.divergenceScore}</div>
                  <div className="text-[8px] text-neutral-600">DIV SCORE</div>
                </div>
              </div>

              {/* Data grid */}
              <div className="grid grid-cols-4 gap-2 text-[10px]">
                {/* Polymarket implied */}
                <div>
                  <div className="text-neutral-600 mb-0.5">Polymarket</div>
                  <div className="text-neutral-300">{(s.polymarketImplied * 100).toFixed(0)}¢ YES</div>
                </div>

                {/* Smart money */}
                <div>
                  <div className="text-neutral-600 mb-0.5">Smart Money</div>
                  <div className={s.smartMoneyDirection.toLowerCase() === 'yes' ? 'text-green-400' : 'text-red-400'}>
                    {s.smartMoneyDirection} {s.smartMoneyConviction}%
                  </div>
                </div>

                {/* CEX price */}
                <div>
                  <div className="text-neutral-600 mb-0.5">OKX Spot</div>
                  <div className="flex items-center gap-1">
                    <span className="text-neutral-300">
                      ${s.ticker.last.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                    {s.ticker.change24h > 0
                      ? <TrendingUp className="w-3 h-3 text-green-400" />
                      : <TrendingDown className="w-3 h-3 text-red-400" />
                    }
                  </div>
                </div>

                {/* Funding */}
                <div>
                  <div className="text-neutral-600 mb-0.5">Funding</div>
                  <div className={
                    s.fundingSignal === 'long-crowded' ? 'text-green-400' :
                    s.fundingSignal === 'short-crowded' ? 'text-red-400' :
                    'text-neutral-500'
                  }>
                    {s.fundingRate !== 0 ? `${(s.fundingRate * 100).toFixed(3)}%` : '—'}
                  </div>
                </div>
              </div>

              {/* Interpretation */}
              {s.divergenceScore >= 45 && (
                <div className="mt-2 text-[10px] text-neutral-400 leading-relaxed bg-neutral-900/40 rounded-lg px-2 py-1.5">
                  {s.signal === 'STRONG_BUY' || s.signal === 'BUY' ? (
                    <>
                      Smart money ({s.smartMoneyConviction}% consensus) betting <b className="text-green-400">{s.smartMoneyDirection}</b>
                      {s.edgeVsMarket > 0 && <> with <b className="text-green-400">+{s.edgeVsMarket}pts edge</b></>}
                      {s.fundingSignal === 'short-crowded' && <> + shorts paying funding (<b className="text-green-400">bullish</b>)</>}
                      {s.ticker.change24h > 2 && <> + CEX momentum <b className="text-green-400">+{s.ticker.change24h}%</b></>}
                    </>
                  ) : (
                    <>
                      Smart money ({s.smartMoneyConviction}% consensus) betting <b className="text-red-400">{s.smartMoneyDirection}</b>
                      {s.edgeVsMarket < 0 && <> with <b className="text-red-400">{s.edgeVsMarket}pts underwater</b></>}
                      {s.fundingSignal === 'long-crowded' && <> + longs paying funding (<b className="text-red-400">bearish</b>)</>}
                      {s.ticker.change24h < -2 && <> + CEX dropping <b className="text-red-400">{s.ticker.change24h}%</b></>}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
