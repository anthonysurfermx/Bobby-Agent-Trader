// ============================================================
// Bobby Portfolio — Stitch "Neo-Tokyo 2030 Hedge Fund" Mobile
// Equity hero, holdings, active signals, council, system logs
// All data REAL from /api/bobby-pnl
// ============================================================

import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import KineticShell from '@/components/kinetic/KineticShell';

export default function BobbyPortfolioPage() {
  const [pnl, setPnl] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/bobby-pnl')
      .then(r => r.json())
      .then(d => { if (d.ok) setPnl(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const s = pnl?.summary;

  // Group closed positions by symbol for "holdings"
  const holdings = (() => {
    if (!pnl) return [];
    const bySymbol: Record<string, { count: number; pnl: number }> = {};
    for (const t of pnl.closedPositions) {
      if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { count: 0, pnl: 0 };
      bySymbol[t.symbol].count++;
      bySymbol[t.symbol].pnl += t.realizedPnl;
    }
    return Object.entries(bySymbol).map(([symbol, data]) => ({
      symbol, trades: data.count, pnl: data.pnl,
      pct: s ? (data.pnl / s.startingCapital * 100) : 0,
    })).sort((a, b) => b.trades - a.trades);
  })();

  // Recent trades as "system logs"
  const logs = pnl?.closedPositions.slice(0, 5).map((t: any) => ({
    time: new Date(t.closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    action: t.result === 'WIN' ? 'PROFIT' : 'LOSS',
    msg: `${t.direction.toUpperCase()} ${t.symbol} ${t.realizedPnl >= 0 ? '+' : ''}$${t.realizedPnl.toFixed(4)}`,
    isWin: t.result === 'WIN',
  })) || [];

  return (
    <KineticShell activeTab="terminal">
      <Helmet><title>Portfolio | Bobby Agent Trader</title></Helmet>

      <div className="max-w-md mx-auto px-5 pt-6 pb-20 space-y-6">
        {loading ? (
          <div className="text-center py-20"><span className="text-[10px] font-mono text-white/20 animate-pulse">CARGANDO...</span></div>
        ) : s ? (
          <>
            {/* Total Equity — Hero */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] rounded p-6 text-center">
              <span className="text-[8px] font-mono text-white/25 tracking-widest">BOBBY'S EQUITY · $100 CHALLENGE</span>
              <div className="text-4xl font-mono font-black text-green-400 mt-2" style={{ textShadow: '0 0 20px rgba(34,197,94,0.3)' }}>
                ${s.currentEquity.toFixed(2)}
              </div>
              <div className="mt-2 flex items-center justify-center gap-3 text-xs font-mono">
                <span className={s.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {s.totalReturn >= 0 ? '+' : ''}{s.totalReturn}%
                </span>
                <span className="text-white/20">from ${s.startingCapital}</span>
              </div>
            </motion.div>

            {/* Holdings — horizontal scroll */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
              <span className="text-[9px] font-mono text-white/30 tracking-widest block mb-3">PNL_BY_ASSET</span>
              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                {holdings.map(h => (
                  <div key={h.symbol} className="min-w-[130px] bg-white/[0.02] border border-white/[0.04] rounded p-4 flex-shrink-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-mono font-bold text-white/80">{h.symbol}</span>
                      <span className="text-[8px] font-mono text-white/20">{h.trades} trades</span>
                    </div>
                    <div className={`text-lg font-mono font-bold ${h.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {h.pnl >= 0 ? '+' : ''}${h.pnl.toFixed(4)}
                    </div>
                    <div className="mt-2 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${h.pnl >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(100, Math.abs(h.pct) * 5)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Active Positions */}
            {pnl.openPositions?.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                <span className="text-[9px] font-mono text-white/30 tracking-widest block mb-3">ACTIVE_SIGNALS</span>
                <div className="space-y-2">
                  {pnl.openPositions.map((p: any, i: number) => (
                    <div key={i} className="bg-white/[0.02] border border-white/[0.04] rounded p-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-bold">{p.symbol}/USDT</span>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                            p.direction === 'long' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                          }`}>{p.direction.toUpperCase()} {p.leverage}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-mono font-bold ${p.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {p.unrealizedPnl >= 0 ? '+' : ''}${p.unrealizedPnl.toFixed(4)}
                        </div>
                        <div className={`text-[9px] font-mono ${p.unrealizedPnlPct >= 0 ? 'text-green-400/60' : 'text-red-400/60'}`}>
                          {p.unrealizedPnlPct >= 0 ? '+' : ''}{p.unrealizedPnlPct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* The Council */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
              <span className="text-[9px] font-mono text-white/30 tracking-widest block mb-3">THE_COUNCIL</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: 'CIO', color: 'text-yellow-400', stat: `${s.winRate.toFixed(0)}% WR` },
                  { name: 'ALPHA', color: 'text-green-400', stat: `${s.wins} signals` },
                  { name: 'RED', color: 'text-red-400', stat: `${s.losses} vetoes` },
                ].map(a => (
                  <div key={a.name} className="bg-white/[0.02] border border-white/[0.04] rounded p-3 text-center">
                    <span className={`text-[8px] font-mono font-bold ${a.color} tracking-widest`}>{a.name}</span>
                    <div className="text-[10px] font-mono text-white/40 mt-1">{a.stat}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* System Logs */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
              <span className="text-[9px] font-mono text-white/30 tracking-widest block mb-3">SYSTEM_LOGS</span>
              <div className="space-y-1.5">
                {logs.map((log: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-[10px] font-mono">
                    <span className={`text-sm ${log.isWin ? 'text-green-400' : 'text-red-400'}`}>
                      {log.isWin ? '✓' : '✗'}
                    </span>
                    <span className="text-white/20 w-12">{log.time}</span>
                    <span className="text-white/50">{log.msg}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* CTAs */}
            <div className="flex gap-2">
              <Link to="/agentic-world/bobby"
                className="flex-1 py-2.5 bg-green-500 text-black font-mono text-[9px] font-black tracking-widest text-center rounded active:scale-95 transition-all"
                style={{ boxShadow: '0 0 15px rgba(34,197,94,0.3)' }}>
                OPEN_TERMINAL
              </Link>
              <Link to="/agentic-world/bobby/challenge"
                className="flex-1 py-2.5 bg-white/[0.03] border border-white/[0.06] text-white/40 font-mono text-[9px] tracking-widest text-center rounded hover:text-white/60 transition-colors">
                CHALLENGE
              </Link>
            </div>
          </>
        ) : (
          <div className="text-center py-20 text-white/20 text-sm font-mono">Sin datos disponibles</div>
        )}
      </div>
    </KineticShell>
  );
}
