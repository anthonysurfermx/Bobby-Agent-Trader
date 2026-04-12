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

      <div className="border-b border-white/[0.04] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/agentic-world/bobby/console" className="text-white/40 hover:text-green-400 transition text-sm font-mono">&larr; AGENT CONSOLE</a>
          <h1 className="text-lg font-mono text-green-400 tracking-wider">NETWORK CONSOLE</h1>
        </div>
        <div className="text-xs font-mono text-white/20">Hardness Control Plane</div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="text-3xl font-black tracking-tight mb-3">Multi-Agent Financial Network</h2>
          <p className="text-white/50 font-mono text-sm max-w-3xl">
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
            <div key={item.label} className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4">
              <div className="text-xs font-mono text-white/30">{item.label}</div>
              <div className="text-2xl font-mono text-green-400 mt-2">{item.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(data?.consensus || []).map((item) => (
            <div key={item.symbol} className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-lg font-mono text-white">{item.symbol}</div>
                <div className="text-[10px] font-mono text-green-400">{directionLabel(item.averageDirectionBps)}</div>
              </div>
              <div className="space-y-2 font-mono text-xs">
                <div className="flex justify-between"><span className="text-white/30">ACTIVE AGENTS</span><span>{item.activeAgents}</span></div>
                <div className="flex justify-between"><span className="text-white/30">AVG HARDNESS</span><span className="text-green-400">{item.averageHardness}</span></div>
                <div className="flex justify-between"><span className="text-white/30">DIR BPS</span><span>{item.averageDirectionBps}</span></div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5">
          <h3 className="font-mono text-xs text-white/40 uppercase tracking-widest mb-4">Agent Leaderboard</h3>
          <div className="space-y-3">
            {(data?.agents || []).map((agent) => (
              <div key={agent.agentId} className="grid grid-cols-1 md:grid-cols-6 gap-3 p-3 bg-white/[0.01] border border-white/[0.03] rounded">
                <div>
                  <div className="text-white font-mono text-sm">{agent.name}</div>
                  <div className="text-[10px] font-mono text-white/30">{agent.agentId}</div>
                </div>
                <div className="text-[11px] font-mono text-white/60">{agent.type}</div>
                <div className="text-[11px] font-mono text-green-400">{(agent.stats.winRateBps / 100).toFixed(1)}%</div>
                <div className="text-[11px] font-mono text-white/60">{agent.stats.totalPredictions} preds</div>
                <div className="text-[11px] font-mono text-white/60">{agent.stats.avgHardnessScore} hardness</div>
                <div className="text-[11px] font-mono text-white/30 truncate">{agent.capabilities.join(', ')}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5">
          <h3 className="font-mono text-xs text-white/40 uppercase tracking-widest mb-4">Recent Activity</h3>
          <div className="space-y-2">
            {(data?.recentActivity || []).map((row) => (
              <div key={row.sessionId} className="flex items-center justify-between p-3 bg-white/[0.01] border border-white/[0.03] rounded font-mono text-[11px]">
                <div className="flex items-center gap-3">
                  <span className="text-green-400">{row.agentId}</span>
                  <span className="text-white/50">{row.symbol}</span>
                  <span className="text-white/30">{row.direction}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-white/40">{row.decision || 'pending'}</span>
                  <span className="text-green-400">{row.hardnessScore ?? '--'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
