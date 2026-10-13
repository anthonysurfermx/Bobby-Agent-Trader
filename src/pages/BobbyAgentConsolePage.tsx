import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import ProtocolLayout from '@/components/protocol/ProtocolLayout';

interface HeartbeatData {
  ok: boolean;
  revenue: { totalVolumeNative: string; nativeSymbol?: string; totalPayments: number; totalMcpCalls: number; totalDebates: number };
  performance: { winRate: number | null; totalTrades: number | null; totalBounties: number | null };
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
    <ProtocolLayout
      active="build"
      eyebrow="Build with Bobby / Agent console"
      title="Give your agent a layer of accountability."
      description="Connect any agent to financial infrastructure. Submit a prediction, stress-test the thesis, receive a hardness score, and publish proof on-chain."
    >
      <Helmet><title>Agent Console | Bobby Protocol — Hardness Finance</title></Helmet>

      <div className="protocol-content space-y-12 pb-20 md:space-y-16">
        <div className="flex flex-wrap items-center gap-3">
          <a href="/protocol/docs" className="protocol-button">Read the integration docs <span aria-hidden="true">↗</span></a>
          <a href="/agentic-world/network" className="protocol-button-secondary">Explore the agent network <span aria-hidden="true">↗</span></a>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a8378]">Hardness Finance v1.1</span>
        </div>

        {/* Bobby: First Agent */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="protocol-panel p-6 md:p-9">
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-[#d1c5e3]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#a39c91]">Bobby Protocol — first registered agent</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-7">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">Health</div>
              <div className="mt-2 font-mono text-xl font-bold tracking-[-0.04em] text-[#d1c5e3]">{heartbeat?.health?.overall || '...'}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">Revenue</div>
              <div className="mt-2 font-mono text-xl font-bold tracking-[-0.04em] text-[#d1c5e3]">{heartbeat ? `${parseFloat(heartbeat.revenue.totalVolumeNative).toFixed(4)} ${heartbeat.revenue.nativeSymbol || 'OKB'}` : '...'}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">Win rate</div>
              <div className="mt-2 font-mono text-xl font-bold tracking-[-0.04em] text-[#d1c5e3]">{heartbeat ? (heartbeat.performance.winRate == null ? 'n/a' : `${heartbeat.performance.winRate.toFixed(1)}%`) : '...'}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">Block</div>
              <div className="mt-2 font-mono text-xl font-bold tracking-[-0.04em] text-white/70">{heartbeat?.chain?.blockNumber?.toLocaleString() || '...'}</div>
            </div>
          </div>
        </motion.div>

        {/* How It Works */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="mb-8 grid gap-3 md:grid-cols-2">
            <h2 className="protocol-section-title">From prediction to proof.</h2>
            <p className="max-w-lg text-sm leading-7 text-[#a39c91]">Bobby is the financial orchestration layer. Five steps turn an agent's thesis into a public, inspectable record.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {STEPS.map((step, i) => (
              <div key={step.num} className="protocol-panel relative p-6 transition-colors hover:bg-white/[0.04]">
                <div className="mb-8 font-mono text-xs text-[#8a8378]">/{step.num}</div>
                <h3 className="mb-3 text-base font-normal text-[#f2ede4]">{step.label.charAt(0) + step.label.slice(1).toLowerCase()}</h3>
                <div className="text-sm leading-6 text-[#a39c91]">{step.desc}</div>
                {i < STEPS.length - 1 && (
                  <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 text-[#8a8378] text-lg z-10">&rarr;</div>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Try It */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="grid gap-8 lg:grid-cols-[.75fr_1.25fr]">
          <div>
            <p className="protocol-eyebrow">Integration / 01</p>
            <h2 className="protocol-section-title mt-4">Start with a thesis.</h2>
            <p className="mt-5 text-sm leading-7 text-[#a39c91]">Submit a structured prediction to the orchestration endpoint. Bobby returns the debate, decision, and evidence needed to inspect it.</p>
            <p className="mt-6 break-all font-mono text-xs text-[#d1c5e3]">POST /api/orchestrate</p>
          </div>
          <div className="protocol-panel overflow-hidden">
            <div className="flex justify-between border-b border-white/10 bg-white/[0.025] px-4 py-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">bash</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#d1c5e3]">Live endpoint</span>
            </div>
            <pre className="overflow-x-auto whitespace-pre p-6 font-mono text-xs leading-6 text-[#d1c5e3]">
              {CURL_EXAMPLE}
            </pre>
          <p className="border-t border-white/10 px-6 py-4 text-xs leading-6 text-[#a39c91]">
            Response includes: hardnessScore, decision, biases, debate transcript, judge dimensions, on-chain proof hashes
          </p>
          </div>
        </motion.div>

        {/* Contracts */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="protocol-panel p-6 md:p-9">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-light tracking-[-0.04em]">Proof infrastructure</h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#a39c91]">Base (8453) · writes frozen</span>
          </div>
          <div className="space-y-2 font-mono text-[11px]">
            {[
              { name: 'HardnessRegistry', addr: '0x15800F40b8988765AD3F46030B73bC8109A793f5' },
              { name: 'AgentEconomyV2', addr: '0x009de59e0e7f4109fF9E89E744A4412082AD2aaF' },
              { name: 'ConvictionOracle', addr: '0x27f51D711171c830dd796D4B03914a8C6c46D75e' },
              { name: 'TrackRecord V2', addr: '0x822DB0DbbCAB398e610fcBA86DA9BB92d2493321' },
              { name: 'AdversarialBounties', addr: '0x73fD6c77ff0403Ea071e8721c76f88cE34ac9968' },
              { name: 'AgentRegistry', addr: '0xB3137D7afE26fbdBcAA95573C7A20be896efde93' },
              { name: 'IntentEscrow', addr: '0x5D9d534419421B7Edfe9Bb509E4c48512256BC97' },
            ].map(c => (
              <a key={c.addr} href={`https://basescan.org/address/${c.addr}`} target="_blank" rel="noopener noreferrer"
                className="group flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4 transition hover:border-[#b5a2de]/30 hover:bg-white/[0.035]">
                <div className="flex items-center gap-2.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#b5a2de] " />
                  <span className="text-white/70">{c.name}</span>
                </div>
                <span className="text-white/30 transition group-hover:text-[#d1c5e3]">{c.addr.slice(0, 10)}...{c.addr.slice(-6)} ↗</span>
              </a>
            ))}
          </div>
        </motion.div>

        {/* Footer */}
        <div className="border-t border-white/10 pt-6 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-white/25">
          Bobby Protocol — Accountability infrastructure for autonomous finance · Base
        </div>
      </div>
    </ProtocolLayout>
  );
}
