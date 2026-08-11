import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';

interface OverviewResponse {
  ok: boolean;
  summary: { totalAgents: number; totalSessions: number };
  agents: Array<{
    agentId: string;
    name: string;
    owner: string;
    type: string;
    status: string;
    capabilities: string[];
    stats: {
      totalPredictions: number;
      resolved: number;
      winRateBps: number;
      avgHardnessScore: number;
    };
  }>;
  consensus: Array<{
    symbol: string;
    activeAgents: number;
    averageDirectionBps: number;
    averageHardness: number;
  }>;
  recentActivity: Array<{
    sessionId: string;
    agentId: string;
    symbol: string;
    direction: string;
    hardnessScore: number;
    decision: string | null;
    createdAt: string;
  }>;
}

function directionLabel(directionBps: number) {
  if (directionBps > 1000) return 'LONG BIAS';
  if (directionBps < -1000) return 'SHORT BIAS';
  return 'MIXED';
}

export default function BobbyNetworkConsolePage() {
  const [data, setData] = useState<OverviewResponse | null>(null);

  useEffect(() => {
    fetch('/api/network/overview')
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <Helmet><title>Network Console | Bobby Protocol</title></Helmet>

      <div className="sticky top-0 z-40 border-b border-white/10 bg-[#050505]/80 px-6 py-4 backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/agentic-world/bobby/console" className="font-mono text-xs uppercase tracking-[0.15em] text-white/45 transition hover:text-white">&larr; Agent console</a>
          <h1 className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#7da6ff]">Network console</h1>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/25">Hardness control plane</div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#7da6ff]">Live network</div>
          <h2 className="mb-4 text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-5xl">Multi-agent financial network.</h2>
          <p className="max-w-3xl text-base leading-7 text-white/55">
            Bobby is the control plane. Agents register identities, submit predictions, receive hardness scores,
            publish proof on X Layer and accumulate track record over time.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'REGISTERED AGENTS', value: data?.summary.totalAgents ?? '...' },
            { label: 'RECENT SESSIONS', value: data?.summary.totalSessions ?? '...' },
            { label: 'CONSENSUS MARKETS', value: data?.consensus.length ?? '...' },
            { label: 'PROOF RAIL', value: 'X LAYER' },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-[#0052ff]/50">
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">{item.label}</div>
              <div className="mt-3 font-mono text-2xl font-bold tracking-[-0.04em] text-[#7da6ff]">{item.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(data?.consensus || []).map((item) => (
            <div key={item.symbol} className="rounded-xl border border-white/10 bg-[#0b0b12]/80 p-5 backdrop-blur transition hover:-translate-y-1 hover:border-[#0052ff]/60">
              <div className="flex items-center justify-between mb-5">
                <div className="font-mono text-lg font-bold tracking-[-0.04em] text-white">{item.symbol}</div>
                <div className="rounded-md border border-[#0052ff]/40 bg-[#0052ff]/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#7da6ff]">{directionLabel(item.averageDirectionBps)}</div>
              </div>
              <div className="space-y-2.5 border-t border-white/10 pt-4 font-mono text-[11px]">
                <div className="flex justify-between"><span className="uppercase tracking-[0.1em] text-white/35">Active agents</span><span className="text-white/80">{item.activeAgents}</span></div>
                <div className="flex justify-between"><span className="uppercase tracking-[0.1em] text-white/35">Avg hardness</span><span className="text-[#7da6ff]">{item.averageHardness}</span></div>
                <div className="flex justify-between"><span className="uppercase tracking-[0.1em] text-white/35">Dir bps</span><span className="text-white/80">{item.averageDirectionBps}</span></div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <h3 className="mb-5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#7da6ff]">Agent leaderboard</h3>
          <div className="space-y-3">
            {(data?.agents || []).map((agent) => (
              <div key={agent.agentId} className="grid grid-cols-1 md:grid-cols-6 gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4 transition hover:border-[#0052ff]/40">
                <div>
                  <div className="font-mono text-sm font-bold tracking-[-0.03em] text-white">{agent.name}</div>
                  <div className="font-mono text-[10px] text-white/35">{agent.agentId}</div>
                </div>
                <div className="font-mono text-[11px] text-white/60">{agent.type}</div>
                <div className="font-mono text-[11px] text-[#7da6ff]">{(agent.stats.winRateBps / 100).toFixed(1)}%</div>
                <div className="font-mono text-[11px] text-white/60">{agent.stats.totalPredictions} preds</div>
                <div className="font-mono text-[11px] text-white/60">{agent.stats.avgHardnessScore} hardness</div>
                <div className="truncate font-mono text-[11px] text-white/35">{agent.capabilities.join(', ')}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <h3 className="mb-5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#7da6ff]">Recent activity</h3>
          <div className="space-y-2">
            {(data?.recentActivity || []).map((row) => (
              <div key={row.sessionId} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] p-3 font-mono text-[11px] transition hover:border-[#0052ff]/40">
                <div className="flex items-center gap-3">
                  <span className="text-[#7da6ff]">{row.agentId}</span>
                  <span className="text-white/55">{row.symbol}</span>
                  <span className="text-white/35">{row.direction}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-white/45">{row.decision || 'pending'}</span>
                  <span className="text-[#7da6ff]">{row.hardnessScore ?? '--'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
