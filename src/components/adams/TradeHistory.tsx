// ============================================================
// TradeHistory — Bobby's trade history with real PnL data
// Stitch "Agent Terminal" design — Bloomberg-style trade cards
// Data: /api/bobby-pnl (real OKX trades)
// ============================================================

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Trade {
  symbol: string;
  direction: string;
  entryPrice: number;
  exitPrice: number;
  realizedPnl: number;
  pnlPct: number;
  leverage: string;
  openTime: string;
  closeTime: string;
  result: string;
}

interface Summary {
  currentEquity: number;
  totalReturn: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
}

type AgentFilter = 'all' | 'cio' | 'alpha';

export function TradeHistory({ language = 'es' }: { language?: string }) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filter, setFilter] = useState<AgentFilter>('all');
  const [loading, setLoading] = useState(true);
  const isEs = language === 'es';

  useEffect(() => {
    fetch('/api/bobby-pnl')
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setSummary(d.summary);
          setTrades(d.closedPositions || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <span className="text-[10px] font-mono text-white/20 animate-pulse">LOADING TRADE HISTORY...</span>
    </div>
  );

  if (!summary || trades.length === 0) return (
    <div className="text-center py-12">
      <span className="text-[10px] font-mono text-white/20">{isEs ? 'Sin trades registrados' : 'No trades recorded'}</span>
    </div>
  );

  // Calculate 24h PnL
  const now = Date.now();
  const trades24h = trades.filter(t => now - new Date(t.closeTime).getTime() < 24 * 60 * 60 * 1000);
  const pnl24h = trades24h.reduce((sum, t) => sum + t.realizedPnl, 0);
  const activeMargin = summary.currentEquity;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-mono text-white/40 tracking-[2px]">TRADE_HISTORY</span>
        </div>
        <span className="text-[8px] font-mono text-white/20">{trades.length} TRADES</span>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1">
        {[
          { id: 'all' as AgentFilter, label: 'ALL_UNITS' },
          { id: 'cio' as AgentFilter, label: 'BOBBY_CIO' },
          { id: 'alpha' as AgentFilter, label: 'ALPHA_HUNTER' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1 text-[8px] font-mono tracking-[1px] rounded transition-all ${
              filter === f.id
                ? 'bg-green-500/15 border border-green-500/30 text-green-400'
                : 'bg-white/[0.03] border border-white/[0.06] text-white/30 hover:text-white/50'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="border border-white/[0.04] bg-white/[0.02] backdrop-blur-sm p-3 rounded">
          <span className="text-[8px] font-mono text-white/25 tracking-[1px] block">TOTAL_PNL_24HR</span>
          <span className={`text-lg font-bold font-mono ${pnl24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {pnl24h >= 0 ? '+' : ''}${pnl24h.toFixed(2)}
          </span>
        </div>
        <div className="border border-white/[0.04] bg-white/[0.02] backdrop-blur-sm p-3 rounded">
          <span className="text-[8px] font-mono text-white/25 tracking-[1px] block">ACTIVE_MARGIN</span>
          <span className="text-lg font-bold font-mono text-white">
            ${activeMargin.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Trade cards */}
      <div className="space-y-2">
        {trades.map((trade, i) => {
          const isWin = trade.result === 'WIN';
          const isLong = trade.direction === 'long';

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="border border-white/[0.04] bg-white/[0.02] backdrop-blur-sm rounded overflow-hidden"
            >
              {/* Trade header */}
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold text-sm font-mono">{trade.symbol}/USDT</span>
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wider ${
                    isLong ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                  }`}>
                    {trade.direction.toUpperCase()}_{trade.leverage}
                  </span>
                  <span className="text-[7px] font-mono text-yellow-400/50">BOBBY_CIO</span>
                </div>
                <div className="text-right">
                  <span className={`text-base font-bold font-mono ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                    {trade.pnlPct >= 0 ? '+' : ''}{trade.pnlPct.toFixed(1)}%
                  </span>
                  <div className={`text-[9px] font-mono ${isWin ? 'text-green-400/60' : 'text-red-400/60'}`}>
                    {trade.realizedPnl >= 0 ? '+' : ''}${trade.realizedPnl.toFixed(4)}
                  </div>
                </div>
              </div>

              {/* Trade details + ASK WHY */}
              <div className="flex items-center justify-between px-3 pb-2 text-[9px] font-mono text-white/30">
                <span>{trade.entryPrice.toFixed(2)}</span>
                <span className="text-white/15">→</span>
                <span>{trade.exitPrice.toFixed(2)}</span>
                <span className="text-white/15">|</span>
                <span>{new Date(trade.closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <a href={`/agentic-world/bobby?q=${encodeURIComponent(`Why did you go ${trade.direction} on ${trade.symbol} at $${trade.entryPrice.toFixed(2)}?`)}`}
                  className="text-yellow-400/40 hover:text-yellow-400 transition-colors ml-2">
                  ASK WHY ›
                </a>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
