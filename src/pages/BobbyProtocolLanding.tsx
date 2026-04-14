// ============================================================
// BobbyProtocolLanding — /protocol
// Kinetic Terminal landing page for Bobby Protocol (Build X S2).
// Every number, card, and status pulses from a real endpoint.
// Design: Stitch export "Adversarial Architect" / Kinetic Terminal.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts';
import { useProtocolTxHistory } from '@/hooks/useProtocolTxHistory';

// ---- Types ----

type Price = { symbol: string; price: number; change24h: number };

interface ProtocolStats {
  ok: boolean;
  fetchedAt: string;
  chain: { id: number; blockNumber: number; rpc: string };
  treasury: { address: string; balanceWei: string; balanceOkb: string };
  contracts: {
    agentEconomy: {
      address: string;
      stats: {
        totalDebates: string;
        totalMcpCalls: string;
        totalSignalAccesses: string;
        totalVolumeWei: string;
        totalVolumeOkb: string;
        totalPayments: string;
      };
      lastActivityBlock: number | null;
    };
    convictionOracle: {
      address: string;
      stats: { symbolCount: string };
    };
    trackRecord: {
      address: string;
      stats: { totalTrades: string; totalCommitments: string; winRateBps: string };
    };
    adversarialBounties: {
      address: string;
      verified: boolean;
      minBounty: { minBountyWei: string; minBountyOkb: string };
      nextBountyId: number;
      totalPosted: number;
      lastActivityBlock: number | null;
    };
    hardnessRegistry: {
      address: string;
      agentRegistered: boolean;
      lastActivityBlock: number | null;
    };
    agentRegistry: {
      address: string;
      type: string;
      agents: number;
    };
  };
  protocolTotals: {
    mcpSettlementOkb: string;
    mcpPayments: number;
    bountyEscrowOkb: string;
    bountyCount: number;
    protocolNotionalOkb: string;
    totalInteractions: number;
  };
  bounties: Array<{
    bountyId: string;
    threadHash: string;
    poster: string;
    rewardOkb: string;
    winner: string;
    createdAt: number;
    claimWindowSecs: number;
    effectiveExpiry: number;
    dimension: string;
    status: string;
    challengeCount: number;
  }>;
  bountySummary?: Record<string, {
    totalCount: number;
    openCount: number;
    avgRewardOkb: number | null;
    maxRewardOkb: number | null;
  }>;
  market: {
    prices: Price[];
    regime: unknown;
    xlayer: unknown;
  };
}

interface McpMeta {
  name: string;
  version: string;
  counts?: {
    totalTools: number;
    freeTools: number;
    premiumTools: number;
  };
  pricing: {
    free: string[];
    premium: {
      tools: string[];
      price: string;
      priceWei: string;
      contract: string;
    };
  };
  settlement?: {
    tool: string;
    txHash: string;
    payer: string;
    valueOkb: string;
    blockNumber: number;
    explorerUrl: string | null;
    createdAt: string | null;
  } | null;
}

interface ReputationSummary {
  ok: boolean;
  trustScore?: {
    score?: number;
    philosophy?: string;
  };
}

interface SentinelSummary {
  ok: boolean;
  totalMs: number;
  summary?: {
    calledFreeTools?: number;
    receivedX402Challenge?: boolean;
  };
}

// ---- Helpers ----

const safeFixed = (n: unknown, digits = 2): string => {
  if (n === null || n === undefined) return '—';
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toFixed(digits);
};

const safeSignedFixed = (n: unknown, digits = 2): string => {
  if (n === null || n === undefined) return '—';
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;
};

const truncate = (s: string, head = 6, tail = 4) =>
  !s ? '—' : `${s.slice(0, head)}...${s.slice(-tail)}`;

const formatCountdown = (targetEpoch: number) => {
  const diff = targetEpoch - Math.floor(Date.now() / 1000);
  if (diff <= 0) return 'EXPIRED';
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
};

const DIMENSION_COLOR: Record<string, string> = {
  DATA_INTEGRITY: 'text-[#6dfe9c]',
  ADVERSARIAL_QUALITY: 'text-[#fcc025]',
  DECISION_LOGIC: 'text-white',
  RISK_MANAGEMENT: 'text-[#ff716a]',
  CALIBRATION_ALIGNMENT: 'text-[#6dfe9c]',
  NOVELTY: 'text-[#fcc025]',
};

// Radar chart data: judge dimensions. When we don't have a live verdict,
// we use the 6 dimensions with neutral values (3/5). This is ONLY the
// axis structure — real scores will fill in once /api/judge-mode works.
const JUDGE_AXES = [
  { dim: 'DATA_INTEGRITY', label: 'DATA', value: 0 },
  { dim: 'ADVERSARIAL_QUALITY', label: 'ADVERSARIAL', value: 0 },
  { dim: 'DECISION_LOGIC', label: 'LOGIC', value: 0 },
  { dim: 'RISK_MANAGEMENT', label: 'RISK', value: 0 },
  { dim: 'CALIBRATION_ALIGNMENT', label: 'CALIBRATION', value: 0 },
  { dim: 'NOVELTY', label: 'NOVELTY', value: 0 },
];

// ---- Hooks ----

function useProtocolStats() {
  const [data, setData] = useState<ProtocolStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/bobby-protocol-stats', { cache: 'no-store' });
      if (!res.ok) throw new Error(`stats ${res.status}`);
      const json = (await res.json()) as ProtocolStats;
      setData(json);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const t = setInterval(fetchStats, 30_000);
    return () => clearInterval(t);
  }, [fetchStats]);

  return { data, error, loading, refresh: fetchStats };
}

function useMcpMeta() {
  const [data, setData] = useState<McpMeta | null>(null);
  useEffect(() => {
    fetch('/api/mcp-http', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setData(j as McpMeta))
      .catch(() => setData(null));
  }, []);
  return data;
}

function useReputation() {
  const [data, setData] = useState<ReputationSummary | null>(null);
  useEffect(() => {
    fetch('/api/reputation', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setData(j as ReputationSummary))
      .catch(() => setData(null));
  }, []);
  return data;
}

function useSentinelDemo() {
  const [data, setData] = useState<SentinelSummary | null>(null);
  useEffect(() => {
    fetch('/api/sentinel-demo', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setData(j as SentinelSummary))
      .catch(() => setData(null));
  }, []);
  return data;
}

interface ActivityItem {
  agent: string;
  tool: string;
  paid: boolean;
  amountOkb: string | null;
  txHash: string | null;
  agoSeconds: number | null;
  timestamp: string | null;
  status?: string | null;
  source?: 'commerce' | 'onchain' | 'bounty' | string;
}

function useActivity() {
  const [feed, setFeed] = useState<ActivityItem[]>([]);
  useEffect(() => {
    fetch('/api/activity?limit=100', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setFeed((j as { feed?: ActivityItem[] }).feed ?? []))
      .catch(() => setFeed([]));
    const t = setInterval(() => {
      fetch('/api/activity?limit=100', { cache: 'no-store' })
        .then((r) => r.json())
        .then((j) => setFeed((j as { feed?: ActivityItem[] }).feed ?? []))
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(t);
  }, []);
  return feed;
}

interface LiveTx {
  hash: string;
  contractName: string;
  method: string;
  valueOkb: string;
  timestamp: number | null;
}

function useLiveTxs() {
  const [txs, setTxs] = useState<LiveTx[]>([]);
  useEffect(() => {
    const fetchTxs = () => {
      fetch('/api/protocol-heartbeat', { cache: 'no-store' })
        .then((r) => r.json())
        .then((j: { recentTxs?: LiveTx[] }) => setTxs(j.recentTxs ?? []))
        .catch(() => {});
    };
    fetchTxs();
    const t = setInterval(fetchTxs, 30_000);
    return () => clearInterval(t);
  }, []);
  return txs;
}

// ---- Components ----

function TopTicker({ stats }: { stats: ProtocolStats | null }) {
  const okb = stats?.market.prices.find((p) => p.symbol === 'OKB');
  const btc = stats?.market.prices.find((p) => p.symbol === 'BTC');
  const eth = stats?.market.prices.find((p) => p.symbol === 'ETH');

  const items = [
    okb ? `OKB $${safeFixed(okb.price, 2)} (${safeSignedFixed(okb.change24h, 2)}%)` : 'OKB —',
    btc ? `BTC $${safeFixed(btc.price, 0)}` : 'BTC —',
    eth ? `ETH $${safeFixed(eth.price, 0)}` : 'ETH —',
    stats ? `XLAYER BLOCK #${(stats.chain.blockNumber ?? 0).toLocaleString()}` : 'XLAYER —',
    stats ? `TREASURY ${safeFixed(stats.treasury.balanceOkb, 4)} OKB` : 'TREASURY —',
    stats ? `MCP CALLS SETTLED: ${stats.contracts.agentEconomy.stats.totalMcpCalls ?? '—'}` : 'MCP CALLS —',
    stats ? `DEBATES: ${stats.contracts.agentEconomy.stats.totalDebates ?? '—'}` : 'DEBATES —',
    stats ? `BOUNTIES POSTED: ${stats.contracts.adversarialBounties.totalPosted ?? 0}` : 'BOUNTIES —',
  ];
  const loop = [...items, ...items];
  return (
    <header className="fixed top-0 left-0 right-0 z-[60] h-8 bg-black border-b border-[#6dfe9c]/20 overflow-hidden whitespace-nowrap flex items-center">
      <div className="flex gap-8 px-4 animate-[marquee_40s_linear_infinite]">
        {loop.map((txt, i) => (
          <span
            key={i}
            className="font-mono text-[10px] uppercase tracking-widest text-[#6dfe9c]"
          >
            {txt}
          </span>
        ))}
      </div>
    </header>
  );
}

function Nav() {
  const sections = ['DEBATE', 'LOOP', 'JUDGE', 'WHY', 'BOUNTIES', 'MCP', 'INTEROP', 'CONTRACTS'];
  return (
    <nav className="sticky top-8 w-full flex justify-between items-center px-6 py-4 bg-[#0e0e0e]/80 backdrop-blur-xl z-50 border-b border-[#494847]/15">
      <div className="text-xl font-black text-[#6dfe9c] tracking-tighter uppercase">
        BOBBY_PROTOCOL
      </div>
      <div className="hidden md:flex gap-8">
        {sections.map((s) => (
          <a
            key={s}
            href={`#${s.toLowerCase()}`}
            className="text-[#6dfe9c]/60 hover:text-[#6dfe9c] transition-colors font-bold tracking-tighter uppercase text-sm"
          >
            {s}
          </a>
        ))}
        <a
          href="https://github.com/anthonysurfermx/Bobby-Agent-Trader"
          target="_blank"
          rel="noreferrer"
          className="text-[#6dfe9c]/60 hover:text-[#6dfe9c] transition-colors font-bold tracking-tighter uppercase text-sm"
        >
          GITHUB
        </a>
        <a
          href="/protocol/console"
          className="text-[#6dfe9c]/60 hover:text-[#6dfe9c] transition-colors font-bold tracking-tighter uppercase text-sm"
        >
          CONSOLE
        </a>
        <a
          href="/protocol/harness"
          className="text-[#fcc025]/60 hover:text-[#fcc025] transition-colors font-bold tracking-tighter uppercase text-sm"
        >
          HARNESS
        </a>
      </div>
      <div className="flex gap-3">
        <a
          href="/protocol/heartbeat"
          className="flex items-center gap-2 bg-[#6dfe9c]/5 text-[#6dfe9c] px-4 py-2 font-bold tracking-tighter uppercase text-sm border border-[#6dfe9c]/20 hover:bg-[#6dfe9c]/15 transition-all"
        >
          <span className="w-2 h-2 bg-[#6dfe9c] rounded-full animate-pulse" />
          _HEARTBEAT
        </a>
        <a
          href="/submission"
          className="bg-[#fcc025]/10 text-[#fcc025] px-4 py-2 font-bold tracking-tighter uppercase text-sm border border-[#fcc025]/30 hover:bg-[#fcc025]/20 transition-all"
        >
          _SUBMISSION
        </a>
        <a
          href="/agentic-world/bobby"
          className="bg-[#6dfe9c]/10 text-[#6dfe9c] px-4 py-2 font-bold tracking-tighter uppercase text-sm border border-[#6dfe9c]/30 hover:bg-[#6dfe9c]/20 transition-all"
        >
          _OPEN_TERMINAL
        </a>
      </div>
    </nav>
  );
}

function HeroLiveDebate({ stats }: { stats: ProtocolStats | null }) {
  const okb = stats?.market.prices.find((p) => p.symbol === 'OKB');
  const btc = stats?.market.prices.find((p) => p.symbol === 'BTC');
  const eth = stats?.market.prices.find((p) => p.symbol === 'ETH');
  const regime = typeof stats?.market.regime === 'string' ? (stats.market.regime as string) : '…';

  return (
    <section className="relative min-h-[85vh] flex flex-col items-center justify-center pt-24 pb-16 px-6 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#6dfe9c]/5 to-transparent pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap justify-center gap-3 mb-8"
      >
        <span className="px-3 py-1 bg-[#262626] border border-[#6dfe9c]/20 text-[#6dfe9c] font-mono text-[10px] tracking-widest">
          [HARDNESS FINANCE]
        </span>
        <span className="px-3 py-1 bg-[#262626] border border-[#fcc025]/20 text-[#fcc025] font-mono text-[10px] tracking-widest">
          [ADAPTIVE CONTROL PLANE]
        </span>
        <span className="px-3 py-1 bg-[#262626] border border-[#ff716a]/20 text-[#ff716a] font-mono text-[10px] tracking-widest">
          [FINANCIAL MEMORY + TRUST]
        </span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-5xl md:text-7xl lg:text-8xl font-black tracking-[-0.04em] text-center max-w-5xl leading-none uppercase mb-6"
      >
        The Harness Layer for{' '}
        <span className="text-[#6dfe9c] italic">Agent</span> Finance
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="font-mono text-[11px] text-[#adaaaa] uppercase tracking-widest mb-10 text-center max-w-2xl"
      >
        Every financial decision becomes reusable intelligence. Bobby debates, judges, blocks, remembers, and adapts — so the next verdict is sharper than the last.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3 }}
        className="w-full max-w-4xl bg-black border border-[#494847]/30 shadow-[0_0_40px_rgba(109,254,156,0.04)] relative overflow-hidden"
      >
        <div className="flex items-center justify-between bg-[#131313] px-4 py-2 border-b border-[#494847]/20">
          <div className="flex gap-2">
            <div className="w-2 h-2 bg-[#ff716a]" />
            <div className="w-2 h-2 bg-[#fcc025]" />
            <div className="w-2 h-2 bg-[#6dfe9c]" />
          </div>
          <div className="font-mono text-[10px] text-[#adaaaa] tracking-widest uppercase">
            LIVE_MARKET_FEED // {regime.slice(0, 50) || 'AWAITING_REGIME'}
          </div>
        </div>

        <div className="p-6 font-mono text-xs space-y-3">
          <div className="flex gap-3 items-start">
            <span className="text-[#6dfe9c] shrink-0 w-20">[OKB]</span>
            <span className="text-[#6dfe9c]/90 flex-1">
              {okb
                ? `$${safeFixed(okb.price, 2)}  ${safeSignedFixed(okb.change24h, 2)}%`
                : 'awaiting intel...'}
            </span>
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-[#6dfe9c] shrink-0 w-20">[BTC]</span>
            <span className="text-[#6dfe9c]/90 flex-1">
              {btc
                ? `$${safeFixed(btc.price, 0)}  ${safeSignedFixed(btc.change24h, 2)}%`
                : 'awaiting intel...'}
            </span>
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-[#6dfe9c] shrink-0 w-20">[ETH]</span>
            <span className="text-[#6dfe9c]/90 flex-1">
              {eth
                ? `$${safeFixed(eth.price, 0)}  ${safeSignedFixed(eth.change24h, 2)}%`
                : 'awaiting intel...'}
            </span>
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-[#fcc025] shrink-0 w-20">[XLAYER]</span>
            <span className="text-[#fcc025]/90 flex-1">
              {stats
                ? `BLOCK #${stats.chain.blockNumber.toLocaleString()}  ·  TREASURY ${safeFixed(stats.treasury.balanceOkb, 4)} OKB`
                : 'awaiting rpc...'}
            </span>
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-white/70 shrink-0 w-20">[ECONOMY]</span>
            <span className="text-white/70 flex-1">
              {stats
                ? `${stats.contracts.agentEconomy.stats.totalDebates} debates  ·  ${stats.contracts.agentEconomy.stats.totalMcpCalls} mcp calls  ·  ${safeFixed(stats.contracts.agentEconomy.stats.totalVolumeOkb, 4)} OKB settled`
                : 'awaiting economy...'}
            </span>
          </div>

          <div className="mt-6 border-t border-[#494847]/15 pt-3 flex items-center justify-between font-mono text-[10px] tracking-widest uppercase">
            <span className="font-bold text-[#6dfe9c]">
              {stats ? 'FEED_LIVE' : 'CONNECTING'}
            </span>
            <span className="text-[#adaaaa]">
              {stats ? new Date(stats.fetchedAt).toLocaleTimeString() : '—'}
            </span>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="w-full max-w-4xl mt-10"
      >
        <div className="font-mono text-[10px] text-[#adaaaa] uppercase tracking-widest text-center mb-4">
          SELECT_INTERFACE //
        </div>
        <div className="grid grid-cols-2 gap-4">
          <a
            href="/agentic-world/bobby"
            className="group relative bg-[#131313] border border-[#6dfe9c]/20 hover:border-[#6dfe9c]/60 p-6 md:p-8 transition-all overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#6dfe9c]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <div className="text-[#6dfe9c] font-mono text-[10px] tracking-widest mb-3">
                HUMAN_INTERFACE
              </div>
              <div className="text-2xl md:text-3xl font-black tracking-tighter uppercase mb-3">
                I'm Human
              </div>
              <p className="text-[#adaaaa] text-xs leading-5 mb-4 font-mono">
                Open the live terminal. Chat with Bobby, watch debates,
                track the $100 challenge, analyze 70+ signals.
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {['TERMINAL', 'CHALLENGE', 'SIGNALS', 'ANALYTICS'].map((t) => (
                  <span key={t} className="px-2 py-0.5 bg-[#6dfe9c]/10 border border-[#6dfe9c]/20 text-[#6dfe9c] font-mono text-[8px] tracking-wider">
                    {t}
                  </span>
                ))}
              </div>
              <div className="text-[#6dfe9c] font-bold text-sm uppercase tracking-tighter">
                _OPEN_TERMINAL →
              </div>
            </div>
          </a>

          <a
            href="#interop"
            className="group relative bg-[#131313] border border-[#fcc025]/20 hover:border-[#fcc025]/60 p-6 md:p-8 transition-all overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#fcc025]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <div className="text-[#fcc025] font-mono text-[10px] tracking-widest mb-3">
                AGENT_INTERFACE
              </div>
              <div className="text-2xl md:text-3xl font-black tracking-tighter uppercase mb-3">
                I'm an Agent
              </div>
              <p className="text-[#adaaaa] text-xs leading-5 mb-4 font-mono">
                Download skill.md, call 17 MCP tools, pay via x402,
                check reputation, inspect registry, post adversarial bounties.
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {['SKILL.MD', 'MCP', 'x402', 'BOUNTIES'].map((t) => (
                  <span key={t} className="px-2 py-0.5 bg-[#fcc025]/10 border border-[#fcc025]/20 text-[#fcc025] font-mono text-[8px] tracking-wider">
                    {t}
                  </span>
                ))}
              </div>
              <div className="text-[#fcc025] font-bold text-sm uppercase tracking-tighter">
                _START_INTEGRATING →
              </div>
            </div>
          </a>
        </div>
      </motion.div>
    </section>
  );
}

function ClosedLoop() {
  const steps = [
    { title: 'SIGNAL', glyph: '>', desc: 'Raw signal enters the hardness chamber', color: '#6dfe9c' },
    { title: 'PRESSURE', glyph: '><', desc: 'Thesis compressed under adversarial load', color: '#fcc025' },
    { title: 'FRACTURE TEST', glyph: ':::', desc: '3 agents try to break the thesis', color: '#ff716a' },
    { title: 'GRADE', glyph: '[!]', desc: '6-dimension hardness score', color: '#6dfe9c' },
    { title: 'GATE', glyph: '$?', desc: 'Pass → execute. Low conviction → park in yield. Fail → blocked.', color: '#fcc025' },
    { title: 'PROOF', glyph: '=X=', desc: 'On-chain record: trade, park, or block — all committed', color: '#6dfe9c' },
  ];

  return (
    <section id="loop" className="py-24 px-6 max-w-7xl mx-auto">
      <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase mb-10 border-l-4 border-[#fcc025] pl-6">
        The Harness Process
      </h2>

      <div className="grid gap-4 lg:grid-cols-6">
        {steps.map((step, index) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.05 }}
            className="relative bg-[#131313] border border-[#494847]/15 p-5 hover:border-[#6dfe9c]/30 transition-all"
          >
            <div
              className="mb-3 font-mono text-2xl font-bold"
              style={{ color: step.color }}
            >
              {step.glyph}
            </div>
            <h3 className="font-mono text-[11px] uppercase tracking-widest mb-2" style={{ color: step.color }}>
              {step.title}
            </h3>
            <p className="font-mono text-[10px] text-[#adaaaa]">{step.desc}</p>
            {index < steps.length - 1 && (
              <div className="hidden lg:block absolute -right-2 top-6 text-[#6dfe9c]/45 font-mono text-lg">
                →
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function JudgeMode({ stats }: { stats: ProtocolStats | null }) {
  const oracle = stats?.contracts.convictionOracle.stats;
  const tr = stats?.contracts.trackRecord.stats;
  const [judgeScores, setJudgeScores] = useState<Record<string, number> | null>(null);

  // Fetch latest debate quality scores from Supabase
  useEffect(() => {
    const SB = 'https://egpixaunlnzauztbrnuz.supabase.co';
    const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';
    fetch(`${SB}/rest/v1/forum_threads?debate_quality=not.is.null&order=created_at.desc&limit=5&select=debate_quality`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    })
      .then(r => r.json())
      .then((rows: Array<{ debate_quality: any }>) => {
        if (!rows?.length) return;
        // Average across recent debates
        const dims: Record<string, number[]> = {};
        for (const row of rows) {
          const dq = row.debate_quality;
          if (!dq) continue;
          // Support 6-dim judge-mode format
          if (dq.dimensions) {
            for (const [k, v] of Object.entries(dq.dimensions)) {
              (dims[k] ??= []).push(Number(v) || 0);
            }
          } else {
            // Map old 5-dim format to 6-dim
            if (dq.data_citation != null) (dims['data_integrity'] ??= []).push(Number(dq.data_citation));
            if (dq.red_team_rigor != null) (dims['adversarial_quality'] ??= []).push(Number(dq.red_team_rigor));
            if (dq.actionability != null) (dims['decision_logic'] ??= []).push(Number(dq.actionability));
            if (dq.specificity != null) (dims['risk_management'] ??= []).push(Number(dq.specificity));
            if (dq.overall != null) (dims['calibration_alignment'] ??= []).push(Number(dq.overall));
            if (dq.novel_insight != null) (dims['novelty'] ??= []).push(Number(dq.novel_insight));
          }
        }
        const avg: Record<string, number> = {};
        for (const [k, vals] of Object.entries(dims)) {
          avg[k] = vals.reduce((a, b) => a + b, 0) / vals.length;
        }
        if (Object.keys(avg).length > 0) setJudgeScores(avg);
      })
      .catch(() => {});
  }, []);

  const winRateBps = tr ? Number(tr.winRateBps) : 0;
  const winRatePct = winRateBps / 100;

  const radarData = JUDGE_AXES.map((axis) => ({
    dim: axis.label,
    value: judgeScores
      ? Math.min(5, Math.max(0, judgeScores[axis.dim.toLowerCase()] || 0))
      : 0,
  }));

  return (
    <section
      id="judge"
      className="py-24 px-6 bg-[#131313] border-y border-[#494847]/15"
    >
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="aspect-square max-w-md mx-auto w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="75%">
              <PolarGrid stroke="#6dfe9c" strokeOpacity={0.2} />
              <PolarAngleAxis
                dataKey="dim"
                tick={{ fill: '#6dfe9c', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              />
              <PolarRadiusAxis angle={90} domain={[0, 5]} tick={false} axisLine={false} />
              <Radar
                dataKey="value"
                stroke="#6dfe9c"
                fill="#6dfe9c"
                fillOpacity={0.25}
              />
            </RadarChart>
          </ResponsiveContainer>
        </motion.div>

        <div>
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-3xl md:text-4xl font-black tracking-tighter uppercase mb-6"
          >
            Judge Mode: On-Chain Audit
          </motion.h2>
          <p className="text-[#adaaaa] uppercase font-mono text-xs tracking-widest mb-8">
            Data / Adversarial / Logic / Risk / Calibration / Novelty
          </p>

          <div className="flex items-baseline gap-4 mb-8">
            <span className="text-7xl font-black text-[#6dfe9c] font-mono tracking-tighter">
              {tr ? safeFixed(winRatePct, 0) : '—'}
            </span>
            <span className="text-sm font-bold text-[#adaaaa] uppercase">
              / 100 ON_CHAIN_WIN_RATE
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8 font-mono text-[11px]">
            <div className="bg-black p-4 border border-[#494847]/15">
              <div className="text-[#adaaaa] uppercase mb-1">Commitments</div>
              <div className="text-[#6dfe9c] text-2xl">
                {tr?.totalCommitments ?? '—'}
              </div>
            </div>
            <div className="bg-black p-4 border border-[#494847]/15">
              <div className="text-[#adaaaa] uppercase mb-1">Revealed_Trades</div>
              <div className="text-[#6dfe9c] text-2xl">
                {tr?.totalTrades ?? '—'}
              </div>
            </div>
            <div className="bg-black p-4 border border-[#494847]/15">
              <div className="text-[#adaaaa] uppercase mb-1">Oracle_Symbols</div>
              <div className="text-[#6dfe9c] text-2xl">
                {oracle?.symbolCount ?? '—'}
              </div>
            </div>
            <div className="bg-black p-4 border border-[#494847]/15">
              <div className="text-[#adaaaa] uppercase mb-1">Oracle_Address</div>
              <div className="text-[#6dfe9c] text-xs break-all">
                {stats
                  ? truncate(stats.contracts.convictionOracle.address, 10, 6)
                  : '—'}
              </div>
            </div>
          </div>

          <a
            className="inline-block border border-[#6dfe9c]/30 text-[#6dfe9c] px-4 py-2 text-xs font-bold uppercase tracking-tighter hover:bg-[#6dfe9c]/10"
            href={`https://www.oklink.com/xlayer/address/${stats?.contracts.convictionOracle.address}`}
            target="_blank"
            rel="noreferrer"
          >
            _VIEW_ORACLE_ON_OKLINK
          </a>
        </div>
      </div>
    </section>
  );
}

function WhyMatters() {
  const pillars = [
    {
      glyph: '!ERR',
      label: 'THE PROBLEM',
      color: 'text-[#fcc025]',
      borderHover: 'hover:border-[#fcc025]/30',
      body: 'Agents execute billions with zero memory and zero accountability. Every new agent starts from scratch.',
    },
    {
      glyph: '>>>=',
      label: 'TRACES → MEMORY → VERDICTS',
      color: 'text-[#6dfe9c]',
      borderHover: 'hover:border-[#6dfe9c]/30',
      body: 'Every cycle traces. Every trace distills. Every memory sharpens the next verdict.',
    },
    {
      glyph: '[!!]',
      label: 'TRUST IS EARNED ON-CHAIN',
      color: 'text-white',
      borderHover: 'hover:border-white/20',
      body: 'Trust score from win rate, commitments, bounties, payments. No configs. Verifiable.',
    },
    {
      glyph: '><>',
      label: 'ADAPTS TO YOUR OPERATION',
      color: 'text-[#6dfe9c]',
      borderHover: 'hover:border-[#6dfe9c]/30',
      body: 'Bobby learns your risk tolerance, sizing, regime preferences. The more you use it, the harder it is to replace.',
    },
  ];

  return (
    <section id="why" className="py-24 px-6 bg-[#131313] border-y border-[#494847]/15">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase mb-4">
            Not the Car. The Road.
          </h2>
          <p className="font-mono text-sm text-[#6dfe9c] tracking-wide max-w-3xl">
            Frameworks are cheap. Bobby is the memory, trust, and control layer that makes them matter.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-4">
          {pillars.map((item, index) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.07 }}
              className={`bg-black border border-[#494847]/15 p-6 ${item.borderHover} transition-all`}
            >
              <div className="flex items-center gap-3 mb-4">
                <span className={`font-mono text-lg font-bold ${item.color}`}>
                  {item.glyph}
                </span>
                <span className={`font-mono text-[10px] uppercase tracking-widest ${item.color}`}>
                  {item.label}
                </span>
              </div>
              <p className="text-sm leading-6 text-[#adaaaa]">{item.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Flywheels() {
  const wheels = [
    {
      label: 'DATA',
      icon: '>',
      color: '#6dfe9c',
      input: 'Every interaction',
      output: 'Structured traces',
      accumulates: 'Decision history',
    },
    {
      label: 'MEMORY',
      icon: '><',
      color: '#fcc025',
      input: 'Every trace',
      output: 'Episodes + priors',
      accumulates: 'Reusable intelligence',
    },
    {
      label: 'TRUST',
      icon: '!!',
      color: '#60a5fa',
      input: 'Every payment + challenge',
      output: 'Reputation scores',
      accumulates: 'Verifiable trust',
    },
    {
      label: 'POLICY',
      icon: '##',
      color: '#ff716a',
      input: 'Every override + block',
      output: 'Refined guardrails',
      accumulates: 'Adaptive controls',
    },
    {
      label: 'ENTANGLEMENT',
      icon: '<>',
      color: '#c084fc',
      input: 'Every workflow pattern',
      output: 'Custom adaptation',
      accumulates: 'Switching cost',
    },
  ];

  return (
    <section className="py-24 px-6 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-10"
      >
        <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase mb-3 border-l-4 border-[#c084fc] pl-6">
          Five Flywheels. One Moat.
        </h2>
        <p className="font-mono text-sm text-[#adaaaa] max-w-3xl pl-6">
          You can vibe-code an agent in a weekend. You can't vibe-code accumulated memory.
        </p>
      </motion.div>

      <div className="grid gap-3 md:grid-cols-5">
        {wheels.map((w, i) => (
          <motion.div
            key={w.label}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4 hover:border-white/[0.08] transition-colors relative overflow-hidden"
          >
            <div className="flex items-center gap-2 mb-3">
              <span
                className="font-mono text-sm font-bold w-7 h-7 flex items-center justify-center rounded border"
                style={{ color: w.color, borderColor: `${w.color}33` }}
              >
                {w.icon}
              </span>
              <span className="font-black text-xs uppercase tracking-tight text-white">{w.label}</span>
            </div>
            <div className="space-y-2 font-mono text-[10px]">
              <div>
                <span className="text-[#adaaaa]">IN: </span>
                <span className="text-white/70">{w.input}</span>
              </div>
              <div>
                <span className="text-[#adaaaa]">OUT: </span>
                <span style={{ color: w.color }}>{w.output}</span>
              </div>
              <div className="border-t border-white/[0.04] pt-2 mt-2">
                <span className="text-[#adaaaa]">COMPOUNDS: </span>
                <span className="text-white/50">{w.accumulates}</span>
              </div>
            </div>
            <div
              className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.04] blur-xl"
              style={{ backgroundColor: w.color }}
            />
          </motion.div>
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="mt-6 font-mono text-[11px] text-center text-[#adaaaa]/60"
      >
        trace → distill → store memory → retrieve fragments → inject → adaptive verdict → trace
      </motion.p>
    </section>
  );
}

function HarnessArchitecture() {
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [flowStep, setFlowStep] = useState(0);

  // Auto-cycle through flow steps
  useEffect(() => {
    const timer = setInterval(() => {
      setFlowStep(prev => (prev + 1) % 5);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const nodes = [
    {
      id: 'tools',
      label: 'TOOLS',
      sub: '+ MCP / x402',
      icon: '[ ]',
      position: 'top',
      description: '17 MCP tools over Streamable HTTP. Any agent calls Bobby via JSON-RPC. Free analytics, bounty calldata builders, and premium tools gated by x402 on-chain payment.',
      details: ['bobby_analyze', 'bobby_debate', 'bobby_judge', 'bobby_ta', 'bobby_intel', '+12 more'],
      color: '#6dfe9c',
    },
    {
      id: 'session',
      label: 'SESSION',
      sub: 'On-chain State',
      icon: '>>',
      position: 'left',
      description: 'Persistent on-chain state. Every prediction, signal, payment, and bounty is immutable. The memory of the harness.',
      details: ['TrackRecord', 'ConvictionOracle', 'AgentStats', 'Commerce Log'],
      color: '#6dfe9c',
    },
    {
      id: 'harness',
      label: 'HARNESS',
      sub: 'HardnessRegistry',
      icon: '***',
      position: 'center',
      description: 'The coordinator. Registers agents, coordinates services, records predictions, publishes signals, manages bounties. Does not trade — ensures quality.',
      details: ['0xD89c...1040', 'X Layer (196)', '5 modules', '2-of-3 resolvers'],
      color: '#fcc025',
    },
    {
      id: 'sandbox',
      label: 'SANDBOX',
      sub: 'Debate Chamber',
      icon: '>_',
      position: 'right',
      description: 'Isolated adversarial testing. Three agents attack the thesis from different angles. Nothing leaves without being pressure-tested.',
      details: ['Alpha Hunter', 'Red Team', 'CIO', 'Judge Mode'],
      color: '#6dfe9c',
    },
    {
      id: 'orchestration',
      label: 'ORCHESTRATION',
      sub: 'Cycle Engine',
      icon: '<>',
      position: 'bottom',
      description: 'The autonomous loop. Every 8 hours: signal → debate → judge → commit → execute → prove. The heartbeat of hardness finance.',
      details: ['Signal Ingest', 'Debate Cycle', 'Risk Gate', 'On-chain Prove'],
      color: '#6dfe9c',
    },
  ];

  const flowLabels = [
    'Signal enters the harness',
    'Thesis enters the sandbox for pressure testing',
    'Hardened conviction stored in session',
    'Tools expose conviction to external agents',
    'Orchestration loops back for next cycle',
  ];

  // Flow connections: which nodes are highlighted per step
  const flowConnections: Record<number, string[]> = {
    0: ['orchestration', 'harness'],
    1: ['harness', 'sandbox'],
    2: ['sandbox', 'session'],
    3: ['session', 'tools'],
    4: ['tools', 'orchestration'],
  };

  const activeConnections = flowConnections[flowStep] || [];

  return (
    <section id="architecture" className="py-24 px-6 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase mb-2 text-center">
          The Trading Harness
        </h2>
        <p className="text-center text-[#adaaaa] font-mono text-xs uppercase tracking-widest mb-4">
          Inspired by Claude Code's architecture. Built for agent finance.
        </p>

        {/* Flow status bar */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#131313] border border-[#494847]/30">
            <span className="w-2 h-2 bg-[#6dfe9c] rounded-full animate-pulse" />
            <span className="font-mono text-[11px] text-[#6dfe9c]">
              {flowLabels[flowStep]}
            </span>
          </div>
          <div className="flex justify-center gap-1 mt-3">
            {flowLabels.map((_, i) => (
              <button
                key={i}
                onClick={() => setFlowStep(i)}
                className={`w-8 h-1 transition-all ${i === flowStep ? 'bg-[#6dfe9c]' : 'bg-[#494847]/30'}`}
              />
            ))}
          </div>
        </div>

        {/* Architecture diagram */}
        <div className="relative max-w-3xl mx-auto">
          {/* Connection lines (CSS) */}
          <div className="hidden md:block absolute inset-0 pointer-events-none">
            {/* Top to center */}
            <div className={`absolute left-1/2 top-0 w-px h-[calc(50%-80px)] transition-all duration-700 ${
              activeConnections.includes('tools') && activeConnections.includes('harness')
                ? 'bg-[#6dfe9c] shadow-[0_0_8px_#6dfe9c]'
                : activeConnections.includes('tools') || activeConnections.includes('harness')
                ? 'bg-[#494847]/60'
                : 'bg-[#494847]/20'
            }`} style={{ transform: 'translateX(-50%)', top: '160px', height: '80px' }} />
            {/* Center to bottom */}
            <div className={`absolute left-1/2 w-px transition-all duration-700 ${
              activeConnections.includes('orchestration') && activeConnections.includes('harness')
                ? 'bg-[#6dfe9c] shadow-[0_0_8px_#6dfe9c]'
                : activeConnections.includes('orchestration') || activeConnections.includes('harness')
                ? 'bg-[#494847]/60'
                : 'bg-[#494847]/20'
            }`} style={{ transform: 'translateX(-50%)', bottom: '160px', height: '80px' }} />
            {/* Left to center */}
            <div className={`absolute top-1/2 h-px transition-all duration-700 ${
              activeConnections.includes('session') && activeConnections.includes('harness')
                ? 'bg-[#6dfe9c] shadow-[0_0_8px_#6dfe9c]'
                : activeConnections.includes('session')
                ? 'bg-[#494847]/60'
                : 'bg-[#494847]/20'
            }`} style={{ transform: 'translateY(-50%)', left: 'calc(16.67% + 80px)', width: 'calc(33.33% - 80px)' }} />
            {/* Center to right */}
            <div className={`absolute top-1/2 h-px transition-all duration-700 ${
              activeConnections.includes('sandbox') && activeConnections.includes('harness')
                ? 'bg-[#6dfe9c] shadow-[0_0_8px_#6dfe9c]'
                : activeConnections.includes('sandbox')
                ? 'bg-[#494847]/60'
                : 'bg-[#494847]/20'
            }`} style={{ transform: 'translateY(-50%)', right: 'calc(16.67% + 80px)', width: 'calc(33.33% - 80px)' }} />
          </div>

          {/* Grid layout matching Claude's diagram */}
          <div className="grid grid-cols-3 gap-4 md:gap-6" style={{ gridTemplateRows: 'auto auto auto' }}>
            {/* Row 1: Tools (center top) */}
            <div className="col-start-2">
              <NodeCard
                node={nodes[0]}
                isActive={activeConnections.includes('tools')}
                isHovered={activeNode === 'tools'}
                onHover={setActiveNode}
              />
            </div>

            {/* Row 2: Session | Harness | Sandbox */}
            <div>
              <NodeCard
                node={nodes[1]}
                isActive={activeConnections.includes('session')}
                isHovered={activeNode === 'session'}
                onHover={setActiveNode}
              />
            </div>
            <div>
              <NodeCard
                node={nodes[2]}
                isActive={activeConnections.includes('harness')}
                isHovered={activeNode === 'harness'}
                onHover={setActiveNode}
                isCenter
              />
            </div>
            <div>
              <NodeCard
                node={nodes[3]}
                isActive={activeConnections.includes('sandbox')}
                isHovered={activeNode === 'sandbox'}
                onHover={setActiveNode}
              />
            </div>

            {/* Row 3: Orchestration (center bottom) */}
            <div className="col-start-2">
              <NodeCard
                node={nodes[4]}
                isActive={activeConnections.includes('orchestration')}
                isHovered={activeNode === 'orchestration'}
                onHover={setActiveNode}
              />
            </div>
          </div>
        </div>

        {/* Detail panel */}
        <motion.div
          key={activeNode || 'default'}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 max-w-2xl mx-auto"
        >
          {activeNode ? (
            <div className="bg-[#131313] border border-[#494847]/30 p-5">
              <div className="font-mono text-[10px] text-[#6dfe9c] uppercase tracking-widest mb-2">
                {nodes.find(n => n.id === activeNode)?.label}
              </div>
              <p className="text-sm text-[#adaaaa] mb-3">
                {nodes.find(n => n.id === activeNode)?.description}
              </p>
              <div className="flex flex-wrap gap-2">
                {nodes.find(n => n.id === activeNode)?.details.map(d => (
                  <span key={d} className="font-mono text-[10px] px-2 py-1 bg-[#6dfe9c]/10 text-[#6dfe9c] border border-[#6dfe9c]/20">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center font-mono text-[11px] text-[#adaaaa]/40">
              hover a node to see details
            </div>
          )}
        </motion.div>
      </motion.div>
    </section>
  );
}

function NodeCard({
  node,
  isActive,
  isHovered,
  onHover,
  isCenter = false,
}: {
  node: { id: string; label: string; sub: string; icon: string; color: string };
  isActive: boolean;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  isCenter?: boolean;
}) {
  const borderColor = isActive
    ? node.color
    : isHovered
    ? `${node.color}60`
    : '#494847';
  const bgOpacity = isCenter ? 'bg-white/[0.04]' : 'bg-white/[0.02]';

  return (
    <motion.div
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      animate={{
        borderColor,
        boxShadow: isActive ? `0 0 20px ${node.color}20` : 'none',
      }}
      className={`${bgOpacity} border p-4 md:p-5 cursor-pointer transition-all relative`}
      style={{ borderColor }}
    >
      {isActive && (
        <div className="absolute top-2 right-2">
          <span className="w-2 h-2 bg-[#6dfe9c] rounded-full animate-pulse inline-block" />
        </div>
      )}
      <div className={`font-mono text-lg mb-1 ${isCenter ? 'text-[#fcc025]' : 'text-[#adaaaa]/60'}`}>
        {node.icon}
      </div>
      <div className="font-mono text-xs font-bold text-white uppercase tracking-wider">
        {node.label}
      </div>
      <div className="font-mono text-[10px] text-[#adaaaa] mt-0.5">
        {node.sub}
      </div>
    </motion.div>
  );
}

function Guardrails({ stats }: { stats: ProtocolStats | null }) {
  const totalBounties = stats?.protocolTotals.bountyCount ?? 0;
  const totalCommitments = Number(stats?.contracts.trackRecord.stats.totalCommitments ?? 0);
  const winRatePct = Number(stats?.contracts.trackRecord.stats.winRateBps ?? 0) / 100;

  const guardrails = [
    {
      id: 'conviction-gate',
      label: 'CONVICTION GATE',
      rule: 'No trade below 3.5/10',
      detail: 'Three agents debate every thesis. If conviction stays below 3.5/10 after adversarial pressure, the trade is blocked. No override.',
      icon: '[ ]',
      color: '#6dfe9c',
    },
    {
      id: 'mandatory-stop',
      label: 'MANDATORY STOP LOSS',
      rule: 'No trade without exit plan',
      detail: 'Every position requires a stop-loss price before execution. If the CIO omits it, a 3% default is enforced. No naked exposure.',
      icon: '||',
      color: '#6dfe9c',
    },
    {
      id: 'circuit-breaker',
      label: 'CIRCUIT BREAKER',
      rule: '3 consecutive losses → max defense',
      detail: 'After 3 losses in a row, Red Team switches to maximum aggression. The CIO receives a circuit-breaker warning. Only exceptional setups pass.',
      icon: '!!',
      color: '#ff716a',
    },
    {
      id: 'drawdown-kill',
      label: 'DRAWDOWN KILL SWITCH',
      rule: '20% drawdown → all trading halted',
      detail: 'If cumulative drawdown exceeds 20% of portfolio, every trade is rejected. No exceptions. The system stops itself.',
      icon: '//',
      color: '#ff716a',
    },
    {
      id: 'risk-gate',
      label: 'HARD RISK GATE',
      rule: '$50/trade, 30% max concentration',
      detail: 'Deterministic limits that no AI agent can override: max single trade size, max portfolio concentration per token, max concurrent positions.',
      icon: '##',
      color: '#fcc025',
    },
    {
      id: 'calibration',
      label: 'METACOGNITION',
      rule: 'Overconfident? Conviction auto-adjusted',
      detail: 'Bobby tracks its own calibration. If recent high-conviction calls underperformed, conviction scores are automatically scaled down. Self-correcting.',
      icon: '><',
      color: '#fcc025',
    },
    {
      id: 'commit-reveal',
      label: 'COMMIT-REVEAL',
      rule: 'Predictions on-chain BEFORE outcome',
      detail: 'Every prediction is recorded on X Layer before the market moves. No backfill. No hindsight edits. Verifiable integrity.',
      icon: '=>',
      color: '#6dfe9c',
    },
    {
      id: 'judge-mode',
      label: 'JUDGE MODE (6D)',
      rule: 'Every debate audited on 6 dimensions',
      detail: 'Data integrity, adversarial quality, decision logic, risk management, calibration alignment, novelty. Plus bias detection: recency, confirmation, anchoring, loss aversion.',
      icon: '**',
      color: '#6dfe9c',
    },
    {
      id: 'adversarial-bounties',
      label: 'ADVERSARIAL BOUNTIES',
      rule: 'Stake OKB to prove Bobby wrong',
      detail: `Anyone can challenge Bobby's analysis on-chain. ${totalBounties} bounties posted. Losses become paid post-mortems. Economic accountability.`,
      icon: '$>',
      color: '#fcc025',
    },
    {
      id: 'yield-parking',
      label: 'YIELD PARKING',
      rule: 'Low conviction → autonomous de-risk',
      detail: 'When conviction is too low to trade (1.5-3.5/10) and cash sits idle, Bobby evaluates yield options: Aave V3, Compound, OKX Earn. Debates the risk before parking.',
      icon: '%%',
      color: '#6dfe9c',
    },
    {
      id: 'agent-auth',
      label: 'EIP-191 AUTH',
      rule: 'Every mutation requires signed proof',
      detail: 'External agents must sign with EIP-191 to call premium tools or post bounties. 10-minute auth window. No anonymous writes.',
      icon: '{}',
      color: '#6dfe9c',
    },
  ];

  return (
    <section id="guardrails" className="py-24 px-6 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-12"
      >
        <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase mb-4 border-l-4 border-[#ff716a] pl-6">
          11 Guardrails. Fail-Closed.
        </h2>
        <p className="font-mono text-sm text-[#adaaaa] max-w-3xl pl-6">
          No consensus → no trade. No stop loss → no trade. 3 losses → circuit breaker.
          Bobby doesn't trust itself — it proves itself.
        </p>

        {/* Live stats strip */}
        <div className="flex flex-wrap gap-6 mt-6 pl-6 font-mono text-[11px] uppercase tracking-widest">
          <span className="text-[#6dfe9c]">
            {totalCommitments} commitments on-chain
          </span>
          <span className="text-[#fcc025]">
            {totalBounties} bounties posted
          </span>
          <span className="text-[#ff716a]">
            {winRatePct > 0 ? `${winRatePct.toFixed(0)}% win rate` : 'tracking...'}
          </span>
        </div>
      </motion.div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {guardrails.map((g, i) => (
          <motion.div
            key={g.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            className="group bg-white/[0.02] border border-white/[0.04] rounded-xl p-5 hover:border-white/[0.08] transition-colors"
          >
            <div className="flex items-start gap-3 mb-3">
              <span
                className="font-mono text-xs font-bold shrink-0 w-8 h-8 flex items-center justify-center rounded border"
                style={{ color: g.color, borderColor: `${g.color}33` }}
              >
                {g.icon}
              </span>
              <div>
                <h3 className="font-black text-sm uppercase tracking-tight text-white">
                  {g.label}
                </h3>
                <p className="font-mono text-[11px] mt-0.5" style={{ color: g.color }}>
                  {g.rule}
                </p>
              </div>
            </div>
            <p className="text-[#adaaaa] text-xs leading-relaxed">
              {g.detail}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Fail-closed manifesto */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="mt-10 border border-[#ff716a]/20 rounded-xl p-6 bg-[#ff716a]/[0.03]"
      >
        <p className="font-mono text-xs text-[#ff716a] uppercase tracking-widest mb-3">
          :: FAIL-CLOSED PHILOSOPHY ::
        </p>
        <p className="text-[#adaaaa] text-sm leading-relaxed max-w-3xl">
          Most trading agents are fail-open: if something breaks, the trade goes through anyway.
          Bobby is fail-closed. Debate doesn't converge? <span className="text-white">Blocked.</span> Judge
          can't verify? <span className="text-white">Blocked.</span> Stop loss missing? <span className="text-white">Blocked.</span> Drawdown
          exceeded? <span className="text-white">All trading halted.</span> Every guardrail exists in production code — not
          documentation promises. The harness protects capital first, generates alpha second.
        </p>
      </motion.div>
    </section>
  );
}

function RiskOffMode() {
  const modes = [
    {
      state: 'EXECUTE',
      condition: 'Conviction ≥ 3.5/10 + all guardrails pass',
      color: '#6dfe9c',
      icon: '>>',
      description: 'Full adversarial debate passed. CIO approves. Stop loss set. Commit-reveal recorded on-chain. Trade goes live.',
    },
    {
      state: 'YIELD PARK',
      condition: 'Conviction 1.5–3.5/10 + idle cash > $25',
      color: '#fcc025',
      icon: '%%',
      description: 'Market is ambiguous — not enough edge to trade, but capital shouldn\'t sit idle. Bobby debates yield options (Aave V3, Compound, OKX Earn) with the same adversarial rigor. 20% kept liquid for fast re-entry.',
    },
    {
      state: 'BLOCKED',
      condition: 'Conviction < 1.5/10 or guardrail trip',
      color: '#ff716a',
      icon: '||',
      description: 'No trade. No yield. Bobby sits on hands. Circuit breaker active after 3 losses. Drawdown kill switch at 20%. Capital is preserved — not deployed.',
    },
  ];

  return (
    <section id="risk-off" className="py-24 px-6 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-10"
      >
        <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase mb-3 border-l-4 border-[#fcc025] pl-6">
          Three Outcomes. Never Guessing.
        </h2>
        <p className="font-mono text-sm text-[#adaaaa] max-w-3xl pl-6">
          Every cycle ends in one of three deterministic states. Bobby never says "maybe" — it
          executes, parks, or blocks. The decision is always explainable and always on-chain.
        </p>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-3">
        {modes.map((m, i) => (
          <motion.div
            key={m.state}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="relative overflow-hidden rounded-xl border bg-white/[0.02] p-6"
            style={{ borderColor: `${m.color}20` }}
          >
            {/* State header */}
            <div className="flex items-center gap-3 mb-4">
              <span
                className="font-mono text-lg font-black w-10 h-10 flex items-center justify-center rounded border"
                style={{ color: m.color, borderColor: `${m.color}40`, backgroundColor: `${m.color}08` }}
              >
                {m.icon}
              </span>
              <div>
                <h3 className="font-black text-xl uppercase tracking-tight" style={{ color: m.color }}>
                  {m.state}
                </h3>
                <p className="font-mono text-[10px] text-[#adaaaa] uppercase tracking-widest">
                  {m.condition}
                </p>
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-[#adaaaa] leading-relaxed">
              {m.description}
            </p>

            {/* Glow accent */}
            <div
              className="absolute -bottom-8 -right-8 w-32 h-32 rounded-full opacity-[0.03] blur-2xl"
              style={{ backgroundColor: m.color }}
            />
          </motion.div>
        ))}
      </div>

      {/* Explainability callout */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="mt-8 flex items-start gap-4 border border-white/[0.06] rounded-xl p-5 bg-white/[0.01]"
      >
        <span className="font-mono text-[#fcc025] text-lg shrink-0">?=</span>
        <div>
          <p className="text-sm text-white font-bold mb-1">Every decision is explainable.</p>
          <p className="text-xs text-[#adaaaa] leading-relaxed">
            Bobby posts the reason for every skip, every block, and every execution.
            "Conviction 2.8/10 — Red Team destroyed Alpha's thesis on SOL range break.
            CIO saw no asymmetric edge. Cash preserved."
            This isn't a black box. It's a glass box with on-chain receipts.
          </p>
        </div>
      </motion.div>
    </section>
  );
}

function Bounties({ stats }: { stats: ProtocolStats | null }) {
  const bounties = stats?.bounties ?? [];
  const bountiesContract = stats?.contracts.adversarialBounties;
  const bountySummary = stats?.bountySummary ?? null;
  const dimensionCards = useMemo(() => {
    const base = [
      'DATA_INTEGRITY',
      'ADVERSARIAL_QUALITY',
      'DECISION_LOGIC',
      'RISK_MANAGEMENT',
      'CALIBRATION_ALIGNMENT',
      'NOVELTY',
    ];

    return base.map((dimension) => {
      const summary = bountySummary?.[dimension];
      if (summary) {
        return {
          dimension,
          count: summary.openCount,
          avgReward: summary.avgRewardOkb,
          hardest:
            summary.maxRewardOkb !== null
              ? `${summary.maxRewardOkb.toFixed(4)} OKB`
              : 'Awaiting first challenger',
        };
      }

      const entries = bounties.filter((b) => b.dimension === dimension);
      const total = entries.reduce((sum, b) => sum + Number(b.rewardOkb || 0), 0);
      const avgReward = entries.length ? total / entries.length : null;
      return {
        dimension,
        count: entries.length,
        avgReward,
        hardest:
          entries.length > 0
            ? `${Math.max(...entries.map((b) => Number(b.rewardOkb || 0))).toFixed(4)} OKB`
            : 'Awaiting first challenger',
      };
    });
  }, [bounties, bountySummary]);

  return (
    <section id="bounties" className="py-24 px-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap justify-between items-end mb-12 gap-4">
        <div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase">
            Adversarial Bounties
          </h2>
          <p className="text-[#adaaaa] mt-2 font-mono text-xs uppercase tracking-widest">
            Stake OKB to prove Bobby was wrong. Win it if he was.
          </p>
          {bountiesContract && (
            <p className="mt-2 font-mono text-[10px] text-[#6dfe9c]/60">
              CONTRACT: {bountiesContract.address}
              {bountiesContract.verified && ' ✓ VERIFIED ON OKLINK'}
              {' · MIN '}
              {bountiesContract.minBounty.minBountyOkb} OKB
            </p>
          )}
        </div>
        <a
          href={`https://www.oklink.com/xlayer/address/${bountiesContract?.address ?? ''}`}
          target="_blank"
          rel="noreferrer"
          className="bg-[#6dfe9c] text-[#005f2e] px-6 py-2 font-bold uppercase text-sm tracking-tighter hover:brightness-110"
        >
          [+] POST A BOUNTY
        </a>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        {dimensionCards.map((card) => (
          <div
            key={card.dimension}
            className="bg-[#131313] border border-[#494847]/15 p-5 hover:border-[#6dfe9c]/30 transition-all"
          >
            <div className={`font-mono text-[10px] uppercase tracking-widest mb-4 ${DIMENSION_COLOR[card.dimension] ?? 'text-white'}`}>
              {card.dimension}
            </div>
            <div className="grid grid-cols-2 gap-4 font-mono text-[10px] mb-4">
              <div>
                <div className="text-[#adaaaa]">OPEN_BOUNTIES</div>
                <div className="text-xl text-white">{card.count}</div>
              </div>
              <div>
                <div className="text-[#adaaaa]">AVG_REWARD</div>
                <div className="text-xl text-[#6dfe9c]">
                  {card.avgReward === null ? '—' : `${card.avgReward.toFixed(4)} OKB`}
                </div>
              </div>
            </div>
            <div className="border-t border-[#494847]/15 pt-4 font-mono text-[11px] leading-6">
              <div className="flex justify-between">
                <span className="text-[#adaaaa]">HARDEST_TO_WIN</span>
                <span className="text-[#fcc025]">{card.hardest}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#adaaaa]">RESOLVER</span>
                <span className="text-white">JUDGE_MODE</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {bounties.length === 0 ? (
        <div className="bg-[#131313] border border-[#494847]/20 p-6 flex items-center justify-between gap-6 font-mono text-xs">
          <div>
            <span className="text-[#6dfe9c]">Awaiting first challenger</span>
            <span className="text-[#adaaaa] ml-3">contract live · chain 196</span>
          </div>
          <a
            href={`https://www.oklink.com/xlayer/address/${bountiesContract?.address ?? ''}`}
            target="_blank"
            rel="noreferrer"
            className="bg-[#6dfe9c] text-[#005f2e] px-5 py-2 font-bold uppercase text-[11px] tracking-tighter hover:brightness-110 shrink-0"
          >
            [+] POST FIRST BOUNTY
          </a>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bounties.map((b) => (
            <div
              key={b.bountyId}
              className="bg-[#131313] p-6 border border-[#494847]/15 flex flex-col justify-between hover:border-[#6dfe9c]/30 transition-all"
            >
              <div>
                <div className="flex justify-between items-start mb-4">
                  <span className="font-mono text-[10px] text-[#6dfe9c]">
                    #BOUNTY_{b.bountyId}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[9px] font-bold border ${
                      b.status === 'OPEN'
                        ? 'text-[#6dfe9c] border-[#6dfe9c]/30 bg-[#6dfe9c]/10'
                        : b.status === 'CHALLENGED'
                        ? 'text-[#fcc025] border-[#fcc025]/30 bg-[#fcc025]/10'
                        : 'text-[#adaaaa] border-[#adaaaa]/30 bg-white/[0.02]'
                    }`}
                  >
                    {b.status}
                  </span>
                </div>
                <h3
                  className={`font-bold text-sm leading-tight mb-4 uppercase font-mono ${
                    DIMENSION_COLOR[b.dimension] ?? 'text-white'
                  }`}
                >
                  DIMENSION: {b.dimension.replace(/_/g, ' ')}
                </h3>
                <div className="font-mono text-[10px] text-[#adaaaa] mb-4">
                  THREAD_HASH: {truncate(b.threadHash, 10, 6)}
                </div>
              </div>
              <div className="space-y-2 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-[#adaaaa]">REWARD:</span>
                  <span className="text-[#6dfe9c] font-bold">
                    {safeFixed(b.rewardOkb, 4)} OKB
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#adaaaa]">CHALLENGERS:</span>
                  <span>{b.challengeCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#adaaaa]">EXPIRES:</span>
                  <span className="text-[#fcc025]">
                    {formatCountdown(b.effectiveExpiry)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#adaaaa]">POSTER:</span>
                  <span>{truncate(b.poster)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function McpSection({
  mcp,
  stats,
}: {
  mcp: McpMeta | null;
  stats: ProtocolStats | null;
}) {
  const freeTools = mcp?.pricing.free ?? [];
  const premiumTools = mcp?.pricing.premium.tools ?? [];
  const totalTools = mcp?.counts?.totalTools ?? (freeTools.length + premiumTools.length);
  const calls = stats?.contracts.agentEconomy.stats.totalMcpCalls ?? '—';
  const volume = stats?.contracts.agentEconomy.stats.totalVolumeOkb ?? '—';
  const payments = stats?.contracts.agentEconomy.stats.totalPayments ?? '—';

  return (
    <section id="mcp" className="py-24 px-6 bg-black">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-12">
          <div className="md:w-1/3">
            <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase mb-6 leading-none">
              Bobby-As-A-Service
            </h2>
            <p className="text-[#adaaaa] mb-8 uppercase font-mono text-xs tracking-widest">
              {totalTools} MCP tools · {freeTools.length} free · {premiumTools.length} premium · Streamable HTTP · x402 settlement
            </p>
            <div className="bg-[#131313] p-4 border border-[#6dfe9c]/20 mb-4 font-mono text-[10px]">
              <div className="text-[#adaaaa] uppercase mb-1">MCP_CALLS_SETTLED</div>
              <div className="text-[#6dfe9c] text-3xl font-bold">{calls}</div>
            </div>
            <div className="bg-[#131313] p-4 border border-[#6dfe9c]/20 font-mono text-[10px]">
              <div className="text-[#adaaaa] uppercase mb-1">SETTLED_PAYMENTS / OKB</div>
              <div className="text-[#6dfe9c] text-3xl font-bold">
                {payments} / {safeFixed(volume, 4)}
              </div>
            </div>
          </div>

          <div className="md:w-2/3 space-y-6">
            <div className="bg-[#131313] p-5 border border-[#494847]/20">
              <div className="font-bold text-[#6dfe9c] mb-3 text-xs uppercase tracking-tighter">
                FREE_TIER ({freeTools.length})
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 font-mono text-[10px]">
                {freeTools.map((t) => (
                  <div
                    key={t}
                    className="bg-black border border-[#494847]/15 px-2 py-1 text-[#6dfe9c]/80 truncate"
                    title={t}
                  >
                    :: {t}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#131313] p-5 border border-[#fcc025]/20">
              <div className="font-bold text-[#fcc025] mb-3 text-xs uppercase tracking-tighter">
                PAID_TIER — {mcp?.pricing.premium.price ?? '0.001 OKB'} / call
              </div>
              <div className="space-y-2 font-mono text-[10px]">
                {[
                  { tool: 'bobby_analyze', flow: 'Alpha (thesis) → Red Team (attack) → CIO (verdict)' },
                  { tool: 'bobby_debate', flow: 'Alpha (bull) → Red Team (bear) → CIO (synthesis)' },
                  { tool: 'bobby_judge', flow: 'Data → Adversarial → Logic → Risk → Calibration → Novelty' },
                  { tool: 'bobby_security_scan', flow: 'Contract scan → Liquidity check → Risk score' },
                  { tool: 'bobby_wallet_portfolio', flow: 'Balances → DeFi positions → Risk assessment' },
                ].map((t) => (
                  <div
                    key={t.tool}
                    className="bg-black border border-[#fcc025]/20 px-3 py-2"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[#fcc025]">◉ {t.tool}</span>
                      <span className="text-[#fcc025]/60">0.001 OKB</span>
                    </div>
                    <div className="text-[#adaaaa] text-[9px]">{t.flow}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-black border border-[#494847]/20">
              <div className="bg-[#131313] px-4 py-2 border-b border-[#494847]/20 flex justify-between font-mono text-[10px] text-[#adaaaa]">
                <span>integration_sample.json-rpc</span>
                <span className="text-[#6dfe9c]">POST /api/mcp-http</span>
              </div>
              <pre className="p-6 font-mono text-[11px] text-[#6dfe9c]/80 overflow-x-auto">
{`{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "bobby_bounty_list",
    "arguments": { "limit": 5 }
  },
  "id": "demo-1"
}`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AgentInterop({
  stats,
  reputation,
  sentinel,
  mcp,
}: {
  stats: ProtocolStats | null;
  reputation: ReputationSummary | null;
  sentinel: SentinelSummary | null;
  mcp: McpMeta | null;
}) {
  const registeredAgents = stats?.contracts.agentRegistry.agents ?? 0;
  const trustScore = reputation?.trustScore?.score ?? null;
  const sentinelCalls = sentinel?.summary?.calledFreeTools ?? 0;
  const hasPremiumChallenge = sentinel?.summary?.receivedX402Challenge ?? false;
  const latestSettlement = mcp?.settlement ?? null;

  const integrations = [
    { title: 'SKILL.MD', glyph: '>_', desc: 'One file, zero-code MCP integration', href: '/skill.md', cta: '_DOWNLOAD', color: '#6dfe9c' },
    { title: 'REGISTRY', glyph: '#', desc: 'Machine-readable agent + tool catalog', href: '/api/registry', cta: '_QUERY', color: '#6dfe9c' },
    { title: 'REPUTATION_API', glyph: '%', desc: 'On-chain track record + win rate', href: '/api/reputation', cta: '_QUERY', color: '#fcc025' },
    { title: 'JUDGE_MANIFEST', glyph: ':::', desc: '6-dimension evaluation framework', href: '/ai-judge-manifest.json', cta: '_READ', color: '#ff716a' },
    { title: 'x402_SETTLEMENT', glyph: '$=', desc: 'Pay per call, settle on X Layer', href: '/api/mcp-http', cta: '_VIEW', color: '#6dfe9c' },
    { title: 'SENTINEL_DEMO', glyph: 'A2A', desc: 'Live discovery, free calls, premium paywall challenge', href: '/api/sentinel-demo', cta: '_RUN', color: '#fcc025' },
  ];

  return (
    <section id="interop" className="py-24 px-6 bg-[#131313] border-y border-[#494847]/15">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-12">
          <div>
            <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase mb-4 border-l-4 border-[#6dfe9c] pl-6">
              Agent-to-Agent Interop
            </h2>
            <p className="text-[#adaaaa] uppercase font-mono text-xs tracking-widest pl-6">
              Any AI agent can consume Bobby. Download the skill file and start calling.
            </p>
          </div>
          <div className="flex gap-4 font-mono text-[10px]">
            <div className="bg-black p-3 border border-[#6dfe9c]/20">
              <div className="text-[#adaaaa]">REGISTERED_AGENTS</div>
              <div className="text-[#6dfe9c] text-2xl font-bold">{registeredAgents}</div>
            </div>
            <div className="bg-black p-3 border border-[#6dfe9c]/20">
              <div className="text-[#adaaaa]">TRUST_SCORE</div>
              <div className="text-[#6dfe9c] text-2xl font-bold">
                {trustScore !== null ? safeFixed(trustScore, 0) : '—'}
              </div>
            </div>
            <div className="bg-black p-3 border border-[#6dfe9c]/20">
              <div className="text-[#adaaaa]">SENTINEL_FREE_CALLS</div>
              <div className="text-[#6dfe9c] text-2xl font-bold">{sentinelCalls}</div>
            </div>
            <div className="bg-black p-3 border border-[#6dfe9c]/20">
              <div className="text-[#adaaaa]">PREMIUM_FLOW</div>
              <div className={`text-2xl font-bold ${hasPremiumChallenge ? 'text-[#fcc025]' : 'text-white'}`}>
                {hasPremiumChallenge ? '402 READY' : 'IDLE'}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {integrations.map((item, i) => (
            <motion.a
              key={item.title}
              href={item.href}
              target={item.href.startsWith('/api') || item.href.endsWith('.json') || item.href.endsWith('.md') ? '_blank' : undefined}
              rel="noreferrer"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="bg-black border border-[#494847]/15 p-5 hover:border-[#6dfe9c]/30 transition-all group"
            >
              <div className="font-mono text-2xl font-bold mb-3" style={{ color: item.color }}>
                {item.glyph}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: item.color }}>
                {item.title}
              </div>
              <p className="font-mono text-[10px] text-[#adaaaa] mb-3">{item.desc}</p>
              <div
                className="font-mono text-[10px] font-bold uppercase opacity-60 group-hover:opacity-100 transition-opacity"
                style={{ color: item.color }}
              >
                {item.cta} →
              </div>
            </motion.a>
          ))}
        </div>

        <div className="mb-8 bg-black border border-[#494847]/20 px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-[#adaaaa]">
          Live proof: Sentinel discovered Bobby via registry, queried reputation, completed {sentinelCalls} free MCP calls, and {hasPremiumChallenge ? 'received a real x402 premium challenge' : 'has not reached the premium challenge yet'}.
          {latestSettlement && (
            <span className="block mt-2 text-[#6dfe9c]">
              Last verified settlement: {latestSettlement.tool} paid {latestSettlement.valueOkb} OKB.
            </span>
          )}
        </div>

        <div className="bg-black border border-[#494847]/20">
          <div className="bg-[#131313] px-4 py-2 border-b border-[#494847]/20 flex justify-between font-mono text-[10px] text-[#adaaaa]">
            <span>agent_quickstart.sh</span>
            <span className="text-[#6dfe9c]">4 commands to integrate</span>
          </div>
          <pre className="p-6 font-mono text-[11px] text-[#6dfe9c]/80 overflow-x-auto leading-relaxed">
{`# 1. Download the skill file (your agent reads this)
curl -o bobby.skill.md https://bobbyprotocol.xyz/skill.md

# 2. Discover Bobby's tools and pricing
curl https://bobbyprotocol.xyz/api/mcp-http

# 3. Check Bobby's on-chain reputation before trusting
curl https://bobbyprotocol.xyz/api/reputation | jq '.reputation'

# 4. Call a free tool — no payment, no API key
curl -X POST https://bobbyprotocol.xyz/api/mcp-http \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"bobby_intel","arguments":{}},"id":"1"}'`}
          </pre>
        </div>
      </div>
    </section>
  );
}

function TrustBadge({ stats }: { stats: ProtocolStats | null }) {
  const winRateBps = stats ? Number(stats.contracts.trackRecord.stats.winRateBps) : 0;
  const winRate = winRateBps / 100;
  const mcpCalls = stats ? Number(stats.contracts.agentEconomy.stats.totalMcpCalls) : 0;
  const bounties = stats ? stats.contracts.adversarialBounties.totalPosted : 0;
  const verified = stats ? stats.contracts.adversarialBounties.verified : false;

  const level =
    winRate >= 60 ? { label: 'HIGH', color: '#6dfe9c' } :
    winRate >= 40 ? { label: 'MODERATE', color: '#fcc025' } :
    winRate > 0 ? { label: 'LOW', color: '#ff716a' } :
    { label: 'UNRATED', color: '#adaaaa' };

  return (
    <section className="py-12 px-6 max-w-7xl mx-auto">
      <div className="bg-[#131313] border border-[#494847]/15 p-6">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 flex items-center justify-center border-2 font-mono text-lg font-bold"
              style={{ color: level.color, borderColor: level.color, backgroundColor: `${level.color}15` }}
            >
              {level.label === 'UNRATED' ? '?' : winRate > 0 ? `${safeFixed(winRate, 0)}` : '—'}
            </div>
            <div>
              <div className="font-mono text-[10px] text-[#adaaaa] uppercase tracking-widest">
                PROTOCOL_TRUST
              </div>
              <div className="font-bold text-lg uppercase" style={{ color: level.color }}>
                {level.label}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-6 font-mono text-[10px]">
            <div className="text-center">
              <div className="text-[#adaaaa]">WIN_RATE</div>
              <div className="text-xl font-bold" style={{ color: level.color }}>
                {winRate > 0 ? `${safeFixed(winRate, 1)}%` : '—'}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[#adaaaa]">MCP_CALLS</div>
              <div className="text-xl font-bold text-white">{mcpCalls}</div>
            </div>
            <div className="text-center">
              <div className="text-[#adaaaa]">BOUNTIES</div>
              <div className="text-xl font-bold text-white">{bounties}</div>
            </div>
            <div className="text-center">
              <div className="text-[#adaaaa]">CONTRACTS</div>
              <div className="text-xl font-bold text-[#6dfe9c]">
                {verified ? '4 ✓' : '4'}
              </div>
            </div>
            <a
              href="/protocol/heartbeat"
              className="flex items-center gap-2 border border-[#6dfe9c]/30 px-4 py-2 hover:bg-[#6dfe9c]/10 transition-all"
            >
              <div className="w-2 h-2 bg-[#6dfe9c] rounded-full animate-pulse" />
              <span className="font-mono text-[10px] text-[#6dfe9c] uppercase tracking-wider">
                LIVE HEARTBEAT
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function RevenueProof({ stats, liveTxs }: { stats: ProtocolStats | null; liveTxs: LiveTx[] }) {
  const [expanded, setExpanded] = useState(false);
  const {
    historyExpanded,
    setHistoryExpanded,
    historicalTxs,
    historyLoading,
    historyError,
    historyDone,
    fetchHistoricalTxs,
  } = useProtocolTxHistory();
  const volumeOkb = stats ? safeFixed(stats.contracts.agentEconomy.stats.totalVolumeOkb, 4) : '—';
  const bountyEscrowOkb = stats ? safeFixed(stats.protocolTotals.bountyEscrowOkb, 4) : '—';
  const protocolNotionalOkb = stats ? safeFixed(stats.protocolTotals.protocolNotionalOkb, 4) : '—';
  const mcpCalls = stats ? Number(stats.contracts.agentEconomy.stats.totalMcpCalls) : 0;
  const payments = stats ? Number(stats.contracts.agentEconomy.stats.totalPayments) : 0;
  const bounties = stats ? stats.contracts.adversarialBounties.totalPosted : 0;

  const visibleTxs = expanded ? liveTxs : liveTxs.slice(0, 6);
  const proofs = visibleTxs.map((tx) => {
    const val = parseFloat(tx.valueOkb || '0');
    const age = tx.timestamp ? Math.floor(Date.now() / 1000 - tx.timestamp) : null;
    const ageStr = age !== null
      ? age < 60 ? `${age}s ago` : age < 3600 ? `${Math.floor(age / 60)}m ago` : `${Math.floor(age / 3600)}h ago`
      : '';
    return {
      label: `${tx.contractName} :: ${tx.method}`,
      tx: tx.hash,
      detail: `${val > 0 ? `${val.toFixed(4)} OKB | ` : ''}${ageStr}`,
    };
  });

  return (
    <section className="py-12 px-6 max-w-7xl mx-auto">
      <div className="bg-[#131313] border border-[#494847]/15 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <div className="font-mono text-[10px] text-[#adaaaa] uppercase tracking-widest mb-1">
              REVENUE_PROOF
            </div>
            <div className="text-lg font-bold text-white">
              Autonomous Revenue on X Layer
            </div>
          </div>
          <div className="flex gap-6 font-mono text-[10px]">
            <div className="text-center">
              <div className="text-[#adaaaa]">VOLUME_OKB</div>
              <div className="text-xl font-bold text-[#6dfe9c]">{volumeOkb}</div>
              <div className="text-[9px] text-[#adaaaa]/70 mt-1">paid MCP settlement</div>
            </div>
            <div className="text-center">
              <div className="text-[#adaaaa]">PAYMENTS</div>
              <div className="text-xl font-bold text-white">{payments}</div>
              <div className="text-[9px] text-[#adaaaa]/70 mt-1">settled via AgentEconomy</div>
            </div>
            <div className="text-center">
              <div className="text-[#adaaaa]">BOUNTY_ESCROW</div>
              <div className="text-xl font-bold text-[#fcc025]">{bountyEscrowOkb}</div>
              <div className="text-[9px] text-[#adaaaa]/70 mt-1">{bounties} bounties posted</div>
            </div>
            <div className="text-center">
              <div className="text-[#adaaaa]">PROTOCOL_NOTIONAL</div>
              <div className="text-xl font-bold text-white">{protocolNotionalOkb}</div>
              <div className="text-[9px] text-[#adaaaa]/70 mt-1">{mcpCalls} MCP calls</div>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {proofs.map((p) => (
            <a
              key={p.tx}
              href={`https://www.oklink.com/xlayer/tx/${p.tx}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-4 py-3 bg-black/40 border border-[#494847]/10 hover:border-[#6dfe9c]/30 transition-all group"
            >
              <span className="w-2 h-2 bg-[#6dfe9c] rounded-full" />
              <span className="font-mono text-[10px] text-[#6dfe9c] uppercase w-40 shrink-0">
                {p.label}
              </span>
              <span className="font-mono text-[11px] text-white/40 truncate flex-1">
                {p.tx.slice(0, 18)}...{p.tx.slice(-8)}
              </span>
              <span className="font-mono text-[10px] text-[#adaaaa] hidden md:block">
                {p.detail}
              </span>
              <span className="text-[#6dfe9c] opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                ↗
              </span>
            </a>
          ))}
        </div>
        {liveTxs.length > 6 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-4 w-full py-2.5 border border-[#494847]/20 hover:border-[#6dfe9c]/40 bg-black/20 hover:bg-black/40 transition-all font-mono text-[11px] uppercase tracking-widest text-[#adaaaa] hover:text-[#6dfe9c]"
          >
            {expanded ? `COLLAPSE (${liveTxs.length} txs)` : `SEE ALL ${liveTxs.length} TRANSACTIONS`}
          </button>
        )}

        <div className="mt-4 border border-[#494847]/20 bg-black/20">
          <button
            onClick={() => setHistoryExpanded((current) => !current)}
            className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left"
          >
            <div>
              <div className="font-mono text-[10px] text-[#adaaaa] uppercase tracking-widest">
                HISTORICAL_ONCHAIN_ARCHIVE
              </div>
              <div className="font-mono text-[11px] text-white/30 mt-1">
                Expand to inspect the full Bobby treasury transaction archive across protocol contracts.
              </div>
            </div>
            <span className="font-mono text-[11px] text-[#6dfe9c] uppercase tracking-widest">
              {historyExpanded ? 'COLLAPSE' : 'EXPAND'}
            </span>
          </button>

          {historyExpanded && (
            <div className="px-4 pb-4 border-t border-[#494847]/20">
              {historyError && (
                <div className="mt-4 font-mono text-[11px] text-[#ff716a]">
                  Error loading historical archive: {historyError}
                </div>
              )}

              {historicalTxs.length > 0 ? (
                <>
                  <div className="mt-4 flex items-center justify-between gap-4 font-mono text-[10px] text-[#adaaaa] uppercase tracking-widest">
                    <span>{historicalTxs.length} historical txs loaded</span>
                    <span className={historyDone ? 'text-[#6dfe9c]' : 'text-[#fcc025]'}>
                      {historyDone ? 'Archive complete' : 'Loading archive...'}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2 max-h-[32rem] overflow-y-auto pr-1">
                    {historicalTxs.map((tx) => (
                      <a
                        key={`${tx.hash}-${tx.blockNumber}`}
                        href={`https://www.oklink.com/xlayer/tx/${tx.hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 px-4 py-3 bg-black/40 border border-[#494847]/10 hover:border-[#6dfe9c]/30 transition-all group"
                      >
                        <span className="w-2 h-2 bg-[#fcc025] rounded-full shrink-0" />
                        <span className="font-mono text-[10px] text-[#6dfe9c] uppercase w-40 shrink-0">
                          {tx.contractName} :: {tx.method}
                        </span>
                        <span className="font-mono text-[10px] text-white/25 hidden md:block shrink-0">
                          BLOCK #{tx.blockNumber.toLocaleString()}
                        </span>
                        <span className="font-mono text-[11px] text-white/40 truncate flex-1">
                          {tx.hash.slice(0, 18)}...{tx.hash.slice(-8)}
                        </span>
                        {parseFloat(tx.valueOkb) > 0 && (
                          <span className="font-mono text-[10px] text-[#fcc025] hidden lg:block">
                            {parseFloat(tx.valueOkb).toFixed(4)} OKB
                          </span>
                        )}
                        <span className="font-mono text-[10px] text-[#adaaaa] hidden md:block">
                          {tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleString() : '—'}
                        </span>
                        <span className="text-[#6dfe9c] opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                          ↗
                        </span>
                      </a>
                    ))}
                  </div>
                </>
              ) : historyLoading ? (
                <div className="mt-4 font-mono text-[11px] text-[#adaaaa] text-center">
                  Loading historical transaction archive...
                </div>
              ) : (
                <div className="mt-4 font-mono text-[11px] text-[#adaaaa] text-center">
                  No historical transactions found yet.
                </div>
              )}

              {!historyDone && !historyLoading && (
                <button
                  onClick={fetchHistoricalTxs}
                  className="mt-4 w-full py-2.5 border border-[#494847]/20 hover:border-[#6dfe9c]/40 bg-black/20 hover:bg-black/40 transition-all font-mono text-[11px] uppercase tracking-widest text-[#adaaaa] hover:text-[#6dfe9c]"
                >
                  LOAD MORE HISTORY
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function LiveCheckpoint() {
  const [cp, setCp] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch('/api/checkpoint?hours=4')
      .then(r => r.ok ? r.json() : null)
      .then(data => setCp(data))
      .catch(() => {});
  }, []);

  if (!cp) return null;

  const rd = cp.risk_decisions as Record<string, number> || {};
  const oc = cp.on_chain as Record<string, unknown> || {};
  const latest = cp.latest_debate as Record<string, unknown> | null;
  const guardrails = cp.guardrails as Record<string, unknown> || {};

  return (
    <section className="py-12 px-6 max-w-7xl mx-auto">
      <div className="bg-black border border-[#494847]/20">
        <div className="bg-[#131313] px-4 py-2 border-b border-[#494847]/20 flex justify-between font-mono text-[10px] text-[#adaaaa]">
          <span>checkpoint_4h.log</span>
          <span className="text-[#fcc025]">LIVE PROOF LOOP</span>
        </div>
        <div className="p-4 space-y-3">
          {/* Risk decisions strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'DEBATES', value: rd.total_debates ?? '—', color: '#6dfe9c' },
              { label: 'EXECUTED', value: rd.executed ?? 0, color: '#6dfe9c' },
              { label: 'BLOCKED', value: `${rd.blocked ?? 0} (${rd.block_rate_pct ?? 0}%)`, color: '#ff716a' },
              { label: 'AVG CONVICTION', value: `${rd.avg_conviction ?? '—'}/10`, color: '#fcc025' },
              { label: 'WIN RATE', value: `${oc.win_rate_pct ?? '—'}%`, color: '#6dfe9c' },
            ].map(m => (
              <div key={m.label} className="font-mono text-center">
                <div className="text-[9px] text-[#adaaaa] uppercase tracking-widest">{m.label}</div>
                <div className="text-lg font-bold" style={{ color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Latest debate */}
          {latest && (
            <div className="border-t border-[#494847]/20 pt-3 font-mono text-[11px]">
              <span className="text-[#adaaaa]">LATEST → </span>
              <span className="text-white">{latest.symbol as string} {(latest.direction as string || '').toUpperCase()}</span>
              <span className="text-[#adaaaa]"> conviction </span>
              <span style={{ color: (latest.conviction as number) >= 3.5 ? '#6dfe9c' : '#ff716a' }}>
                {latest.conviction as number}/10
              </span>
              <span className="text-[#adaaaa]"> → </span>
              <span style={{ color: latest.decision === 'EXECUTE' ? '#6dfe9c' : '#ff716a' }}>
                {latest.decision as string}
              </span>
            </div>
          )}

          {/* Guardrails status */}
          <div className="border-t border-[#494847]/20 pt-3 flex flex-wrap gap-3 font-mono text-[10px]">
            <span className="text-[#adaaaa]">GUARDRAILS:</span>
            <span className={guardrails.circuit_breaker === 'ARMED' ? 'text-[#6dfe9c]' : 'text-[#ff716a]'}>
              Circuit breaker: {guardrails.circuit_breaker as string}
            </span>
            <span className={(guardrails.yield_parking as string || '').startsWith('ACTIVE') ? 'text-[#fcc025]' : 'text-[#adaaaa]'}>
              Yield parking: {guardrails.yield_parking as string}
            </span>
            <span className="text-[#6dfe9c]">Fail-closed: ON</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ActivityFeed({ feed }: { feed: ActivityItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const COLLAPSED_COUNT = 8;

  const fmtAgo = (secs: number | null) => {
    if (secs === null) return '—';
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  };

  const sourceCount = {
    commerce: feed.filter((e) => e.source === 'commerce').length,
    onchain: feed.filter((e) => e.source === 'onchain').length,
    bounty: feed.filter((e) => e.source === 'bounty').length,
  };
  const fallbackOnly = sourceCount.bounty > 0 && sourceCount.commerce === 0 && sourceCount.onchain === 0;
  const visibleFeed = expanded ? feed : feed.slice(0, COLLAPSED_COUNT);
  const hasMore = feed.length > COLLAPSED_COUNT;

  const sourceBadge = (source?: string) => {
    switch (source) {
      case 'commerce':
        return { label: 'A2A', className: 'text-[#6dfe9c] border-[#6dfe9c]/20 bg-[#6dfe9c]/10' };
      case 'onchain':
        return { label: 'TX', className: 'text-[#fcc025] border-[#fcc025]/20 bg-[#fcc025]/10' };
      case 'bounty':
        return { label: 'BOUNTY', className: 'text-white/70 border-white/10 bg-white/5' };
      default:
        return { label: 'EVENT', className: 'text-white/70 border-white/10 bg-white/5' };
    }
  };

  const statusBadge = (status?: string | null, paid?: boolean) => {
    if (paid || status === 'verified') {
      return { label: 'PAID', className: 'text-[#fcc025] border-[#fcc025]/20 bg-[#fcc025]/10' };
    }
    if (status === 'free_call') {
      return { label: 'FREE', className: 'text-[#6dfe9c] border-[#6dfe9c]/20 bg-[#6dfe9c]/10' };
    }
    if (status === 'challenge_issued') {
      return { label: '402', className: 'text-[#ff716a] border-[#ff716a]/20 bg-[#ff716a]/10' };
    }
    if (status === 'bounty_posted') {
      return { label: 'POSTED', className: 'text-white/70 border-white/10 bg-white/5' };
    }
    return { label: 'LIVE', className: 'text-white/60 border-white/10 bg-white/5' };
  };

  if (feed.length === 0) {
    return (
      <section className="py-12 px-6 max-w-7xl mx-auto">
        <div className="bg-black border border-[#494847]/20">
          <div className="bg-[#131313] px-4 py-2 border-b border-[#494847]/20 flex justify-between font-mono text-[10px] text-[#adaaaa]">
            <span>activity_feed.log</span>
            <span className="text-[#6dfe9c]">LIVE</span>
          </div>
          <div className="p-4 font-mono text-[11px] text-[#adaaaa] text-center">
            Awaiting first agent interaction...
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 px-6 max-w-7xl mx-auto">
      <div className="bg-black border border-[#494847]/20">
        <div className="bg-[#131313] px-4 py-2 border-b border-[#494847]/20 flex justify-between font-mono text-[10px] text-[#adaaaa]">
          <span>activity_feed.log</span>
          <span className={`${fallbackOnly ? 'text-[#fcc025]' : 'text-[#6dfe9c]'} flex items-center gap-1`}>
            <span className="w-1.5 h-1.5 bg-[#6dfe9c] rounded-full animate-pulse" />
            {fallbackOnly
              ? `FALLBACK · ${sourceCount.bounty} bounty events`
              : `LIVE · ${sourceCount.commerce} A2A · ${sourceCount.onchain} tx · ${feed.length} events`}
          </span>
        </div>
        {fallbackOnly && (
          <div className="px-4 py-2 border-b border-[#494847]/10 font-mono text-[10px] text-[#fcc025]">
            No recent A2A commerce or treasury txs surfaced yet. Showing latest bounty archive instead.
          </div>
        )}
        <div className={`divide-y divide-[#494847]/10 ${expanded ? 'max-h-[600px]' : 'max-h-[240px]'} overflow-y-auto transition-all`}>
          {visibleFeed.map((e, i) => {
            const source = sourceBadge(e.source);
            const status = statusBadge(e.status, e.paid);
            return (
            <div key={i} className="px-4 py-2 font-mono text-[11px] flex items-center gap-3">
              <span className="text-[#adaaaa] w-14 shrink-0 text-right">{fmtAgo(e.agoSeconds)}</span>
              <span className={`px-1.5 py-0.5 border text-[9px] uppercase tracking-widest ${source.className}`}>
                {source.label}
              </span>
              <span className={`px-1.5 py-0.5 border text-[9px] uppercase tracking-widest ${status.className}`}>
                {status.label}
              </span>
              <span className="text-white/60 truncate">{e.agent}</span>
              <span className="text-[#adaaaa]">→</span>
              <span className={e.source === 'bounty' ? 'text-white/85' : 'text-[#6dfe9c]'}>{e.tool}</span>
              {e.paid && e.amountOkb && (
                <span className="text-[#fcc025] ml-auto shrink-0">{e.amountOkb} OKB</span>
              )}
              {e.txHash && (
                <a
                  href={`https://www.oklink.com/xlayer/tx/${e.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#6dfe9c]/40 hover:text-[#6dfe9c] shrink-0"
                >
                  ↗
                </a>
              )}
            </div>
          )})}
        </div>
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full py-2 border-t border-[#494847]/20 font-mono text-[10px] text-[#6dfe9c] uppercase tracking-widest hover:bg-[#6dfe9c]/[0.03] transition-colors"
          >
            {expanded ? `Collapse ↑` : `See all ${feed.length} events ↓`}
          </button>
        )}
      </div>
    </section>
  );
}

function LiveOnXLayer({ stats }: { stats: ProtocolStats | null }) {
  const contracts = useMemo(() => {
    if (!stats) return [];
    const c = stats.contracts;
    const list = [
      {
        label: 'HARDNESS_REGISTRY',
        address: (c as any).hardnessRegistry?.address || '0xD89c1721CD760984a31dE0325fD96cD27bB31040',
        rows: [
          { k: 'SIGNALS', v: 'publishSignal' },
          { k: 'PREDICTIONS', v: 'commitPrediction' },
          { k: 'AGENT', v: (c as any).hardnessRegistry?.agentRegistered ? '✓ REGISTERED' : '—' },
        ],
        lastBlock: (c as any).hardnessRegistry?.lastActivityBlock || null,
      },
      {
        label: 'AGENT_ECONOMY_V2',
        address: c.agentEconomy.address,
        rows: [
          { k: 'DEBATES', v: c.agentEconomy.stats.totalDebates },
          { k: 'MCP_CALLS', v: c.agentEconomy.stats.totalMcpCalls },
          {
            k: 'VOLUME_OKB',
            v: safeFixed(c.agentEconomy.stats.totalVolumeOkb, 4),
          },
        ],
        lastBlock: c.agentEconomy.lastActivityBlock,
      },
      {
        label: 'CONVICTION_ORACLE',
        address: c.convictionOracle.address,
        rows: [
          { k: 'SYMBOLS_TRACKED', v: c.convictionOracle.stats.symbolCount },
        ],
        lastBlock: null,
      },
      {
        label: 'TRACK_RECORD',
        address: c.trackRecord.address,
        rows: [
          { k: 'COMMITMENTS', v: c.trackRecord.stats.totalCommitments },
          { k: 'REVEALED', v: c.trackRecord.stats.totalTrades },
          {
            k: 'WIN_RATE',
            v: `${safeFixed(Number(c.trackRecord.stats.winRateBps) / 100, 1)}%`,
          },
        ],
        lastBlock: null,
      },
      {
        label: 'ADVERSARIAL_BOUNTIES',
        address: c.adversarialBounties.address,
        rows: [
          { k: 'POSTED', v: `${c.adversarialBounties.totalPosted}` },
          {
            k: 'MIN_OKB',
            v: c.adversarialBounties.minBounty.minBountyOkb,
          },
          {
            k: 'VERIFIED',
            v: c.adversarialBounties.verified ? '✓ OKLINK' : '—',
          },
        ],
        lastBlock: c.adversarialBounties.lastActivityBlock,
      },
      {
        label: 'AGENT_REGISTRY',
        address: (c as any).agentRegistry?.address || '0x823a1670f521a35d4fafe4502bdcb3a8148bba8b',
        rows: [
          { k: 'TYPE', v: 'ERC-721' },
          { k: 'AGENTS', v: `${(c as any).agentRegistry?.agents ?? 0}` },
          { k: 'IDENTITY', v: 'NFT-based' },
        ],
        lastBlock: null,
      },
    ];
    return list;
  }, [stats]);

  return (
    <section id="contracts" className="py-24 px-6 max-w-7xl mx-auto">
      <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase mb-2 text-center">
        Live on X Layer
      </h2>
      <p className="text-center text-[#adaaaa] font-mono text-xs uppercase tracking-widest mb-12">
        Six contracts. One protocol. All on OKX X Layer chain 196.
      </p>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {contracts.length === 0
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-[#131313] border border-[#494847]/15 p-5 animate-pulse h-48"
              />
            ))
          : contracts.map((ct) => (
              <a
                key={ct.label}
                href={`https://www.oklink.com/xlayer/address/${ct.address}`}
                target="_blank"
                rel="noreferrer"
                className="bg-[#131313] border border-[#494847]/15 p-5 relative overflow-hidden hover:border-[#6dfe9c]/40 transition-all group block"
              >
                <div className="font-mono text-[9px] text-[#6dfe9c] uppercase mb-2 flex justify-between">
                  <span>{ct.label}</span>
                  <span className="text-[#6dfe9c] opacity-40 group-hover:opacity-100 transition-opacity">
                    ↗
                  </span>
                </div>
                <div className="font-mono text-[11px] text-white mb-6 truncate">
                  {truncate(ct.address, 10, 8)}
                </div>
                <div className="space-y-2 font-mono text-[10px]">
                  {ct.rows.map((r) => (
                    <div
                      key={r.k}
                      className="flex justify-between border-b border-[#494847]/10 pb-1"
                    >
                      <span className="text-[#adaaaa]">{r.k}</span>
                      <span className="text-[#6dfe9c]">{r.v}</span>
                    </div>
                  ))}
                  {ct.lastBlock && (
                    <div className="flex justify-between pt-1">
                      <span className="text-[#adaaaa]">LAST_BLOCK</span>
                      <span className="text-[#6dfe9c]">
                        #{ct.lastBlock.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="absolute bottom-2 right-2 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-[#6dfe9c] rounded-full animate-pulse" />
                  <span className="font-mono text-[8px] text-[#6dfe9c] uppercase">
                    LIVE
                  </span>
                </div>
              </a>
            ))}
      </div>
    </section>
  );
}

function Footer({ stats }: { stats: ProtocolStats | null }) {
  return (
    <footer className="w-full px-8 py-12 bg-[#0e0e0e] border-t border-[#494847]/15">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <div className="text-[#6dfe9c] font-bold font-mono text-sm uppercase mb-1">
            BOBBY_PROTOCOL — HARDNESS FINANCE
          </div>
          <div className="text-[#6dfe9c]/40 font-mono text-[10px] uppercase">
            Financial orchestration infrastructure for AI agents · X Layer
          </div>
          <div className="text-[#6dfe9c]/40 font-mono text-[10px] mt-1">
            Last sync: {stats ? new Date(stats.fetchedAt).toLocaleTimeString() : '—'}
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <a
            className="text-[#fcc025] hover:text-[#fcc025] font-mono text-[11px] uppercase font-bold"
            href="/submission"
          >
            SUBMISSION
          </a>
          <a
            className="text-[#6dfe9c] hover:text-[#6dfe9c] font-mono text-[11px] uppercase font-bold animate-pulse"
            href="/protocol/heartbeat"
          >
            HEARTBEAT
          </a>
          <a
            className="text-[#6dfe9c]/60 hover:text-[#6dfe9c] font-mono text-[11px] uppercase"
            href="https://github.com/anthonysurfermx/Bobby-Agent-Trader"
            target="_blank"
            rel="noreferrer"
          >
            GITHUB
          </a>
          <a
            className="text-[#6dfe9c]/60 hover:text-[#6dfe9c] font-mono text-[11px] uppercase"
            href="/api/mcp-http"
          >
            MCP_ENDPOINT
          </a>
          <a
            className="text-[#6dfe9c]/60 hover:text-[#6dfe9c] font-mono text-[11px] uppercase"
            href="https://t.me/bobbyagentraderbot"
            target="_blank"
            rel="noreferrer"
          >
            TELEGRAM_BOT
          </a>
          <a
            className="text-[#6dfe9c]/60 hover:text-[#6dfe9c] font-mono text-[11px] uppercase"
            href="/agentic-world/bobby"
          >
            LIVE_TERMINAL
          </a>
          <a
            className="text-[#fcc025] hover:text-[#fcc025] font-mono text-[11px] uppercase font-bold"
            href="https://github.com/okx/plugin-store/pull/161"
            target="_blank"
            rel="noreferrer"
          >
            PLUGIN_STORE_PR
          </a>
        </div>
      </div>
    </footer>
  );
}

// ---- Page ----

export default function BobbyProtocolLanding() {
  const { data: stats, error, loading } = useProtocolStats();
  const mcp = useMcpMeta();
  const reputation = useReputation();
  const activity = useActivity();
  const liveTxs = useLiveTxs();
  const sentinel = useSentinelDemo();

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-sans relative overflow-x-hidden">
      <Helmet>
        <title>Bobby Protocol | Financial Orchestration for AI Agents</title>
        <meta
          name="description"
          content="Connect any AI agent to financial infrastructure. Stress-test decisions with adversarial debate. Score on 6 dimensions. Publish proof on X Layer."
        />
        <style>{`
          @keyframes marquee {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          body::after {
            content: "";
            position: fixed;
            inset: 0;
            background:
              linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.25) 50%),
              linear-gradient(90deg, rgba(255,0,0,0.06), rgba(0,255,0,0.02), rgba(0,0,255,0.06));
            background-size: 100% 2px, 3px 100%;
            z-index: 9999;
            pointer-events: none;
            opacity: 0.06;
          }
        `}</style>
      </Helmet>

      <TopTicker stats={stats} />
      <Nav />

      {loading && !stats && (
        <div className="pt-32 pb-20 text-center font-mono text-[11px] text-[#6dfe9c] uppercase tracking-widest">
          :: BOOTING PROTOCOL DATA STREAM ::
        </div>
      )}

      {error && !stats && (
        <div className="pt-32 pb-20 text-center font-mono text-[11px] text-[#ff716a] uppercase tracking-widest">
          :: PROTOCOL OFFLINE — {error} ::
        </div>
      )}

      <HeroLiveDebate stats={stats} />
      <TrustBadge stats={stats} />
      <RevenueProof stats={stats} liveTxs={liveTxs} />
      <ClosedLoop />
      <JudgeMode stats={stats} />
      <WhyMatters />
      <Flywheels />
      <HarnessArchitecture />
      <Guardrails stats={stats} />
      <RiskOffMode />
      <Bounties stats={stats} />
      <McpSection mcp={mcp} stats={stats} />
      <AgentInterop stats={stats} reputation={reputation} sentinel={sentinel} mcp={mcp} />
      <LiveCheckpoint />
      <ActivityFeed feed={activity} />
      <LiveOnXLayer stats={stats} />
      <Footer stats={stats} />
    </div>
  );
}
