// ============================================================
// OKXTickerStrip — Live scrolling ticker bar with OKX CEX data
// Shows: price, 24h change, funding rate for key assets
// Auto-refreshes every 30s
// ============================================================

import { useState, useEffect } from 'react';
import { fetchTickers, formatVolume, type OKXTicker } from '@/services/okx-market.service';

export function OKXTickerStrip() {
  const [tickers, setTickers] = useState<OKXTicker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const data = await fetchTickers();
        if (mounted) {
          setTickers(data);
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-4 overflow-hidden h-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-4 w-24 bg-neutral-800/50 rounded animate-pulse shrink-0" />
        ))}
      </div>
    );
  }

  if (tickers.length === 0) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
      <span className="text-[9px] text-neutral-600 shrink-0 mr-1">OKX</span>
      {tickers.map(t => (
        <div
          key={t.instId}
          className="flex items-center gap-1.5 px-2 py-1 bg-neutral-900/60 rounded-lg shrink-0"
        >
          <span className="text-[10px] font-bold text-neutral-300">{t.symbol}</span>
          <span className="text-[10px] text-neutral-400">
            ${t.last.toLocaleString(undefined, { maximumFractionDigits: t.last < 10 ? 4 : 2 })}
          </span>
          <span className={`text-[9px] font-medium ${
            t.change24h > 0 ? 'text-green-400' : t.change24h < 0 ? 'text-red-400' : 'text-neutral-500'
          }`}>
            {t.change24h > 0 ? '+' : ''}{t.change24h}%
          </span>
          {t.funding && (
            <span className={`text-[8px] px-1 py-0.5 rounded ${
              t.funding.rate > 0
                ? 'bg-green-500/10 text-green-400/70'
                : t.funding.rate < 0
                ? 'bg-red-500/10 text-red-400/70'
                : 'bg-neutral-800 text-neutral-500'
            }`}>
              F:{(t.funding.rate * 100).toFixed(3)}%
            </span>
          )}
          {t.vol24h > 0 && (
            <span className="text-[8px] text-neutral-600">
              {formatVolume(t.vol24h)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
