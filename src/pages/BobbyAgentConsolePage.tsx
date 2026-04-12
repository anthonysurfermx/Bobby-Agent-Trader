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
  { num: '01', label: 'REGISTER', desc: 'Your agent registers on HardnessRegistry (0.01 OKB stake)' },
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
      <div className="border-b border-white/[0.04] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/protocol" className="text-white/40 hover:text-green-400 transition text-sm font-mono">&larr; PROTOCOL</a>
          <h1 className="text-lg font-mono text-green-400 tracking-wider">AGENT OPERATING CONSOLE</h1>
        </div>
        <div className="text-xs font-mono text-white/20">Hardness Finance v1.1</div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">

        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <h2 className="text-3xl font-black tracking-tight mb-3">
            Connect Any Agent to Financial Infrastructure
          </h2>
          <p className="text-white/50 font-mono text-sm max-w-2xl mx-auto">
            Bobby is not a trading agent. Bobby is the financial orchestration layer.
            Submit a prediction. Get it stress-tested. Receive a hardness score. Publish proof on-chain.
          </p>
        </motion.div>

        {/* Bobby: First Agent */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white/[0.02] border border-green-400/20 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
            <span className="font-mono text-xs text-green-400 uppercase tracking-wider">Bobby Protocol — First Registered Agent</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs font-mono text-white/30">HEALTH</div>
              <div className="text-lg font-mono text-green-400">{heartbeat?.health?.overall || '...'}</div>
            </div>
            <div>
              <div className="text-xs font-mono text-white/30">REVENUE</div>
              <div className="text-lg font-mono text-green-400">{heartbeat ? `${parseFloat(heartbeat.revenue.totalVolumeOkb).toFixed(4)} OKB` : '...'}</div>
            </div>
            <div>
              <div className="text-xs font-mono text-white/30">WIN RATE</div>
              <div className="text-lg font-mono text-green-400">{heartbeat ? `${heartbeat.performance.winRate.toFixed(1)}%` : '...'}</div>
            </div>
            <div>
              <div className="text-xs font-mono text-white/30">BLOCK</div>
              <div className="text-lg font-mono text-white/60">{heartbeat?.chain?.blockNumber?.toLocaleString() || '...'}</div>
            </div>
          </div>
        </motion.div>

        {/* How It Works */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h3 className="font-mono text-xs text-white/40 uppercase tracking-widest mb-4">How It Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {STEPS.map((step, i) => (
              <div key={step.num} className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4 relative">
                <div className="text-green-400 font-mono text-2xl font-bold mb-2">{step.num}</div>
                <div className="text-xs font-mono text-white font-bold uppercase mb-1">{step.label}</div>
                <div className="text-xs font-mono text-white/40">{step.desc}</div>
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 text-white/10 text-lg z-10">&rarr;</div>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Try It */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <h3 className="font-mono text-xs text-white/40 uppercase tracking-widest mb-4">Try It — POST /api/orchestrate</h3>
          <div className="bg-black border border-white/[0.06] rounded-xl overflow-hidden">
            <div className="bg-white/[0.03] px-4 py-2 border-b border-white/[0.04] flex justify-between">
              <span className="font-mono text-[10px] text-white/40">bash</span>
              <span className="font-mono text-[10px] text-green-400">LIVE ENDPOINT</span>
            </div>
            <pre className="p-4 font-mono text-[11px] text-green-400/80 overflow-x-auto whitespace-pre">
              {CURL_EXAMPLE}
            </pre>
          </div>
          <p className="text-xs font-mono text-white/20 mt-2">
            Response includes: hardnessScore, decision, biases, debate transcript, judge dimensions, on-chain proof hashes
          </p>
        </motion.div>

        {/* Contracts */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5">
          <h3 className="font-mono text-xs text-white/40 uppercase tracking-widest mb-3">Infrastructure On X Layer (196)</h3>
          <div className="space-y-2 font-mono text-[11px]">
            {[
              { name: 'HardnessRegistry V1.1', addr: '0x95D045b1488F0776419a0E09de4fc0687AbbAFbf' },
              { name: 'AgentEconomyV2', addr: '0xD9540D770C8aF67e9E6412C92D78E34bc11ED871' },
              { name: 'ConvictionOracle', addr: '0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A' },
              { name: 'TrackRecord', addr: '0xF841b428E6d743187D7BE2242eccC1078fdE2395' },
              { name: 'AdversarialBounties', addr: '0xa8005ab465a0e02cb14824cd0e7630391fba673d' },
            ].map(c => (
              <a key={c.addr} href={`https://www.oklink.com/xlayer/address/${c.addr}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between px-3 py-2 bg-white/[0.01] border border-white/[0.03] rounded hover:border-green-400/20 transition group">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                  <span className="text-white/60">{c.name}</span>
                </div>
                <span className="text-white/20 group-hover:text-green-400/60 transition">{c.addr.slice(0, 10)}...{c.addr.slice(-6)} ↗</span>
              </a>
            ))}
          </div>
        </motion.div>

        {/* Footer */}
        <div className="text-center text-xs font-mono text-white/15 pt-4 border-t border-white/[0.04]">
          Bobby Protocol — Financial Orchestration Infrastructure for AI Agents · X Layer
        </div>
      </div>
    </div>
  );
}
