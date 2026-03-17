// ============================================================
// DexQuotePanel — Shows OKX DEX swap price for a detected asset
// Queries multiple chains via OKX DEX Aggregator V6
// Priority: Ethereum (deep liquidity) with X Layer badge for hackathon
// ============================================================

import { useState, useCallback } from 'react';
import { ExternalLink } from 'lucide-react';

const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Chain configs with token addresses
interface ChainConfig {
  chainId: string;
  name: string;
  explorer: string;
  tokens: Record<string, { address: string; symbol: string; decimals: number }>;
}

const CHAINS: ChainConfig[] = [
  {
    chainId: '1', // Ethereum — deep liquidity
    name: 'Ethereum',
    explorer: 'https://etherscan.io',
    tokens: {
      USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 },
      USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6 },
      WETH: { address: NATIVE_TOKEN, symbol: 'ETH', decimals: 18 },
      WBTC: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', decimals: 8 },
    },
  },
  {
    chainId: '196', // X Layer — OKX hackathon chain
    name: 'X Layer',
    explorer: 'https://www.oklink.com/x-layer',
    tokens: {
      USDC: { address: '0x74b7F16337b8972027F6196A17a631aC6dE26d22', symbol: 'USDC', decimals: 6 },
      USDT: { address: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d', symbol: 'USDT', decimals: 6 },
      WETH: { address: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c', symbol: 'WETH', decimals: 18 },
      WBTC: { address: '0xEA034fb02eB1808C2cc3adbC15f447B93CbE08e1', symbol: 'WBTC', decimals: 8 },
      OKB: { address: NATIVE_TOKEN, symbol: 'OKB', decimals: 18 },
    },
  },
];

// Maps Polymarket asset keywords to token key
const SLUG_ASSET_MAP: Record<string, string> = {
  btc: 'WBTC', bitcoin: 'WBTC',
  eth: 'WETH', ethereum: 'WETH',
  okb: 'OKB',
};

function toSmallestUnit(amount: number, decimals: number): string {
  return BigInt(Math.round(amount * (10 ** decimals))).toString();
}

interface DexQuoteResult {
  chainId: string;
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount: number;
  fromUnitPrice: number;
  toUnitPrice: number;
  effectivePrice: number;
  estimateGasFee: string;
  routes: Array<{
    percent: string;
    path: Array<{ dex: string; from: string; to: string }>;
  }>;
  dexComparison: Array<{
    dex: string;
    logo: string;
    receiveAmount: number;
    fee: string;
  }>;
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
  const [quote, setQuote] = useState<DexQuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState(100);
  const [usedChain, setUsedChain] = useState<ChainConfig | null>(null);

  const asset = extractAsset(marketSlug, marketTitle);

  const fetchQuote = useCallback(async () => {
    if (!asset) return;

    setLoading(true);
    setError(null);
    setQuote(null);

    // Try chains in order until we get liquidity
    for (const chain of CHAINS) {
      const toToken = chain.tokens[asset];
      const fromToken = chain.tokens.USDC;
      if (!toToken || !fromToken) continue;

      try {
        const amountRaw = toSmallestUnit(amount, fromToken.decimals);
        const params = new URLSearchParams({
          chainId: chain.chainId,
          fromToken: fromToken.address,
          toToken: toToken.address,
          amount: amountRaw,
        });

        const res = await fetch(`/api/dex-quote?${params}`);
        const data = await res.json();

        if (!res.ok || !data.ok) {
          // If insufficient liquidity, try next chain
          if (data.code === '82000' || data.detail?.includes('liquidity')) continue;
          throw new Error(data.detail || data.msg || data.error || 'Failed to get quote');
        }

        if (!data.quote) continue;

        setQuote(data.quote);
        setUsedChain(chain);
        setLoading(false);
        return;
      } catch (err) {
        // If it's a real error (not liquidity), stop
        if (err instanceof Error && !err.message.includes('liquidity')) {
          setError(err.message);
          setLoading(false);
          return;
        }
      }
    }

    // No chain had liquidity
    setError('No liquidity found across supported chains');
    setLoading(false);
  }, [asset, amount]);

  if (!asset) return null;

  const displayAsset = asset === 'WBTC' ? 'BTC' : asset === 'WETH' ? 'ETH' : asset;

  const arbOpportunity = quote && spotPrice && polymarketPrice
    ? ((1 - polymarketPrice) * spotPrice - quote.effectivePrice * quote.toAmount) / (quote.effectivePrice * quote.toAmount) * 100
    : null;

  return (
    <div className={`border border-cyan-500/20 bg-cyan-500/5 p-3 font-mono ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 text-[10px] font-bold">⬡ OKX DEX AGGREGATOR</span>
          {usedChain && (
            <span className="text-cyan-400/30 text-[9px]">{usedChain.name} (Chain {usedChain.chainId})</span>
          )}
        </div>
        {usedChain && quote && (
          <a
            href={`${usedChain.explorer}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400/30 hover:text-cyan-400 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Quote input */}
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

      {/* Error */}
      {error && (
        <div className="text-red-400/70 text-[10px] mb-1">
          {'>'} {error}
        </div>
      )}

      {/* Quote result */}
      {quote && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-cyan-400/50">You get:</span>
            <span className="text-cyan-300 font-bold">
              {quote.toAmount.toFixed(asset === 'WBTC' ? 6 : 4)} {displayAsset}
            </span>
          </div>

          <div className="flex items-center justify-between text-[10px]">
            <span className="text-cyan-400/50">Price per {displayAsset}:</span>
            <span className="text-cyan-300">
              ${quote.effectivePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
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

          {spotPrice && quote.effectivePrice > 0 && (
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-cyan-400/50">DEX vs CEX:</span>
              {(() => {
                const diff = ((quote.effectivePrice - spotPrice) / spotPrice) * 100;
                const color = Math.abs(diff) < 0.5 ? 'text-cyan-300/60' :
                  diff > 0 ? 'text-red-400' : 'text-green-400';
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
            <span className="text-cyan-400/50">Est. gas:</span>
            <span className="text-cyan-300/40">{quote.estimateGasFee}</span>
          </div>

          {quote.routes.length > 0 && (
            <div className="text-[9px] text-cyan-400/30">
              {'>'} Route: {quote.routes.map(r =>
                r.path.map(p => p.dex).join(' → ')
              ).join(' | ')}
              {quote.routes[0]?.percent && ` (${quote.routes[0].percent}%)`}
            </div>
          )}

          {quote.dexComparison.length > 1 && (
            <div className="border-t border-cyan-500/10 pt-1.5 mt-1.5">
              <div className="text-[9px] text-cyan-400/30 mb-1">{'>'} Price comparison across DEXes:</div>
              <div className="space-y-0.5">
                {quote.dexComparison.slice(0, 4).map((d, i) => (
                  <div key={d.dex} className="flex items-center justify-between text-[9px]">
                    <span className={i === 0 ? 'text-green-400' : 'text-cyan-400/40'}>
                      {i === 0 ? '★ ' : '  '}{d.dex}
                    </span>
                    <span className={i === 0 ? 'text-green-400' : 'text-cyan-400/30'}>
                      {d.receiveAmount.toFixed(asset === 'WBTC' ? 6 : 4)} {displayAsset}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {arbOpportunity !== null && Math.abs(arbOpportunity) > 1 && (
            <div className={`border-t border-cyan-500/10 pt-1.5 mt-1.5 text-[10px] font-bold ${
              arbOpportunity > 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {arbOpportunity > 0 ? '▲' : '▼'} Polymarket vs DEX arbitrage: {arbOpportunity > 0 ? '+' : ''}{arbOpportunity.toFixed(1)}%
            </div>
          )}
        </div>
      )}

      {!quote && !loading && !error && (
        <div className="text-cyan-400/25 text-[9px] text-center py-1">
          Click QUOTE to get best swap price via OKX DEX Aggregator
        </div>
      )}
    </div>
  );
}
