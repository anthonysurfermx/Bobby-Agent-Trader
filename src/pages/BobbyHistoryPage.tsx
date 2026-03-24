// ============================================================
// Bobby Trade History — Stitch "AGENT_TERMINAL // TRADE_HISTORY"
// Full table with agent-coded rows, terminal log, agent focus card
// All data REAL from /api/bobby-pnl
// ============================================================

import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import KineticShell from '@/components/kinetic/KineticShell';

interface Trade {
  symbol: string; direction: string; entryPrice: number; exitPrice: number;
  realizedPnl: number; pnlPct: number; leverage: string; closeTime: string; result: string;
}

interface Summary {
  startingCapital: number; currentEquity: number; totalReturn: number;
  totalTrades: number; wins: number; losses: number; winRate: number;
}

export default function BobbyHistoryPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const perPage = 10;

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

  const paged = trades.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(trades.length / perPage);

  // Terminal log entries from real trades
  const logEntries = trades.slice(0, 6).map(t => {
    const time = new Date(t.closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const type = t.result === 'WIN' ? 'EXEC' : 'WARN';
    const msg = t.result === 'WIN'
      ? `TAKE_PROFIT ${t.symbol} ${t.direction.toUpperCase()} +$${t.realizedPnl.toFixed(4)}`
      : `STOP_LOSS ${t.symbol} ${t.direction.toUpperCase()} ${t.realizedPnl.toFixed(4)}`;
    return { time, type, msg };
  });

  return (
    <KineticShell activeTab="history" showSidebar>
      <Helmet><title>Trade History | Bobby Agent Trader</title></Helmet>

      <div className="p-6 md:p-8 max-w-7xl mx-auto pb-20">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl md:text-5xl font-black tracking-tight">Trade <span className="text-white/20">/</span> History</h1>
          <p className="text-[10px] font-mono text-white/20 mt-1">
            Bobby's real OKX trades · Your agent's simulated signals appear in <a href="/agentic-world/forum" className="text-green-400/50 hover:text-green-400">Debates</a>
          </p>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span className="font-mono text-[10px] text-green-400/60 tracking-widest">LIVE_DATA_STREAMING</span>
          </div>
        </motion.div>

        {loading ? (
          <div className="text-center py-20"><span className="text-[10px] font-mono text-white/20 animate-pulse">LOADING HISTORY...</span></div>
        ) : summary ? (
          <>
            {/* Stats Overview */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'TOTAL_PNL', value: `${summary.totalReturn >= 0 ? '+' : ''}${summary.totalReturn}%`, color: summary.totalReturn >= 0 ? 'text-green-400' : 'text-red-400' },
                { label: 'WIN_RATE', value: `${summary.winRate.toFixed(1)}%`, color: 'text-white' },
                { label: 'EQUITY', value: `$${summary.currentEquity.toFixed(2)}`, color: 'text-green-400' },
                { label: 'TOTAL_TRADES', value: String(summary.totalTrades), color: 'text-white' },
              ].map(stat => (
                <div key={stat.label} className="bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] p-5 rounded">
                  <span className="text-[9px] font-mono text-white/30 tracking-widest">{stat.label}</span>
                  <div className={`text-xl md:text-2xl font-mono font-bold mt-1 ${stat.color}`}>{stat.value}</div>
                </div>
              ))}
            </motion.div>

            {/* Trades Table */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
              className="bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] rounded overflow-hidden mb-8">
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-[10px]">
                  <thead className="bg-[#1c1b1b] text-white/30 sticky top-0">
                    <tr>
                      <th className="p-3 font-normal">TIMESTAMP</th>
                      <th className="p-3 font-normal">ASSET</th>
                      <th className="p-3 font-normal">DIRECTION</th>
                      <th className="p-3 font-normal">LEVERAGE</th>
                      <th className="p-3 font-normal text-right">ENTRY</th>
                      <th className="p-3 font-normal text-right">EXIT</th>
                      <th className="p-3 font-normal text-right">PNL%</th>
                      <th className="p-3 font-normal text-right">PNL $</th>
                      <th className="p-3 font-normal">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.02]">
                    {paged.map((t, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <td className="p-3 text-white/25">
                          {new Date(t.closeTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                          {new Date(t.closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-3 font-bold text-white/80">{t.symbol}/USDT</td>
                        <td className={`p-3 font-bold ${t.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                          {t.direction.toUpperCase()}
                        </td>
                        <td className="p-3 text-white/40">{t.leverage}</td>
                        <td className="p-3 text-right text-white/60 tabular-nums">{t.entryPrice.toFixed(2)}</td>
                        <td className="p-3 text-right text-white/60 tabular-nums">{t.exitPrice.toFixed(2)}</td>
                        <td className={`p-3 text-right tabular-nums ${t.pnlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {t.pnlPct >= 0 ? '+' : ''}{t.pnlPct.toFixed(1)}%
                        </td>
                        <td className={`p-3 text-right tabular-nums ${t.realizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {t.realizedPnl >= 0 ? '+' : ''}${t.realizedPnl.toFixed(4)}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold ${
                            t.result === 'WIN' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                          }`}>{t.result}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              <div className="p-3 border-t border-white/[0.04] flex items-center justify-between bg-black/20">
                <span className="text-[9px] font-mono text-white/20">
                  {trades.length > 0
                    ? `SHOWING ${page * perPage + 1}-${Math.min((page + 1) * perPage, trades.length)} OF ${trades.length} TRADES`
                    : 'NO TRADES RECORDED'}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                    className="px-3 py-1 text-[9px] font-mono bg-white/[0.03] border border-white/[0.06] text-white/30 hover:text-white/60 disabled:opacity-30 transition-colors rounded">
                    PREV
                  </button>
                  <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                    className="px-3 py-1 text-[9px] font-mono bg-white/[0.03] border border-white/[0.06] text-white/30 hover:text-white/60 disabled:opacity-30 transition-colors rounded">
                    NEXT
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Bottom: Terminal Log + Agent Focus */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Terminal Output Log */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                className="lg:col-span-2 bg-black/40 border border-white/[0.04] rounded p-4 overflow-hidden">
                <span className="text-[9px] font-mono text-white/30 tracking-widest block mb-3">TERMINAL_OUTPUT</span>
                <div className="font-mono text-[10px] space-y-1 max-h-40 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#22c55e transparent' }}>
                  {logEntries.map((entry, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-white/15 w-16 flex-shrink-0">{entry.time}</span>
                      <span className={`w-10 flex-shrink-0 ${entry.type === 'EXEC' ? 'text-green-400' : 'text-amber-400'}`}>[{entry.type}]</span>
                      <span className="text-white/50">{entry.msg}</span>
                    </div>
                  ))}
                  <div className="flex gap-3 animate-pulse">
                    <span className="text-white/15 w-16">--:--:--</span>
                    <span className="text-green-400 w-10">[INFO]</span>
                    <span className="text-green-400/40">AWAITING_NEXT_CYCLE... █</span>
                  </div>
                </div>
              </motion.div>

              {/* Agent Focus Card */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                className="bg-white/[0.02] backdrop-blur-sm border-l-4 border-l-green-500 border border-white/[0.04] rounded p-5">
                <span className="text-[9px] font-mono text-white/30 tracking-widest block mb-3">AGENT_FOCUS: BOBBY_CIO</span>
                <div className="space-y-3 font-mono text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-white/30">WIN_RATE</span>
                    <span className="text-green-400 font-bold">{summary.winRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/30">TOTAL_RETURN</span>
                    <span className={summary.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}>{summary.totalReturn}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/30">TRADES</span>
                    <span className="text-white/60">{summary.totalTrades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/30">BIAS</span>
                    <span className={summary.winRate >= 60 ? 'text-green-400' : summary.winRate >= 40 ? 'text-amber-400' : 'text-red-400'}>
                      {summary.winRate >= 60 ? 'AGGRESSIVE' : summary.winRate >= 40 ? 'ADAPTIVE' : 'DEFENSIVE'}
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        ) : (
          <div className="text-center py-20 text-white/20 text-sm font-mono">No history available</div>
        )}
      </div>
    </KineticShell>
  );
}
