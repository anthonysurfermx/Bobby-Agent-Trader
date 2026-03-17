// ============================================================
// DiscoverPanel — Simplified smart money signals for beginners
// Top 3 visible, expand for more. Clean, essential info only.
// ============================================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Users, ExternalLink, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react';
import type { SmartMoneyMarket, WhaleSignal } from '@/services/polymarket.service';
import type { AgentLogEntry } from '@/components/claw-trader/AgentActivityLog';
import { AgentActivityLog } from '@/components/claw-trader/AgentActivityLog';
import { DexQuotePanel } from '@/components/claw-trader/DexQuotePanel';
import { CEXInsightBadge } from './CEXInsightBadge';
import { CopyTradeCard } from './CopyTradeCard';
import { OnchainIntelBadge } from './OnchainIntelBadge';

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

interface Props {
  markets: SmartMoneyMarket[];
  whaleSignals: WhaleSignal[];
  loading: boolean;
  progress: string;
  agentLog: AgentLogEntry[];
}

export function DiscoverPanel({ markets, whaleSignals, loading, progress, agentLog }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? markets.slice(0, 10) : markets.slice(0, 3);

  return (
    <div className="space-y-2.5">
      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm text-neutral-400">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            {progress || 'Scanning smart money...'}
          </div>
          {agentLog.length > 0 && (
            <AgentActivityLog entries={agentLog} />
          )}
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-neutral-900/50 rounded-xl p-4 animate-pulse">
              <div className="h-4 w-3/4 bg-neutral-800 rounded mb-3" />
              <div className="h-3 w-1/2 bg-neutral-800 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && markets.length === 0 && (
        <div className="text-center py-8 text-neutral-500 text-sm">
          No smart money data yet. Scanning will start automatically.
        </div>
      )}

      {/* Market cards — simplified */}
      {visible.map((market, idx) => {
        const isExpanded = expandedId === market.conditionId;
        const isYes = market.topOutcome.toLowerCase() === 'yes';
        const strong = market.capitalConsensus >= 70;

        const marketSignals = whaleSignals.filter(
          s => s.marketSlug === market.slug || s.marketTitle === market.title
        ).slice(0, 3);

        return (
          <div key={market.conditionId}>
            <button
              onClick={() => setExpandedId(isExpanded ? null : market.conditionId)}
              className="w-full text-left bg-neutral-900/50 hover:bg-neutral-900/70 border border-neutral-800 hover:border-neutral-700 rounded-xl p-3.5 transition-all"
            >
              <div className="flex items-center gap-3">
                {/* Direction indicator */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  isYes ? 'bg-green-500/10' : 'bg-red-500/10'
                }`}>
                  {isYes
                    ? <TrendingUp className="w-5 h-5 text-green-400" />
                    : <TrendingDown className="w-5 h-5 text-red-400" />
                  }
                </div>

                <div className="flex-1 min-w-0">
                  {/* Market title — 2 lines max */}
                  <h3 className="text-[13px] font-medium text-neutral-200 line-clamp-2 mb-1">
                    {market.title}
                  </h3>

                  {/* Key stats — only the essential 3 */}
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className={`font-bold ${isYes ? 'text-green-400' : 'text-red-400'}`}>
                      {market.topOutcome} {market.topOutcomeCapitalPct}%
                    </span>
                    <span className="text-neutral-600">·</span>
                    <span className="flex items-center gap-0.5 text-neutral-500">
                      <Users className="w-3 h-3" />
                      {market.traderCount}
                    </span>
                    <span className="text-neutral-600">·</span>
                    <span className="text-neutral-500">{formatUSD(market.totalCapital)}</span>
                    {strong && (
                      <>
                        <span className="text-neutral-600">·</span>
                        <span className="text-green-400 text-[10px] font-medium">Strong</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Rank + expand */}
                <div className="flex flex-col items-center gap-1 shrink-0">
                  {idx === 0 && (
                    <span className="text-[8px] font-bold text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">
                      #1
                    </span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 text-neutral-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </button>

            {/* Expanded details */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="bg-neutral-900/30 border border-t-0 border-neutral-800 rounded-b-xl p-4 space-y-4">
                    {/* Capital distribution bar */}
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">Where the money is</div>
                      <div className="space-y-1.5">
                        {market.outcomeBias.map(ob => {
                          const pct = market.totalCapital > 0 ? (ob.capital / market.totalCapital) * 100 : 0;
                          return (
                            <div key={ob.outcome} className="flex items-center gap-2">
                              <span className="text-xs text-neutral-400 w-12">{ob.outcome}</span>
                              <div className="flex-1 bg-neutral-800 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${ob.outcome.toLowerCase() === 'yes' ? 'bg-green-500' : 'bg-red-500'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-neutral-500 w-14 text-right">
                                {formatUSD(ob.capital)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Top 3 traders — simplified */}
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">Top Traders on This</div>
                      <div className="space-y-1">
                        {market.traders.slice(0, 3).map(t => (
                          <div key={t.address} className="flex items-center justify-between text-xs">
                            <span className="text-neutral-300">#{t.rank} {t.name}</span>
                            <div className="flex items-center gap-2">
                              <span className={t.outcome.toLowerCase() === 'yes' ? 'text-green-400' : 'text-red-400'}>
                                {t.outcome}
                              </span>
                              <span className="text-neutral-500">{formatUSD(t.positionValue)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Recent whale moves */}
                    {marketSignals.length > 0 && (
                      <div>
                        <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">Recent Whale Moves</div>
                        <div className="space-y-1">
                          {marketSignals.map((s, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-neutral-400">{s.traderName}</span>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.side === 'BUY' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                                  {s.side}
                                </span>
                                <span className="text-neutral-500">{formatUSD(s.usdcSize)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* CEX + On-chain intel */}
                    <CEXInsightBadge marketTitle={market.title} />
                    <OnchainIntelBadge
                      marketTitle={market.title}
                      polymarketWhales={market.traders.map(t => t.address)}
                    />

                    {/* Copy Trade */}
                    {market.traders.length > 0 && (
                      <CopyTradeCard market={market} trader={market.traders[0]} />
                    )}

                    {/* DEX Quote */}
                    <DexQuotePanel
                      marketSlug={market.slug || ''}
                      marketTitle={market.title}
                    />

                    {/* Polymarket link */}
                    {market.slug && (
                      <a
                        href={`https://polymarket.com/event/${market.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View on Polymarket
                      </a>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {/* Show more / less */}
      {!loading && markets.length > 3 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[11px] text-neutral-500 hover:text-neutral-300 border border-neutral-800/50 hover:border-neutral-700 rounded-xl transition-all"
        >
          {showAll ? (
            <>Show less</>
          ) : (
            <>
              Show {Math.min(markets.length - 3, 7)} more markets
              <ChevronRight className="w-3 h-3" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
