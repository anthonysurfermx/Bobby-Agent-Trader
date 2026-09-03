// ============================================================
// DexQuotePanel — Uniswap V3 (Base) price for a detected asset.
// Read-only: GET /api/base-swap returns the quote Bobby's own quoter call
// produced; no wallet, no calldata. Used next to Polymarket markets to
// compare the on-chain spot with the crowd's implied price.
// ============================================================

import { useState, useCallback } from 'react';
import { ExternalLink } from 'lucide-react';
import { BASE, BASE_CHAIN_ID } from '@/config/chains';
import { findBaseToken } from '@/lib/base-swap/tokens';

// Maps Polymarket asset keywords to an allow-listed Base token.
const SLUG_ASSET_MAP: Record<string, string> = {
  btc: 'cbBTC', bitcoin: 'cbBTC',
  eth: 'ETH', ethereum: 'ETH',
  aero: 'AERO', aerodrome: 'AERO',
  // Coinbase tokenized stocks on Base (quote fails closed with no_route until a pool exists)
  nvidia: 'NVDAc', nvda: 'NVDAc',
  apple: 'AAPLc', aapl: 'AAPLc',
  meta: 'METAc', facebook: 'METAc',
  google: 'GOOGLc', alphabet: 'GOOGLc', googl: 'GOOGLc',
  tesla: 'TSLAc', tsla: 'TSLAc',
  microsoft: 'MSFTc', msft: 'MSFTc',
  amazon: 'AMZNc', amzn: 'AMZNc',
  coinbase: 'COINc',
  microstrategy: 'MSTRc', mstr: 'MSTRc',
  spacex: 'SPCXc',
};

interface BaseQuote {
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  executionPrice: number;
  priceImpactPct: number | null;
  route: { description: string; gasEstimate: string };
  venue: { name: string; router: string };
  alternatives: Array<{ description: string; amountOut: string }>;
}

interface Props {
  marketSlug: string;
  marketTitle: string;
  polymarketPrice?: number;
  spotPrice?: number;
  className?: string;
}

function extractAsset(slug: string, title: string): string | null {
  const text = `${slug} ${title}`.toLowerCase();
  for (const [keyword, symbol] of Object.entries(SLUG_ASSET_MAP)) {
    const pattern = new RegExp(`(^|[\\s-])${keyword}([\\s-]|$)`);
    if (pattern.test(text)) return symbol;
  }
  return null;
}

export function DexQuotePanel({ marketSlug, marketTitle, polymarketPrice, spotPrice, className = '' }: Props) {
  const [quote, setQuote] = useState<BaseQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState(100);

  const asset = extractAsset(marketSlug, marketTitle);
  const token = asset ? findBaseToken(asset) : null;

  const fetchQuote = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setQuote(null);
    try {
      const params = new URLSearchParams({ tokenIn: 'USDC', tokenOut: token.symbol, amount: String(amount) });
      const res = await fetch(`/api/base-swap?${params}`);
      const data = await res.json();
      if (!res.ok || !data.ok || !data.quote) throw new Error(data.error || 'Failed to get quote');
      setQuote(data.quote as BaseQuote);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quote failed');
    } finally {
      setLoading(false);
    }
  }, [token, amount]);

  if (!token) return null;

  const displayAsset = token.symbol === 'cbBTC' ? 'BTC' : (token.underlying ?? token.symbol);
  // USDC per unit of the asset at this size.
  const unitPrice = quote && quote.executionPrice > 0 ? 1 / quote.executionPrice : 0;
  const toAmount = quote ? Number(quote.amountOut) : 0;

  const arbOpportunity = quote && spotPrice && polymarketPrice && unitPrice > 0
    ? ((1 - polymarketPrice) * spotPrice - unitPrice * toAmount) / (unitPrice * toAmount) * 100
    : null;

  return (
    <div className={`border border-cyan-500/20 bg-cyan-500/5 p-3 font-mono ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 text-[10px] font-bold">⬡ UNISWAP V3 · {BASE.name.toUpperCase()}</span>
          <span className="text-cyan-400/30 text-[9px]">Chain {BASE_CHAIN_ID}</span>
        </div>
        {quote && (
          <a
            href={`${BASE.explorerUrl}/address/${quote.venue.router}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400/30 hover:text-cyan-400 transition-colors"
            onClick={(e) => e.stopPropagation()}
            title="Router on Basescan"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-1 flex-1 bg-black/40 border border-cyan-500/15 px-2 py-1">
          <span className="text-cyan-400/50 text-[10px]">$</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Number(e.target.value)))}
            className="bg-transparent text-cyan-300 text-xs w-16 outline-none font-mono"
            min={1}
            max={100000}
            onClick={(e) => e.stopPropagation()}
          />
          <span className="text-cyan-400/30 text-[10px]">USDC</span>
        </div>
        <span className="text-cyan-400/30 text-[10px]">→</span>
        <span className="text-cyan-300 text-[10px] font-bold">{displayAsset}</span>
        <button
          onClick={(e) => { e.stopPropagation(); fetchQuote(); }}
          disabled={loading}
          className="px-2 py-1 text-[10px] font-bold border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
        >
          {loading ? '...' : 'QUOTE'}
        </button>
      </div>

      {error && (
        <div className="text-red-400/70 text-[10px] mb-1">
          {'>'} {error}
        </div>
      )}

      {quote && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-cyan-400/50">You get:</span>
            <span className="text-cyan-300 font-bold">
              {toAmount.toLocaleString(undefined, { maximumFractionDigits: token.symbol === 'cbBTC' ? 6 : 4 })} {displayAsset}
            </span>
          </div>

          <div className="flex items-center justify-between text-[10px]">
            <span className="text-cyan-400/50">Price per {displayAsset}:</span>
            <span className="text-cyan-300">
              ${unitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </div>

          {spotPrice && (
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-cyan-400/50">CEX spot price:</span>
              <span className="text-cyan-300/60">
                ${spotPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {spotPrice && unitPrice > 0 && (
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-cyan-400/50">DEX vs CEX:</span>
              {(() => {
                const diff = ((unitPrice - spotPrice) / spotPrice) * 100;
                const color = Math.abs(diff) < 0.5 ? 'text-cyan-300/60' : diff > 0 ? 'text-red-400' : 'text-green-400';
                return (
                  <span className={color}>
                    {diff > 0 ? '+' : ''}{diff.toFixed(2)}%
                    {Math.abs(diff) < 0.5 ? ' (aligned)' : diff > 0 ? ' (DEX premium)' : ' (DEX discount)'}
                  </span>
                );
              })()}
            </div>
          )}

          <div className="flex items-center justify-between text-[10px]">
            <span className="text-cyan-400/50">Min received (0.5%):</span>
            <span className="text-cyan-300/60">{Number(quote.minAmountOut).toLocaleString(undefined, { maximumFractionDigits: 6 })} {displayAsset}</span>
          </div>

          <div className="flex items-center justify-between text-[10px]">
            <span className="text-cyan-400/50">Price impact:</span>
            <span className="text-cyan-300/40">{quote.priceImpactPct === null ? '—' : `${quote.priceImpactPct.toFixed(2)}%`}</span>
          </div>

          <div className="text-[9px] text-cyan-400/30">
            {'>'} Route: {quote.route.description}
          </div>

          {quote.alternatives.length > 0 && (
            <div className="border-t border-cyan-500/10 pt-1.5 mt-1.5">
              <div className="text-[9px] text-cyan-400/30 mb-1">{'>'} Other pools quoted:</div>
              <div className="space-y-0.5">
                {quote.alternatives.map((a) => (
                  <div key={a.description} className="flex items-center justify-between text-[9px]">
                    <span className="text-cyan-400/40">{a.description}</span>
                    <span className="text-cyan-400/30">{Number(a.amountOut).toLocaleString(undefined, { maximumFractionDigits: 6 })} {displayAsset}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {arbOpportunity !== null && Math.abs(arbOpportunity) > 1 && (
            <div className={`border-t border-cyan-500/10 pt-1.5 mt-1.5 text-[10px] font-bold ${arbOpportunity > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {arbOpportunity > 0 ? '▲' : '▼'} Polymarket vs DEX arbitrage: {arbOpportunity > 0 ? '+' : ''}{arbOpportunity.toFixed(1)}%
            </div>
          )}
        </div>
      )}

      {!quote && !loading && !error && (
        <div className="text-cyan-400/25 text-[9px] text-center py-1">
          Click QUOTE for the Uniswap V3 price on {BASE.name}
        </div>
      )}
    </div>
  );
}
