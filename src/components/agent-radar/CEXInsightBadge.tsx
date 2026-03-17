// ============================================================
// CEXInsightBadge — Compact OKX CEX data display for market cards
// Shows spot price, funding rate, open interest for detected asset
// ============================================================

import { useState, useEffect } from 'react';
import { fetchMarketDetail, formatVolume, type OKXMarketDetail } from '@/services/okx-market.service';

// Maps common market keywords to OKX instrument IDs
const ASSET_MAP: Record<string, string> = {
  bitcoin: 'BTC-USDT',
  btc: 'BTC-USDT',
  ethereum: 'ETH-USDT',
  eth: 'ETH-USDT',
  solana: 'SOL-USDT',
  sol: 'SOL-USDT',
  okb: 'OKB-USDT',
  matic: 'MATIC-USDT',
  polygon: 'MATIC-USDT',
};

function detectInstId(title: string): string | null {
  const lower = title.toLowerCase();
  for (const [keyword, instId] of Object.entries(ASSET_MAP)) {
    if (lower.includes(keyword)) return instId;
  }
  return null;
}

interface Props {
  marketTitle: string;
  compact?: boolean;
}

export function CEXInsightBadge({ marketTitle, compact = false }: Props) {
  const [data, setData] = useState<OKXMarketDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const instId = detectInstId(marketTitle);

  useEffect(() => {
    if (!instId) return;
    let mounted = true;
    setLoading(true);

    fetchMarketDetail(instId)
      .then(d => { if (mounted) setData(d); })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });

    return () => { mounted = false; };
  }, [instId]);

  if (!instId) return null;
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-neutral-600 animate-pulse">
        <span className="w-2 h-2 rounded-full bg-amber-500/30" />
        Loading OKX data...
      </div>
    );
  }
  if (!data) return null;

  const symbol = instId.split('-')[0];

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {data.ticker && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">
            {symbol} ${data.ticker.last.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            <span className={`ml-1 ${data.ticker.change24h > 0 ? 'text-green-400' : data.ticker.change24h < 0 ? 'text-red-400' : 'text-neutral-500'}`}>
              {data.ticker.change24h > 0 ? '+' : ''}{data.ticker.change24h}%
            </span>
          </span>
        )}
        {data.funding && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            data.funding.rate > 0 ? 'bg-green-500/10 text-green-400' : data.funding.rate < 0 ? 'bg-red-500/10 text-red-400' : 'bg-neutral-800 text-neutral-500'
          }`}>
            FR: {(data.funding.rate * 100).toFixed(4)}%
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="border border-amber-500/15 bg-amber-500/5 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-amber-400">OKX CEX DATA</span>
        <span className="text-[9px] text-neutral-600">{instId}</span>
        <span className="ml-auto text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/60">
          Agent Trade Kit
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Spot Price */}
        {data.ticker && (
          <div>
            <div className="text-[9px] text-neutral-500 mb-0.5">Spot Price</div>
            <div className="text-xs text-neutral-200 font-medium">
              ${data.ticker.last.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className={`text-[10px] ${
              data.ticker.change24h > 0 ? 'text-green-400' : data.ticker.change24h < 0 ? 'text-red-400' : 'text-neutral-500'
            }`}>
              {data.ticker.change24h > 0 ? '+' : ''}{data.ticker.change24h}% (24h)
            </div>
          </div>
        )}

        {/* Volume */}
        {data.ticker && data.ticker.vol24h > 0 && (
          <div>
            <div className="text-[9px] text-neutral-500 mb-0.5">24h Volume</div>
            <div className="text-xs text-neutral-200 font-medium">
              {formatVolume(data.ticker.vol24h)}
            </div>
            <div className="text-[10px] text-neutral-500">
              H: ${data.ticker.high24h.toLocaleString(undefined, { maximumFractionDigits: 0 })} / L: ${data.ticker.low24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
        )}

        {/* Funding Rate */}
        {data.funding && (
          <div>
            <div className="text-[9px] text-neutral-500 mb-0.5">Funding Rate (8h)</div>
            <div className={`text-xs font-medium ${
              data.funding.rate > 0 ? 'text-green-400' : data.funding.rate < 0 ? 'text-red-400' : 'text-neutral-300'
            }`}>
              {data.funding.rate > 0 ? '+' : ''}{(data.funding.rate * 100).toFixed(4)}%
            </div>
            <div className="text-[10px] text-neutral-500">
              Ann. {data.funding.annualized > 0 ? '+' : ''}{data.funding.annualized}%
            </div>
          </div>
        )}

        {/* Open Interest */}
        {data.openInterest && (
          <div>
            <div className="text-[9px] text-neutral-500 mb-0.5">Open Interest</div>
            <div className="text-xs text-neutral-200 font-medium">
              {data.openInterest.oiCcy.toLocaleString(undefined, { maximumFractionDigits: 0 })} {symbol}
            </div>
            <div className="text-[10px] text-neutral-500">
              {formatVolume(data.openInterest.oiCcy * (data.ticker?.last || 0))} USD
            </div>
          </div>
        )}
      </div>

      {/* Funding signal interpretation */}
      {data.funding && Math.abs(data.funding.rate) > 0.0001 && (
        <div className={`text-[10px] px-2 py-1.5 rounded ${
          data.funding.rate > 0.01 ? 'bg-green-500/10 text-green-400/80' :
          data.funding.rate < -0.01 ? 'bg-red-500/10 text-red-400/80' :
          'bg-neutral-800/50 text-neutral-400'
        }`}>
          {data.funding.rate > 0.01
            ? `Longs paying ${(data.funding.rate * 100).toFixed(3)}% — market over-leveraged long`
            : data.funding.rate < -0.01
            ? `Shorts paying ${Math.abs(data.funding.rate * 100).toFixed(3)}% — market over-leveraged short`
            : `Funding neutral — balanced positioning`
          }
        </div>
      )}
    </div>
  );
}
