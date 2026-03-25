// ============================================================
// Bobby Performance Analytics — Stitch "AGENT_CORE_V4.2"
// Full PnL dashboard: KPIs, cumulative growth, daily alpha,
// council efficiency, live execution ledger
// All data REAL from /api/bobby-pnl
// ============================================================

import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import KineticShell from '@/components/kinetic/KineticShell';

interface PnlData {
  summary: { startingCapital: number; currentEquity: number; totalReturn: number; totalTrades: number; wins: number; losses: number; winRate: number };
  closedPositions: Array<{ symbol: string; direction: string; entryPrice: number; exitPrice: number; realizedPnl: number; pnlPct: number; leverage: string; closeTime: string; result: string }>;
}

export default function BobbyAnalyticsPage() {
  const [pnl, setPnl] = useState<PnlData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/bobby-pnl')
      .then(r => r.json())
      .then(d => { if (d.ok) setPnl(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const s = pnl?.summary;

  // Compute derived stats
  const maxDrawdown = (() => {
    if (!pnl) return 0;
    let peak = pnl.summary.startingCapital;
    let maxDd = 0;
    let cum = pnl.summary.startingCapital;
    for (const t of pnl.closedPositions) {
      cum += t.realizedPnl;
      if (cum > peak) peak = cum;
      if (peak > 0) {
        const dd = ((peak - cum) / peak) * 100;
        if (dd > maxDd) maxDd = dd;
      }
    }
    return Math.min(maxDd, 100); // Cap at 100% — can't lose more than everything
  })();

  const profitFactor = (() => {
    if (!pnl) return 0;
    const gross = pnl.closedPositions.filter(t => t.realizedPnl > 0).reduce((s, t) => s + t.realizedPnl, 0);
    const loss = Math.abs(pnl.closedPositions.filter(t => t.realizedPnl < 0).reduce((s, t) => s + t.realizedPnl, 0));
    return loss > 0 ? gross / loss : 0;
  })();

  // Equity curve data
  const equityData = (() => {
    if (!pnl || !s) return [];
    let cum = s.startingCapital;
    return [
      { label: 'START', equity: s.startingCapital },
      ...pnl.closedPositions.map((t, i) => {
        cum += t.realizedPnl;
        return { label: `#${i + 1}`, equity: cum, symbol: t.symbol, result: t.result, pnl: t.realizedPnl };
      }),
    ];
  })();

  // Daily PnL bars (group by day)
  const dailyPnl = (() => {
    if (!pnl) return [];
    const byDay: Record<string, number> = {};
    for (const t of pnl.closedPositions) {
      const day = new Date(t.closeTime).toISOString().slice(5, 10); // MM-DD
      byDay[day] = (byDay[day] || 0) + t.realizedPnl;
    }
    return Object.entries(byDay).map(([day, pnl]) => ({ day, pnl: parseFloat(pnl.toFixed(4)) }));
  })();

  return (
    <KineticShell activeTab="analytics" showSidebar>
      <Helmet>
        <title>Performance Analytics | Bobby Agent Trader</title>
      </Helmet>

      <div className="p-6 md:p-8 max-w-7xl mx-auto pb-20">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">PERFORMANCE_ANALYTICS</h1>
            <p className="font-mono text-xs text-white/30 mt-1">
              Bobby's $100 Challenge · Real OKX trades · <span className="text-green-400">LIVE</span>
            </p>
          </div>
          <div className="hidden sm:flex gap-4">
            <div className="bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] px-4 py-2 flex flex-col items-end rounded">
              <span className="text-[8px] font-mono text-white/25 mb-1">PROFIT_FACTOR</span>
              <span className={`font-mono text-sm ${profitFactor >= 1 ? 'text-green-400' : 'text-red-400'}`}>{profitFactor.toFixed(2)}</span>
            </div>
            <div className="bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] px-4 py-2 flex flex-col items-end rounded">
              <span className="text-[8px] font-mono text-white/25 mb-1">MAX_DRAWDOWN</span>
              <span className="font-mono text-sm text-red-400">-{maxDrawdown.toFixed(1)}%</span>
            </div>
          </div>
        </motion.div>

        {loading ? (
          <div className="text-center py-20"><span className="text-[10px] font-mono text-white/20 animate-pulse">LOADING ANALYTICS...</span></div>
        ) : s ? (
          <>
            {/* KPI Row — 4 cards */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'TOTAL_RETURN', value: `${s.totalReturn >= 0 ? '+' : ''}${s.totalReturn}%`, color: s.totalReturn >= 0 ? 'text-green-400' : 'text-red-400' },
                { label: 'WIN_RATE', value: `${s.winRate.toFixed(1)}%`, color: 'text-white' },
                { label: 'CURRENT_EQUITY', value: `$${s.currentEquity.toFixed(2)}`, color: 'text-green-400' },
                { label: 'TOTAL_TRADES', value: String(s.totalTrades), color: 'text-white' },
              ].map(kpi => (
                <div key={kpi.label} className="bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] p-6 rounded relative group hover:bg-white/[0.04] transition-all">
                  <div className="absolute top-0 right-0 w-1 h-1 bg-green-500 m-2" />
                  <span className="text-[10px] font-mono text-white/30 tracking-widest uppercase">{kpi.label}</span>
                  <div className={`mt-2 text-2xl md:text-3xl font-mono font-bold tracking-tighter ${kpi.color}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{kpi.value}</div>
                </div>
              ))}
            </motion.div>

            {/* Charts Row: Equity (8/12) + Daily Alpha (4/12) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
              {/* Cumulative Growth */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                className="lg:col-span-8 bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] p-6 rounded">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-mono text-white/30 tracking-widest uppercase">CUMULATIVE_GROWTH_INDEX</span>
                </div>
                <div className="w-full h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={equityData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                      <defs>
                        <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" tick={{ fill: '#6B7280', fontSize: 8, fontFamily: 'monospace' }} axisLine={{ stroke: 'rgba(255,255,255,0.03)' }} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#6B7280', fontSize: 8, fontFamily: 'monospace' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v.toFixed(1)}`} />
                      <ReferenceLine y={s.startingCapital} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                      <Tooltip content={({ active, payload }: any) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-[#161A1D] border border-white/10 rounded px-3 py-2 shadow-xl text-xs font-mono">
                            <p className="text-white/80 font-bold">{d.symbol ? `${d.symbol} ${d.result}` : 'START'}</p>
                            <p className="text-green-400">${d.equity?.toFixed(4)}</p>
                          </div>
                        );
                      }} />
                      <Area type="monotone" dataKey="equity" stroke="#22c55e" strokeWidth={2} fill="url(#pnlGrad)"
                        dot={(props: any) => {
                          const { cx, cy, payload } = props;
                          if (!payload.symbol) return <circle cx={cx} cy={cy} r={2} fill="#6B7280" />;
                          return <circle cx={cx} cy={cy} r={2.5} fill={payload.result === 'WIN' ? '#22c55e' : '#ef4444'} stroke="#050505" strokeWidth={1} />;
                        }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              {/* Daily Alpha Bars */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                className="lg:col-span-4 bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] p-6 rounded flex flex-col">
                <span className="text-[10px] font-mono text-white/30 tracking-widest uppercase mb-4">DAILY_PNL</span>
                <div className="flex-grow">
                  {dailyPnl.length > 0 ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={dailyPnl} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <XAxis dataKey="day" tick={{ fill: '#6B7280', fontSize: 7, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#6B7280', fontSize: 7, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                        <Tooltip content={({ active, payload }: any) => {
                          if (!active || !payload?.[0]) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-[#161A1D] border border-white/10 rounded px-3 py-2 shadow-xl text-xs font-mono">
                              <p className="text-white/60">{d.day}</p>
                              <p className={d.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>{d.pnl >= 0 ? '+' : ''}${d.pnl}</p>
                            </div>
                          );
                        }} />
                        <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
                        <Bar dataKey="pnl" fill="#22c55e" radius={[2, 2, 0, 0]}
                          // @ts-ignore -- recharts accepts this
                          shape={(props: any) => {
                            const { x, y, width, height, payload } = props;
                            const fill = payload.pnl >= 0 ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)';
                            return <rect x={x} y={y} width={width} height={Math.abs(height)} fill={fill} rx={2} />;
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-[9px] font-mono text-white/15">NO DATA</div>
                  )}
                </div>
              </motion.div>
            </div>

            {/* Bottom Row: Council Efficiency + Execution Ledger */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Council Efficiency */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                className="lg:col-span-5 bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] p-6 rounded">
                <span className="text-[10px] font-mono text-white/30 tracking-widest uppercase mb-4 block">COUNCIL_OVERVIEW</span>
                <div className="space-y-4">
                  {[
                    { name: 'BOBBY_CIO', role: 'Final decision maker', color: 'text-green-400', barColor: 'bg-green-500', stat: `${s.winRate.toFixed(1)}% WR` },
                    { name: 'ALPHA_HUNTER', role: 'Opportunity scanner', color: 'text-amber-400', barColor: 'bg-amber-500', stat: `${s.wins} signals` },
                    { name: 'RED_TEAM', role: 'Thesis destroyer', color: 'text-red-400', barColor: 'bg-red-500', stat: `${s.losses} vetoes` },
                  ].map(agent => (
                    <div key={agent.name} className="space-y-1">
                      <div className="flex justify-between font-mono text-[10px]">
                        <span className={agent.color}>{agent.name}</span>
                        <span className="text-white/40">{agent.stat}</span>
                      </div>
                      <p className="text-[8px] font-mono text-white/15">{agent.role}</p>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Live Execution Ledger */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                className="lg:col-span-7 bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] rounded overflow-hidden flex flex-col">
                <div className="p-4 border-b border-white/[0.04] flex justify-between items-center bg-black/40">
                  <span className="text-[10px] font-mono text-white/30 tracking-widest uppercase">LIVE_EXECUTION_LEDGER</span>
                  <span className="font-mono text-[10px] text-green-400 animate-pulse">STREAMING...</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-[10px]">
                    <thead className="bg-[#1c1b1b] text-white/30 sticky top-0">
                      <tr>
                        <th className="p-3 font-normal">TIMESTAMP</th>
                        <th className="p-3 font-normal">SYMBOL</th>
                        <th className="p-3 font-normal">ACTION</th>
                        <th className="p-3 font-normal text-right">ENTRY</th>
                        <th className="p-3 font-normal text-right">PNL</th>
                        <th className="p-3 font-normal">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.02]">
                      {pnl?.closedPositions.slice(0, 8).map((t, i) => (
                        <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                          <td className="p-3 text-white/25">{new Date(t.closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                          <td className="p-3 font-bold text-white/80">{t.symbol}/USD</td>
                          <td className={`p-3 ${t.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>{t.direction.toUpperCase()}</td>
                          <td className="p-3 text-right text-white/60">{t.entryPrice.toFixed(2)}</td>
                          <td className={`p-3 text-right ${t.realizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {t.realizedPnl >= 0 ? '+' : ''}{t.pnlPct.toFixed(1)}%
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold ${
                              t.result === 'WIN' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                            }`}>{t.result === 'WIN' ? 'FILLED' : 'STOPPED'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            </div>
          </>
        ) : (
          <div className="text-center py-20 text-white/20 text-sm font-mono">No analytics data available</div>
        )}
      </div>
    </KineticShell>
  );
}
