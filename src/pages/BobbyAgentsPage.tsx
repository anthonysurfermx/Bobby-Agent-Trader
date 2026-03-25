// ============================================================
// Bobby Agent Leaderboard — Stitch "NEO-TOKYO 2030"
// Agent performance index with real stats from bobby-pnl
// ============================================================

import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import KineticShell from '@/components/kinetic/KineticShell';
import { useTradingRoom } from '@/hooks/useTradingRoom';

export default function BobbyAgentsPage() {
  const { profile, profileId, hasAgent, roomMode, accentColor, accentBg, accentBorder, accentGlow } = useTradingRoom();
  const [summary, setSummary] = useState<any>(null);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentStatus, setAgentStatus] = useState<'ACTIVE' | 'IDLE' | 'OFFLINE'>('IDLE');

  useEffect(() => {
    fetch('/api/bobby-pnl')
      .then(r => r.json())
      .then(d => { if (d.ok) setSummary(d.summary); })
      .catch(() => {})
      .finally(() => setLoading(false));

    const SB = 'https://egpixaunlnzauztbrnuz.supabase.co';
    const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';
    const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
    // Fetch debates: personal if agent exists, global otherwise
    const debateFilter = roomMode === 'personal' && profileId
      ? `scope=eq.private&agent_profile_id=eq.${profileId}`
      : `or=(scope.is.null,scope.eq.public)`;
    fetch(`${SB}/rest/v1/forum_threads?${debateFilter}&order=created_at.desc&limit=10&select=id,symbol,direction,conviction_score,status,created_at`, { headers })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setDecisions(d); })
      .catch(() => {});

    // Check real agent status from latest cycle
    fetch(`${SB}/rest/v1/agent_cycles?status=eq.completed&order=started_at.desc&limit=1&select=started_at`, { headers })
      .then(r => r.json())
      .then((cycles: any[]) => {
        if (!Array.isArray(cycles) || !cycles.length) { setAgentStatus('OFFLINE'); return; }
        const age = Date.now() - new Date(cycles[0].started_at).getTime();
        setAgentStatus(age < 12 * 3600000 ? 'ACTIVE' : age < 24 * 3600000 ? 'IDLE' : 'OFFLINE');
      })
      .catch(() => setAgentStatus('OFFLINE'));
  }, [roomMode, profileId]);

  const s = summary;
  const agentName = profile?.agent_name || (() => { try { return localStorage.getItem('bobby_agent_name') || 'Bobby'; } catch { return 'Bobby'; } })();
  const personality = profile?.personality || 'analytical';
  const cioColor = personality === 'direct'
    ? { color: 'text-orange-400', bgColor: 'border-orange-500/20', glow: 'shadow-[0_0_15px_rgba(249,115,22,0.1)]' }
    : personality === 'wise'
    ? { color: 'text-indigo-400', bgColor: 'border-indigo-500/20', glow: 'shadow-[0_0_15px_rgba(99,102,241,0.1)]' }
    : { color: 'text-yellow-400', bgColor: 'border-yellow-500/20', glow: 'shadow-[0_0_15px_rgba(234,179,8,0.1)]' };

  const agents = [
    {
      rank: '01', name: `${agentName} CIO`, role: 'Final Decision Maker',
      winRate: s ? s.winRate : 0, totalReturn: s ? s.totalReturn : 0,
      trades: s ? s.totalTrades : 0, status: agentStatus,
      ...cioColor,
    },
    {
      rank: '02', name: 'Alpha Hunter', role: 'Opportunity Scanner',
      winRate: null, totalReturn: '--',
      trades: decisions.length, status: agentStatus,
      color: 'text-green-400', bgColor: 'border-green-500/20', glow: '',
    },
    {
      rank: '03', name: 'Red Team', role: 'Thesis Destroyer',
      winRate: null, totalReturn: '--',
      trades: decisions.length, status: agentStatus,
      color: 'text-red-400', bgColor: 'border-red-500/20', glow: '',
    },
  ];

  return (
    <KineticShell activeTab="agents" showSidebar>
      <Helmet><title>Agent Leaderboard | Bobby Agent Trader</title></Helmet>

      <div className="p-6 md:p-8 max-w-7xl mx-auto pb-20">
        {/* Hero Header — Stitch outlined text style */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="font-mono text-[9px] text-green-400/60 tracking-widest">LIVE PERFORMANCE INDEX</span>
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tighter leading-none">
            AGENT <span className="text-white/15">/</span> LEADERBOARD
          </h1>
        </motion.div>

        {loading ? (
          <div className="text-center py-20"><span className="text-[10px] font-mono text-white/20 animate-pulse">LOADING AGENTS...</span></div>
        ) : (
          <>
            {/* Agent Cards */}
            <div className="space-y-3 mb-10">
              {agents.map((agent, i) => (
                <motion.div key={agent.rank} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.1 }}
                  className={`bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] ${agent.bgColor} rounded p-5 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-white/[0.04] transition-all ${agent.glow}`}>
                  <div className="flex items-center gap-5">
                    <span className="text-2xl md:text-3xl font-mono font-black text-white/10">{agent.rank}</span>
                    <div className="relative">
                      <div className={`absolute -z-10 w-20 h-20 rounded-full blur-3xl opacity-20 -left-4 -top-4 ${
                        agent.rank === '01' ? 'bg-amber-500 animate-pulse' : agent.rank === '02' ? 'bg-green-500 animate-pulse' : 'bg-red-500 animate-pulse'
                      }`} style={{ animationDuration: agent.rank === '01' ? '2s' : agent.rank === '02' ? '3s' : '4s' }} />
                      <div className="flex items-center gap-3">
                        <span className={`text-lg md:text-xl font-bold font-mono ${agent.color}`}>{agent.name}</span>
                        <span className={`text-[8px] font-mono px-2 py-0.5 rounded ${
                          agent.status === 'ACTIVE' ? 'bg-green-500/10 text-green-400' : agent.status === 'IDLE' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
                        }`}>{agent.status}</span>
                      </div>
                      <p className="text-[10px] font-mono text-white/25 mt-0.5">{agent.role}</p>
                    </div>
                  </div>
                  <div className="flex gap-6 md:gap-8 font-mono text-right">
                    <div>
                      <span className="text-[8px] text-white/20 block tracking-widest">WIN_RATE</span>
                      <span className="text-lg font-bold text-white/80">{typeof agent.winRate === 'number' ? agent.winRate.toFixed(1) + '%' : '--'}</span>
                    </div>
                    <div>
                      <span className="text-[8px] text-white/20 block tracking-widest">RETURN</span>
                      <span className={`text-lg font-bold ${typeof agent.totalReturn === 'number' ? (agent.totalReturn >= 0 ? 'text-green-400' : 'text-red-400') : 'text-white/20'}`}>
                        {typeof agent.totalReturn === 'number' ? `${agent.totalReturn >= 0 ? '+' : ''}${agent.totalReturn}%` : '--'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[8px] text-white/20 block tracking-widest">TRADES</span>
                      <span className="text-lg font-bold text-white/60">{agent.trades}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Recent Decisions from all agents */}
            {decisions.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
                <h2 className="font-mono text-sm font-black tracking-[0.2em] uppercase mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full" />
                  Recent_Council_Decisions
                </h2>
                <div className="space-y-2">
                  {decisions.slice(0, 8).map((d, i) => {
                    const conv = Math.round((d.conviction_score || 0) * 100);
                    return (
                      <div key={d.id} className="bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] rounded p-4 flex items-center justify-between hover:bg-white/[0.03] transition-all">
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-sm font-bold text-white/80">{d.symbol || '?'}</span>
                          {d.direction && (
                            <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded ${
                              d.direction === 'long' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                            }`}>{d.direction.toUpperCase()}</span>
                          )}
                          <span className={`text-[9px] font-mono ${conv >= 60 ? 'text-green-400' : conv >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                            {conv}%
                          </span>
                          <span className={`text-[8px] font-mono px-2 py-0.5 rounded ${
                            d.status === 'executed' ? 'bg-green-500/10 text-green-400' :
                            d.status === 'rejected' ? 'bg-red-500/10 text-red-400' :
                            'bg-white/5 text-white/30'
                          }`}>{d.status?.toUpperCase() || 'PENDING'}</span>
                        </div>
                        <span className="text-[9px] font-mono text-white/15">
                          {new Date(d.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* System equity */}
            {s && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                className="mt-8 bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] rounded p-6 hover:bg-white/[0.04] transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-mono text-white/30 tracking-widest">SYSTEM_EQUITY</span>
                    <div className="text-3xl font-mono font-black text-green-400 mt-1">${s.currentEquity.toFixed(2)}</div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xl font-mono font-bold ${s.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {s.totalReturn >= 0 ? '+' : ''}{s.totalReturn}%
                    </span>
                    <p className="text-[9px] font-mono text-white/20 mt-1">FROM ${s.startingCapital} INITIAL</p>
                  </div>
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>
    </KineticShell>
  );
}
