// ============================================================
// ExecutePanel — Clean execution panel
// Default: Real Swap via OKX DEX Aggregator
// Secondary: CEX data view for context
// ============================================================

import { useState, useEffect } from 'react';
import { ArrowLeftRight, BarChart3 } from 'lucide-react';
import { fetchMarketDetail, formatVolume, type OKXMarketDetail } from '@/services/okx-market.service';
import { SwapExecutor } from './SwapExecutor';
import { YieldBanner } from './YieldBanner';

const ASSETS = [
  { key: 'btc', label: 'BTC', instId: 'BTC-USDT' },
  { key: 'eth', label: 'ETH', instId: 'ETH-USDT' },
  { key: 'okb', label: 'OKB', instId: 'OKB-USDT' },
];

type Mode = 'swap' | 'market';

export function ExecutePanel() {
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<Mode>('swap');
  const [cexData, setCexData] = useState<OKXMarketDetail | null>(null);
  const [cexLoading, setCexLoading] = useState(false);

  const asset = ASSETS[selected];

  // Listen for mode switch events from CopyTradeCard
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.mode === 'dex' || detail?.mode === 'widget') {
        setMode('swap');
      } else if (detail?.mode === 'cex') {
        setMode('market');
      }
    };
    window.addEventListener('execute-mode', handler);
    return () => window.removeEventListener('execute-mode', handler);
  }, []);

  // Fetch CEX data when in market mode
  useEffect(() => {
    if (mode !== 'market') return;
    let mounted = true;
    setCexLoading(true);
    setCexData(null);

    fetchMarketDetail(asset.instId)
      .then(d => { if (mounted) setCexData(d); })
      .catch(() => {})
      .finally(() => { if (mounted) setCexLoading(false); });

    return () => { mounted = false; };
  }, [mode, asset.instId]);

  return (
    <div className="space-y-3" data-panel="execute">
      {/* Compact mode toggle */}
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5 bg-neutral-900/60 rounded-lg p-0.5 flex-1">
          <button
            onClick={() => setMode('swap')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
              mode === 'swap'
                ? 'bg-green-500/15 text-green-400'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <ArrowLeftRight className="w-3 h-3" />
            Swap
          </button>
          <button
            onClick={() => setMode('market')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
              mode === 'market'
                ? 'bg-purple-500/15 text-purple-400'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <BarChart3 className="w-3 h-3" />
            Market Data
          </button>
        </div>
      </div>

      {/* SWAP MODE — Real on-chain execution */}
      {mode === 'swap' && (
        <>
          <SwapExecutor
            defaultFrom="USDC"
            defaultTo={asset.label === 'OKB' ? 'ETH' : asset.label}
          />
          <YieldBanner asset={asset.label} className="mt-1" />
        </>
      )}

      {/* MARKET DATA MODE — CEX context for informed decisions */}
      {mode === 'market' && (
        <div className="space-y-3">
          {/* Asset selector */}
          <div className="flex gap-1 bg-neutral-900/40 rounded-lg p-0.5">
            {ASSETS.map((a, i) => (
              <button
                key={a.key}
                onClick={() => setSelected(i)}
                className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-colors ${
                  i === selected
                    ? 'bg-purple-500/15 text-purple-400'
                    : 'text-neutral-600 hover:text-neutral-400'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>

          {cexLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-10 bg-neutral-800/50 rounded-lg" />
              <div className="h-16 bg-neutral-800/50 rounded-lg" />
            </div>
          ) : cexData ? (
            <div className="border border-purple-500/15 bg-purple-500/5 rounded-xl p-3 space-y-3">
              {/* Price + change */}
              {cexData.ticker && (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-bold text-neutral-100">
                      ${cexData.ticker.last.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className={`text-xs ${
                      cexData.ticker.change24h > 0 ? 'text-green-400' : cexData.ticker.change24h < 0 ? 'text-red-400' : 'text-neutral-500'
                    }`}>
                      {cexData.ticker.change24h > 0 ? '+' : ''}{cexData.ticker.change24h}% (24h)
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-neutral-500">24h Vol</div>
                    <div className="text-xs text-neutral-300">{formatVolume(cexData.ticker.vol24h)}</div>
                  </div>
                </div>
              )}

              {/* Funding + OI compact row */}
              <div className="grid grid-cols-2 gap-2">
                {cexData.funding && (
                  <div className="bg-neutral-900/60 rounded-lg px-2 py-1.5">
                    <div className="text-[9px] text-neutral-500">Funding</div>
                    <div className={`text-xs font-medium ${
                      cexData.funding.rate > 0 ? 'text-green-400' : cexData.funding.rate < 0 ? 'text-red-400' : 'text-neutral-300'
                    }`}>
                      {(cexData.funding.rate * 100).toFixed(4)}%
                    </div>
                  </div>
                )}
                {cexData.openInterest && cexData.ticker && (
                  <div className="bg-neutral-900/60 rounded-lg px-2 py-1.5">
                    <div className="text-[9px] text-neutral-500">Open Interest</div>
                    <div className="text-xs font-medium text-neutral-300">
                      {formatVolume(cexData.openInterest.oiCcy * cexData.ticker.last)}
                    </div>
                  </div>
                )}
              </div>

              {/* Signal context */}
              {cexData.funding && Math.abs(cexData.funding.rate) > 0.0001 && (
                <div className={`text-[10px] px-2 py-1.5 rounded-lg ${
                  cexData.funding.rate > 0.005
                    ? 'bg-green-500/10 text-green-400/70'
                    : cexData.funding.rate < -0.005
                    ? 'bg-red-500/10 text-red-400/70'
                    : 'bg-neutral-800/50 text-neutral-500'
                }`}>
                  {cexData.funding.rate > 0.005
                    ? `High funding — longs crowded, short opportunity`
                    : cexData.funding.rate < -0.005
                    ? `Negative funding — shorts crowded, long opportunity`
                    : `Neutral funding — no clear crowding signal`
                  }
                </div>
              )}

              {/* Quick swap CTA */}
              <button
                onClick={() => setMode('swap')}
                className="w-full py-2 bg-green-500/10 border border-green-500/20 rounded-lg text-[11px] font-medium text-green-400 hover:bg-green-500/15 transition-colors"
              >
                Swap {asset.label} now →
              </button>
            </div>
          ) : (
            <div className="text-center py-4 text-neutral-500 text-xs">
              Failed to load market data
            </div>
          )}

          {/* Badge */}
          <div className="flex items-center justify-center gap-2">
            <span className="text-[10px] text-neutral-600">Powered by</span>
            <span className="text-[10px] font-bold text-purple-400/60">OKX CEX Data</span>
          </div>
        </div>
      )}
    </div>
  );
}
