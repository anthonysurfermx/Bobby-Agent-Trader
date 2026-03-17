// ============================================================
// CopyTradeCard — "Follow This Trade" flow
// Shows whale trade → calculates position → links to execution
// ============================================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, TrendingUp, Shield, Zap, ExternalLink } from 'lucide-react';
import type { SmartMoneyTrader, SmartMoneyMarket } from '@/services/polymarket.service';

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

interface Props {
  market: SmartMoneyMarket;
  trader: SmartMoneyTrader;
}

type RiskLevel = 'conservative' | 'moderate' | 'aggressive';

const RISK_CONFIGS: Record<RiskLevel, { label: string; pct: number; color: string; bg: string; icon: typeof Shield }> = {
  conservative: { label: 'Conservative', pct: 5, color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Shield },
  moderate: { label: 'Moderate', pct: 10, color: 'text-amber-400', bg: 'bg-amber-500/10', icon: TrendingUp },
  aggressive: { label: 'Aggressive', pct: 25, color: 'text-red-400', bg: 'bg-red-500/10', icon: Zap },
};

export function CopyTradeCard({ market, trader }: Props) {
  const [risk, setRisk] = useState<RiskLevel>('moderate');
  const [budget, setBudget] = useState(1000);
  const [copied, setCopied] = useState(false);
  const [showExecution, setShowExecution] = useState(false);

  const config = RISK_CONFIGS[risk];

  // Whale's conviction: what % of this market's total capital is this trader?
  const whaleConviction = market.totalCapital > 0 ? trader.positionValue / market.totalCapital : 0;

  // Position sizing: % of budget, scaled by whale conviction
  // E.g. Moderate (10%) * $1000 = $100 base, then adjust by conviction
  const baseSize = budget * (config.pct / 100);
  const convictionBonus = 1 + Math.min(whaleConviction * 2, 1); // max 2x
  const suggestedSize = Math.round(baseSize * convictionBonus);
  const effectiveSize = Math.min(suggestedSize, budget);

  // Price: use market price, then trader entry, then consensus-implied
  const isYes = trader.outcome.toLowerCase() === 'yes';
  const rawPrice = market.currentPrice || market.marketPrice || trader.entryPrice || 0;
  const entryPrice = rawPrice > 0 ? (isYes ? rawPrice : (1 - rawPrice)) : 0;
  const hasPrice = entryPrice > 0 && entryPrice < 1;
  const potentialReturn = hasPrice ? ((1 / entryPrice) - 1) * 100 : 0;

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(trader.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scrollToExecute = (mode: 'dex' | 'cex') => {
    // Find the Execute panel and scroll to it
    const executeEl = document.querySelector('[data-panel="execute"]');
    if (executeEl) {
      executeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Dispatch custom event to set mode
      window.dispatchEvent(new CustomEvent('execute-mode', { detail: { mode } }));
    }
  };

  return (
    <div className="border border-green-500/20 bg-green-500/5 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 bg-green-500/10 border-b border-green-500/15 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-green-400">COPY TRADE</span>
          <span className="text-[9px] text-neutral-500">Follow whale #{trader.rank}</span>
        </div>
        <button
          onClick={handleCopyAddress}
          className="flex items-center gap-1 text-[9px] text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          {trader.address.slice(0, 6)}...{trader.address.slice(-4)}
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Whale's position */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[9px] text-neutral-500 mb-0.5">Whale Position</div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-neutral-200">
                {trader.name || `Trader #${trader.rank}`}
              </span>
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                isYes ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
              }`}>
                {trader.outcome}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-neutral-200">{formatUSD(trader.positionValue)}</div>
            <div className="text-[10px] text-neutral-500">
              {(whaleConviction * 100).toFixed(1)}% of market
            </div>
          </div>
        </div>

        {/* Risk selector */}
        <div>
          <div className="text-[9px] text-neutral-500 mb-1.5">Risk Appetite</div>
          <div className="flex gap-1">
            {(Object.entries(RISK_CONFIGS) as [RiskLevel, typeof config][]).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setRisk(key)}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-medium rounded-lg transition-colors ${
                  risk === key
                    ? `${cfg.bg} ${cfg.color} border border-current/20`
                    : 'text-neutral-600 hover:text-neutral-400 border border-transparent'
                }`}
              >
                <cfg.icon className="w-3 h-3" />
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Budget input */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <div className="text-[9px] text-neutral-500 mb-1">Your Budget (USDC)</div>
            <input
              type="number"
              value={budget}
              onChange={e => setBudget(Math.max(10, Number(e.target.value)))}
              className="w-full bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-green-500/40 transition-colors"
              min={10}
              max={1000000}
            />
          </div>
          <div className="flex-1">
            <div className="text-[9px] text-neutral-500 mb-1">
              Suggested ({config.pct}% × conviction)
            </div>
            <div className="bg-neutral-900/40 border border-green-500/20 rounded-lg px-3 py-1.5 text-sm font-bold text-green-400">
              {formatUSD(effectiveSize)}
            </div>
          </div>
        </div>

        {/* Position summary */}
        <div className="bg-neutral-900/40 rounded-lg p-2.5 space-y-1.5">
          {hasPrice ? (
            <>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-neutral-500">Entry Price</span>
                <span className="text-neutral-300">{(entryPrice * 100).toFixed(1)}¢ per share</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-neutral-500">Position</span>
                <span className="text-neutral-300">
                  {formatUSD(effectiveSize)} on <b className={isYes ? 'text-green-400' : 'text-red-400'}>{trader.outcome}</b>
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-neutral-500">If correct (max return)</span>
                <span className="text-green-400 font-bold">
                  +{formatUSD(effectiveSize * (1 / entryPrice - 1))} ({potentialReturn.toFixed(0)}%)
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-neutral-500">If wrong (max loss)</span>
                <span className="text-red-400">-{formatUSD(effectiveSize)}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-neutral-500">Position</span>
                <span className="text-neutral-300">
                  {formatUSD(effectiveSize)} on <b className={isYes ? 'text-green-400' : 'text-red-400'}>{trader.outcome}</b>
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-neutral-500">Whale entry</span>
                <span className="text-neutral-300">
                  {trader.entryPrice > 0 ? `${(trader.entryPrice * 100).toFixed(1)}¢` : 'Unknown'}
                </span>
              </div>
            </>
          )}
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-neutral-500">Whale consensus</span>
            <span className="text-neutral-300">
              {market.capitalConsensus}% agreement · {market.traderCount} whales
            </span>
          </div>
        </div>

        {/* Execute buttons */}
        <button
          onClick={() => setShowExecution(!showExecution)}
          className="w-full py-2.5 bg-green-500/15 border border-green-500/30 rounded-xl text-sm font-medium text-green-400 hover:bg-green-500/25 transition-colors"
        >
          {showExecution ? 'Hide Execution Options' : 'Follow This Trade →'}
        </button>

        <AnimatePresence>
          {showExecution && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-2 pt-1">
                {/* Polymarket direct — primary action */}
                {market.slug && (
                  <a
                    href={`https://polymarket.com/event/${market.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-between px-3 py-3 bg-cyan-500/10 border border-cyan-500/25 rounded-lg hover:bg-cyan-500/15 transition-colors"
                  >
                    <div>
                      <div className="text-xs font-medium text-cyan-400">Trade on Polymarket</div>
                      <div className="text-[9px] text-neutral-500">
                        Buy {trader.outcome} shares · Same position as whale #{trader.rank}
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-cyan-400/50" />
                  </a>
                )}

                {/* DEX execution — scroll to Execute panel */}
                <button
                  onClick={() => scrollToExecute('dex')}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-amber-500/8 border border-amber-500/20 rounded-lg hover:bg-amber-500/15 transition-colors text-left"
                >
                  <div>
                    <div className="text-[11px] font-medium text-amber-400">DEX Swap (On-chain)</div>
                    <div className="text-[9px] text-neutral-500">
                      Swap {formatUSD(effectiveSize)} USDC via OKX DEX Aggregator
                    </div>
                  </div>
                  <span className="text-[10px] text-amber-400/50">↓</span>
                </button>

                {/* CEX execution — scroll to Execute panel */}
                <button
                  onClick={() => scrollToExecute('cex')}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-purple-500/8 border border-purple-500/20 rounded-lg hover:bg-purple-500/15 transition-colors text-left"
                >
                  <div>
                    <div className="text-[11px] font-medium text-purple-400">CEX Trade (OKX)</div>
                    <div className="text-[9px] text-neutral-500">
                      Spot/Perps via Agent Trade Kit · 95 tools
                    </div>
                  </div>
                  <span className="text-[10px] text-purple-400/50">↓</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
