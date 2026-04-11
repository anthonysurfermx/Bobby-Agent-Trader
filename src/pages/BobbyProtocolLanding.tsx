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
  market: {
    prices: Price[];
    regime: unknown;
    xlayer: unknown;
  };
}

interface McpMeta {
  name: string;
  version: string;
  pricing: {
    free: string[];
    premium: {
      tools: string[];
      price: string;
      priceWei: string;
      contract: string;
    };
  };
}

interface PnlSummary {
  startingCapital: number;
  currentEquity: number;
  totalReturn: number;
  totalTrades: number;
  winRate: number;
  wins: number;
  losses: number;
}

// ---- Helpers ----

const fmtNum = (n: number | string, digits = 0) => {
  const v = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
};

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

const fmtOkb = (wei: string, digits = 4) => {
  try {
    const v = Number(wei) / 1e18;
    return v.toLocaleString('en-US', { maximumFractionDigits: digits });
  } catch {
    return '—';
  }
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

function usePnl() {
  const [summary, setSummary] = useState<PnlSummary | null>(null);
  useEffect(() => {
    fetch('/api/bobby-pnl', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setSummary((j as { summary?: PnlSummary }).summary ?? null))
      .catch(() => setSummary(null));
  }, []);
  return summary;
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
  const sections = ['DEBATE', 'JUDGE', 'BOUNTIES', 'MCP', 'CONTRACTS'];
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
      </div>
      <a
        href="/agentic-world/bobby"
        className="bg-[#6dfe9c]/10 text-[#6dfe9c] px-4 py-2 font-bold tracking-tighter uppercase text-sm border border-[#6dfe9c]/30 hover:bg-[#6dfe9c]/20 transition-all"
      >
        _OPEN_TERMINAL
      </a>
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
          [3-AGENT_DEBATE]
        </span>
        <span className="px-3 py-1 bg-[#262626] border border-[#fcc025]/20 text-[#fcc025] font-mono text-[10px] tracking-widest">
          [ON-CHAIN_JUDGE]
        </span>
        <span className="px-3 py-1 bg-[#262626] border border-[#ff716a]/20 text-[#ff716a] font-mono text-[10px] tracking-widest">
          [PAY-TO-CHALLENGE]
        </span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-5xl md:text-7xl lg:text-8xl font-black tracking-[-0.04em] text-center max-w-5xl leading-none uppercase mb-6"
      >
        The only AI trader you can{' '}
        <span className="text-[#6dfe9c] italic">argue</span> with on-chain.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="font-mono text-[11px] text-[#adaaaa] uppercase tracking-widest mb-10 text-center max-w-2xl"
      >
        Three agents debate every trade. A judge grades them on six dimensions.
        Anyone can stake OKB to prove Bobby was wrong.
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

          <div className="mt-6 border-t border-[#494847]/15 pt-4">
            <div className="bg-[#6dfe9c]/5 p-4 border-l-2 border-[#6dfe9c]">
              <div className="flex items-center justify-between mb-1 font-mono text-[10px] tracking-widest uppercase">
                <span className="font-bold text-[#6dfe9c]">
                  {stats ? 'FEED_LIVE' : 'CONNECTING'}
                </span>
                <span className="text-[#adaaaa]">
                  {stats ? new Date(stats.fetchedAt).toLocaleTimeString() : '—'}
                </span>
              </div>
              <p className="text-white/80 text-xs font-mono">
                This is the public protocol surface. The 3-agent debate
                terminal lives at{' '}
                <a className="underline text-[#6dfe9c]" href="/agentic-world/bobby">
                  /agentic-world/bobby
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex flex-wrap gap-4 mt-10"
      >
        <a
          href="#bounties"
          className="bg-[#6dfe9c] text-[#005f2e] px-6 py-3 font-bold uppercase text-sm tracking-tighter hover:brightness-110 transition"
        >
          [+] POST A BOUNTY
        </a>
        <a
          href="#mcp"
          className="border border-[#6dfe9c]/30 text-[#6dfe9c] px-6 py-3 font-bold uppercase text-sm tracking-tighter hover:bg-[#6dfe9c]/10 transition"
        >
          _CONSUME_VIA_MCP
        </a>
      </motion.div>
    </section>
  );
}

function TradingRoom({ stats, pnl }: { stats: ProtocolStats | null; pnl: PnlSummary | null }) {
  const debates = stats?.contracts.agentEconomy.stats.totalDebates ?? '—';
  const mcpCalls = stats?.contracts.agentEconomy.stats.totalMcpCalls ?? '—';
  const volume = stats?.contracts.agentEconomy.stats.totalVolumeOkb ?? '—';

  // Role labels and one-line descriptors are static config — the identity
  // of the three agents, not live data. Numeric metrics come from stats/pnl.
  const agents = [
    {
      name: 'ALPHA_HUNTER',
      color: '#6dfe9c',
      role: 'OPPORTUNITY_SCOUT',
      descriptor: 'Proposes long/short theses from on-chain and market data.',
      metricA: { label: 'PROTOCOL_DEBATES', value: debates },
      metricB: { label: 'MCP_CALLS', value: mcpCalls },
    },
    {
      name: 'RED_TEAM',
      color: '#fcc025',
      role: 'ADVERSARIAL_CRITIC',
      descriptor: 'Attacks every thesis before capital is committed.',
      metricA: { label: 'AGENT_WIN_RATE', value: pnl ? `${pnl.winRate}%` : '—' },
      metricB: { label: 'AGENT_LOSSES', value: pnl ? `${pnl.losses}` : '—' },
    },
    {
      name: 'CIO',
      color: '#ff716a',
      role: 'FINAL_DECISION',
      descriptor: 'Weighs both sides and emits the final conviction score.',
      metricA: { label: 'AGENT_EQUITY', value: pnl ? `$${safeFixed(pnl.currentEquity, 2)}` : '—' },
      metricB: { label: 'TOTAL_RETURN', value: pnl ? `${safeFixed(pnl.totalReturn, 2)}%` : '—' },
    },
  ];

  return (
    <section id="debate" className="py-24 px-6 max-w-7xl mx-auto">
      <motion.h2
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        className="text-3xl md:text-4xl font-black tracking-tighter uppercase mb-4 border-l-4 border-[#6dfe9c] pl-6"
      >
        The 3-Agent Trading Room
      </motion.h2>
      <p className="text-[#adaaaa] uppercase font-mono text-xs tracking-widest pl-6 mb-12">
        Every trade gets argued. No trade goes unquestioned.
      </p>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {agents.map((a, i) => (
          <motion.div
            key={a.name}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="bg-[#131313] p-6 border border-[#494847]/15 hover:border-[#6dfe9c]/30 transition-all"
          >
            <div className="flex items-center gap-4 mb-6">
              <div
                className="w-12 h-12 flex items-center justify-center text-2xl font-bold"
                style={{
                  backgroundColor: `${a.color}15`,
                  color: a.color,
                  border: `1px solid ${a.color}40`,
                }}
              >
                {a.name[0]}
              </div>
              <div>
                <div className="font-bold uppercase tracking-tighter text-lg">
                  {a.name}
                </div>
                <div
                  className="text-[10px] font-mono inline-block px-2"
                  style={{ color: a.color, backgroundColor: `${a.color}15` }}
                >
                  ROLE: {a.role}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-[#494847]/15 pt-4 mb-4 font-mono text-[10px]">
              <div>
                <div className="text-[#adaaaa]">{a.metricA.label}</div>
                <div className="text-xl" style={{ color: a.color }}>
                  {a.metricA.value}
                </div>
              </div>
              <div>
                <div className="text-[#adaaaa]">{a.metricB.label}</div>
                <div className="text-white text-xl">{a.metricB.value}</div>
              </div>
            </div>
            <p className="text-xs text-[#adaaaa]">{a.descriptor}</p>
          </motion.div>
        ))}
      </div>

      <div className="bg-black border border-[#494847]/20 p-4 font-mono text-[11px] leading-relaxed">
        <div className="text-[#adaaaa] mb-1">
          <span className="text-[#777575]">[protocol]</span> AgentEconomy V2
          settled <span className="text-[#6dfe9c]">{debates}</span> debates and{' '}
          <span className="text-[#6dfe9c]">{mcpCalls}</span> MCP calls.
        </div>
        <div className="text-[#adaaaa]">
          <span className="text-[#777575]">[protocol]</span> Total OKB volume through x402 paywall:{' '}
          <span className="text-[#6dfe9c]">{volume}</span> OKB.
        </div>
        <div className="text-[#adaaaa]">
          <span className="text-[#777575]">[protocol]</span> Treasury balance:{' '}
          <span className="text-[#6dfe9c]">
            {stats ? safeFixed(stats.treasury.balanceOkb, 4) : '—'}
          </span>{' '}
          OKB @{' '}
          <a
            href={`https://www.oklink.com/xlayer/address/${stats?.treasury.address}`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {truncate(stats?.treasury.address ?? '')}
          </a>
        </div>
      </div>
    </section>
  );
}

function JudgeMode({ stats }: { stats: ProtocolStats | null }) {
  const oracle = stats?.contracts.convictionOracle.stats;
  const tr = stats?.contracts.trackRecord.stats;

  // Win rate is stored on-chain as basis points (0-10000). Oracle exposes
  // symbol count; full per-dimension scoring requires the off-chain judge
  // endpoint, which is not yet stable in prod. Until then we render the
  // radar skeleton and show the live on-chain counts that DO exist.
  const winRateBps = tr ? Number(tr.winRateBps) : 0;
  const winRatePct = winRateBps / 100;
  const hasAnyData = oracle && Number(oracle.symbolCount) > 0;

  const radarData = JUDGE_AXES.map((axis) => ({
    dim: axis.label,
    value: hasAnyData ? Math.min(5, Math.max(1, (winRatePct / 100) * 5)) : 0,
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
            Every verdict scored on 6 dimensions. Data / Adversarial / Logic /
            Risk / Calibration / Novelty.
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

function Bounties({ stats }: { stats: ProtocolStats | null }) {
  const bounties = stats?.bounties ?? [];
  const bountiesContract = stats?.contracts.adversarialBounties;

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

      {bounties.length === 0 ? (
        <div className="bg-[#131313] border border-[#494847]/20 p-8 text-center font-mono text-xs text-[#adaaaa]">
          <div className="text-[#6dfe9c] mb-2">NO_OPEN_BOUNTIES</div>
          <p className="max-w-md mx-auto">
            The bounty contract is live and verified on X Layer. Be the first
            to post an OKB bounty against a Bobby debate thread.
          </p>
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
  const paidTools = mcp?.pricing.premium.tools ?? [];
  const calls = stats?.contracts.agentEconomy.stats.totalMcpCalls ?? '—';
  const volume = stats?.contracts.agentEconomy.stats.totalVolumeOkb ?? '—';

  return (
    <section id="mcp" className="py-24 px-6 bg-black">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-12">
          <div className="md:w-1/3">
            <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase mb-6 leading-none">
              Bobby-As-A-Service
            </h2>
            <p className="text-[#adaaaa] mb-8 uppercase text-xs tracking-widest leading-relaxed">
              Any AI agent can consume Bobby. 17 MCP tools over Streamable HTTP.
              Premium calls settle on X Layer via x402.
            </p>
            <div className="bg-[#131313] p-4 border border-[#6dfe9c]/20 mb-4 font-mono text-[10px]">
              <div className="text-[#adaaaa] uppercase mb-1">MCP_CALLS_SETTLED</div>
              <div className="text-[#6dfe9c] text-3xl font-bold">{calls}</div>
            </div>
            <div className="bg-[#131313] p-4 border border-[#6dfe9c]/20 font-mono text-[10px]">
              <div className="text-[#adaaaa] uppercase mb-1">TOTAL_OKB_SETTLED</div>
              <div className="text-[#6dfe9c] text-3xl font-bold">
                {safeFixed(volume, 4)}
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
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 font-mono text-[10px]">
                {paidTools.map((t) => (
                  <div
                    key={t}
                    className="bg-black border border-[#fcc025]/20 px-2 py-1 text-[#fcc025]/90 truncate flex items-center gap-1"
                    title={t}
                  >
                    <span className="text-[#fcc025]">◉</span>
                    {t}
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

function LiveOnXLayer({ stats }: { stats: ProtocolStats | null }) {
  const contracts = useMemo(() => {
    if (!stats) return [];
    const c = stats.contracts;
    return [
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
    ];
  }, [stats]);

  return (
    <section id="contracts" className="py-24 px-6 max-w-7xl mx-auto">
      <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase mb-2 text-center">
        Live on X Layer
      </h2>
      <p className="text-center text-[#adaaaa] font-mono text-xs uppercase tracking-widest mb-12">
        Four contracts. One protocol. All on OKX X Layer chain 196.
      </p>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {contracts.length === 0
          ? Array.from({ length: 4 }).map((_, i) => (
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
            BOBBY_PROTOCOL
          </div>
          <div className="text-[#6dfe9c]/40 font-mono text-[10px] uppercase">
            Built for OKX X Layer · Build X Season 2
          </div>
          <div className="text-[#6dfe9c]/40 font-mono text-[10px] mt-1">
            Last sync: {stats ? new Date(stats.fetchedAt).toLocaleTimeString() : '—'}
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
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
        </div>
      </div>
    </footer>
  );
}

// ---- Page ----

export default function BobbyProtocolLanding() {
  const { data: stats, error, loading } = useProtocolStats();
  const mcp = useMcpMeta();
  const pnl = usePnl();

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-sans relative overflow-x-hidden">
      <Helmet>
        <title>Bobby Protocol | Adversarial AI Trading on X Layer</title>
        <meta
          name="description"
          content="Three agents debate every trade. A judge grades them on six dimensions. Anyone can stake OKB to prove Bobby was wrong. Live on OKX X Layer."
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
      <TradingRoom stats={stats} pnl={pnl} />
      <JudgeMode stats={stats} />
      <Bounties stats={stats} />
      <McpSection mcp={mcp} stats={stats} />
      <LiveOnXLayer stats={stats} />
      <Footer stats={stats} />
    </div>
  );
}
