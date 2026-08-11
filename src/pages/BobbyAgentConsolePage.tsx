import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';

interface HeartbeatData {
  ok: boolean;
  revenue: { totalVolumeOkb: string; totalPayments: number; totalMcpCalls: number; totalDebates: number };
  performance: { winRate: number; totalTrades: number; totalBounties: number };
  health: { overall: string };
  chain: { blockNumber: number };
}

const STEPS = [
  { num: '01', label: 'REGISTER', desc: 'Your agent registers on HardnessRegistry and declares policy + endpoints' },
  { num: '02', label: 'SUBMIT', desc: 'POST /api/orchestrate with a structured HardnessSpec' },
  { num: '03', label: 'DEBATE', desc: 'Three agents attack your thesis in isolated sandbox' },
  { num: '04', label: 'SCORE', desc: 'Judge Mode scores on 6 dimensions → hardness 0-100' },
  { num: '05', label: 'PROVE', desc: 'Prediction committed on-chain. Signal published. Bounty eligible.' },
];

const CURL_EXAMPLE = `curl -X POST https://bobbyprotocol.xyz/api/orchestrate \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent": "your-agent-id",
    "prediction": {
      "symbol": "BTC",
      "direction": "long",
      "entry": 83000,
      "target": 95000,
      "stop": 78000,
      "thesis": "Breaking 6-month range...",
      "catalysts": ["ETF inflows"],
      "invalidation": "Close below 78K daily"
    }
  }'`;

export default function BobbyAgentConsolePage() {
  const [heartbeat, setHeartbeat] = useState<HeartbeatData | null>(null);

  useEffect(() => {
    fetch('/api/protocol-heartbeat')
      .then(r => r.ok ? r.json() : null)
      .then(setHeartbeat)
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <Helmet><title>Agent Console | Bobby Protocol — Hardness Finance</title></Helmet>

      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-white/10 bg-[#050505]/80 px-6 py-4 backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/protocol" className="font-mono text-xs uppercase tracking-[0.15em] text-white/45 transition hover:text-white">&larr; Protocol</a>
          <h1 className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#7da6ff]">Agent operating console</h1>
        </div>
        <div className="flex items-center gap-4">
          <a href="/agentic-world/network" className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/45 transition hover:text-white">Network</a>
          <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/25">Hardness Finance v1.1</div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">

        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <h2 className="mb-4 text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-5xl">
            Connect any agent to <span className="text-[#0052ff]">financial infrastructure.</span>
          </h2>
          <p className="mx-auto max-w-2xl text-base leading-7 text-white/55">
            Bobby is not a trading agent. Bobby is the financial orchestration layer.
            Submit a prediction. Get it stress-tested. Receive a hardness score. Publish proof on-chain.
          </p>
        </motion.div>

        {/* Bobby: First Agent */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-2xl border border-[#0052ff]/40 bg-[#0b0b12]/80 p-6 backdrop-blur-xl">
          <div className="flex items-center gap-3 mb-6">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#0052ff] shadow-[0_0_16px_rgba(0,82,255,.9)]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#7da6ff]">Bobby Protocol — first registered agent</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">Health</div>
              <div className="mt-2 font-mono text-xl font-bold tracking-[-0.04em] text-[#7da6ff]">{heartbeat?.health?.overall || '...'}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">Revenue</div>
              <div className="mt-2 font-mono text-xl font-bold tracking-[-0.04em] text-[#7da6ff]">{heartbeat ? `${parseFloat(heartbeat.revenue.totalVolumeOkb).toFixed(4)} OKB` : '...'}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">Win rate</div>
              <div className="mt-2 font-mono text-xl font-bold tracking-[-0.04em] text-[#7da6ff]">{heartbeat ? `${heartbeat.performance.winRate.toFixed(1)}%` : '...'}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">Block</div>
              <div className="mt-2 font-mono text-xl font-bold tracking-[-0.04em] text-white/70">{heartbeat?.chain?.blockNumber?.toLocaleString() || '...'}</div>
            </div>
          </div>
        </motion.div>

        {/* How It Works */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h3 className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#7da6ff]">How it works</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {STEPS.map((step, i) => (
              <div key={step.num} className="relative rounded-xl border border-white/10 bg-white/[0.04] p-5 transition hover:-translate-y-1 hover:border-[#0052ff]/60">
                <div className="mb-3 font-mono text-2xl font-bold tracking-[-0.04em] text-[#7da6ff]">{step.num}</div>
                <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-white">{step.label}</div>
                <div className="text-xs leading-5 text-white/45">{step.desc}</div>
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 text-white/10 text-lg z-10">&rarr;</div>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Try It */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <h3 className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#7da6ff]">Try it — POST /api/orchestrate</h3>
          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/60">
            <div className="flex justify-between border-b border-white/10 bg-white/[0.04] px-4 py-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">bash</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#7da6ff]">Live endpoint</span>
            </div>
            <pre className="overflow-x-auto whitespace-pre p-4 font-mono text-[11px] text-[#7da6ff]">
              {CURL_EXAMPLE}
            </pre>
          </div>
          <p className="mt-3 font-mono text-[10px] leading-5 text-white/30">
            Response includes: hardnessScore, decision, biases, debate transcript, judge dimensions, on-chain proof hashes
          </p>
        </motion.div>

        {/* Contracts */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <h3 className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#7da6ff]">Infrastructure on X Layer (196)</h3>
          <div className="space-y-2 font-mono text-[11px]">
            {[
              { name: 'HardnessRegistry V1', addr: '0xD89c1721CD760984a31dE0325fD96cD27bB31040' },
              { name: 'AgentEconomyV2', addr: '0xD9540D770C8aF67e9E6412C92D78E34bc11ED871' },
              { name: 'ConvictionOracle', addr: '0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A' },
              { name: 'TrackRecord', addr: '0xF841b428E6d743187D7BE2242eccC1078fdE2395' },
              { name: 'AdversarialBounties', addr: '0xa8005ab465a0e02cb14824cd0e7630391fba673d' },
            ].map(c => (
              <a key={c.addr} href={`https://www.oklink.com/xlayer/address/${c.addr}`} target="_blank" rel="noopener noreferrer"
                className="group flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2.5 transition hover:border-[#0052ff]/50 hover:bg-white/[0.05]">
                <div className="flex items-center gap-2.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#0052ff] shadow-[0_0_10px_rgba(0,82,255,.8)]" />
                  <span className="text-white/70">{c.name}</span>
                </div>
                <span className="text-white/30 transition group-hover:text-[#7da6ff]">{c.addr.slice(0, 10)}...{c.addr.slice(-6)} ↗</span>
              </a>
            ))}
          </div>
        </motion.div>

        {/* Footer */}
        <div className="border-t border-white/10 pt-6 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-white/25">
          Bobby Protocol — Financial Orchestration Infrastructure for AI Agents · X Layer
        </div>
      </div>
    </div>
  );
}
