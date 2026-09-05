import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  CircleDollarSign,
  Database,
  Github,
  Menu,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Twitter,
  X,
} from 'lucide-react';

type Price = { symbol: string; price: number; change24h: number };

interface ProtocolStats {
  fetchedAt?: string;
  chain?: { id?: number; name?: string; nativeSymbol?: string; explorerUrl?: string; blockNumber?: number };
  treasury?: { balanceNative?: string };
  contracts?: {
    agentEconomy?: { address?: string; stats?: { totalDebates?: string; totalMcpCalls?: string; totalVolumeNative?: string } };
    convictionOracle?: { address?: string; stats?: { symbolCount?: string } };
    trackRecord?: { address?: string; stats?: { totalTrades?: string; totalCommitments?: string; winRateBps?: string } };
    adversarialBounties?: { address?: string; totalPosted?: number; verified?: boolean; minBounty?: { minBountyNative?: string } };
    hardnessRegistry?: { address?: string; agentRegistered?: boolean };
    agentRegistry?: { address?: string; type?: string; agents?: number };
  };
  protocolTotals?: { totalInteractions?: number; mcpPayments?: number };
  onchainRecord?: { commitmentsCreated?: number; decisionsResolved?: number; pending?: number; winRate?: number | null };
  debateActivity?: {
    totalDebates?: number;
    commitmentsCreated?: number;
    decisionsResolved?: number;
    expired?: number;
    pending?: number;
    wins?: number;
    losses?: number;
    winRate?: number;
    resolutionRate?: number;
  };
  market?: { prices?: Price[] };
}

interface McpMeta {
  pricing?: {
    free?: string[];
    premium?: { tools?: string[]; price?: string; settlementContract?: string };
  };
}

function useMcpMeta() {
  const [meta, setMeta] = useState<McpMeta | null>(null);
  useEffect(() => {
    fetch('/api/mcp-bobby', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: McpMeta) => setMeta(payload))
      .catch(() => setMeta(null));
  }, []);
  return meta;
}

interface ActivityItem {
  agent?: string;
  tool?: string;
  paid?: boolean;
  timestamp?: string | null;
  status?: string | null;
  source?: 'commerce' | 'onchain' | 'bounty' | string;
  txHash?: string | null;
}

const formatNumber = (value: unknown, fallback = '—') => {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-US') : fallback;
};

const price = (stats: ProtocolStats | null, symbol: string) =>
  stats?.market?.prices?.find((item) => item.symbol === symbol);

function useProtocolStats() {
  const [stats, setStats] = useState<ProtocolStats | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/bobby-protocol-stats', { cache: 'no-store' });
      if (response.ok) setStats((await response.json()) as ProtocolStats);
    } catch {
      // The page remains useful as a product overview when live RPC data is unavailable.
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return stats;
}

function useActivity() {
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/activity?limit=8', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Activity endpoint returned ${response.status}`);
      const payload = (await response.json()) as { feed?: ActivityItem[] };
      setActivity(payload.feed ?? []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { activity, isLoading, error, refresh };
}

function BrandMark() {
  return (
    <a href="/protocol" className="flex items-center gap-3 text-white" aria-label="Bobby Protocol home">
      <span className="relative grid h-10 w-10 place-items-center rounded-[14px] border border-[#8fb6ff]/45 bg-[radial-gradient(circle_at_30%_20%,#8eb6ff_0%,#2670ff_28%,#0052ff_62%,#0035b8_100%)] text-white shadow-[0_0_30px_rgba(0,82,255,.38)]">
        <span className="pointer-events-none absolute -inset-1 rounded-[17px] border border-[#0052ff]/30 rotate-[-18deg]" />
        <span className="pointer-events-none absolute -right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#d9e6ff] shadow-[0_0_8px_#d9e6ff]" />
        <span className="relative text-[21px] font-black leading-none tracking-[-0.12em]">B</span>
      </span>
      <span className="text-[15px] font-extrabold tracking-[-0.045em]">Bobby Protocol</span>
    </a>
  );
}

// Full-bleed section background: video on md+, blurred still on mobile (saves data, avoids
// mobile autoplay quirks). Poster JPGs are pre-blurred frames of the same videos.
function SectionMedia({ name, className = '' }: { name: string; className?: string }) {
  return (
    <>
      <img
        src={`/posters/${name}.jpg`}
        alt=""
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full object-cover md:hidden ${className}`}
      />
      <video
        className={`absolute inset-0 hidden h-full w-full object-cover md:block ${className}`}
        src={`/videos/${name}.mp4`}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      />
    </>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border-t border-white/15 pt-4">
      <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{label}</div>
      <div className="text-3xl font-extrabold tracking-[-0.07em] text-white">{value}</div>
      <div className="mt-1 text-xs text-white/40">{detail}</div>
    </div>
  );
}

export default function BobbyProtocolLanding() {
  const stats = useProtocolStats();
  const mcp = useMcpMeta();
  const { activity, isLoading: isActivityLoading, error: activityError, refresh: refreshActivity } = useActivity();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState<'all' | 'settled' | 'recorded'>('all');
  const btc = price(stats, 'BTC');
  // Debates, decisions and win rate come from the public resolution ledger.
  // MCP calls and interactions come from AgentEconomy on Base mainnet. Each
  // row states its provenance so historical outcomes are not mixed with live
  // contract counters.
  const publicRecord = stats?.debateActivity;
  const totalDebates = publicRecord?.totalDebates ?? stats?.contracts?.agentEconomy?.stats?.totalDebates;
  const liveChainDebates = stats?.contracts?.agentEconomy?.stats?.totalDebates;
  const totalMcpCalls = stats?.contracts?.agentEconomy?.stats?.totalMcpCalls;
  const onchainRecord = stats?.onchainRecord;
  const totalTrades = publicRecord?.commitmentsCreated ?? stats?.contracts?.trackRecord?.stats?.totalTrades;
  const totalInteractions = stats?.protocolTotals?.totalInteractions;
  const winRate = publicRecord?.decisionsResolved ? publicRecord.winRate : null;

  // Audit Base r4: a percentage over a tiny sample reads as skill when it is
  // noise. Below this many decided outcomes we show raw counts, never a rate.
  const WIN_RATE_MIN_SAMPLE = 20;
  const formatWinRate = (
    rate: number | null | undefined,
    resolved: number | null | undefined,
    wins?: number | null,
    losses?: number | null,
  ) => {
    if (rate === null || rate === undefined || !resolved) return '—';
    if (resolved < WIN_RATE_MIN_SAMPLE) {
      return wins !== undefined && wins !== null && losses !== undefined && losses !== null
        ? `${wins}W / ${losses}L`
        : `n=${resolved}`;
    }
    return `${Number(rate).toFixed(1)}% (n=${resolved})`;
  };
  const chainLabel = stats?.chain?.name || 'Base';
  const provenanceNote = `Debates, decisions and win rate: public resolution ledger. MCP calls and interactions: AgentEconomy on ${chainLabel}${liveChainDebates !== undefined ? ` (${formatNumber(liveChainDebates, '0')} debates settled there so far)` : ''}.`;
  const nativeSymbol = stats?.chain?.nativeSymbol || 'ETH';
  const telemetryUpdatedAt = stats?.fetchedAt
    ? new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(stats.fetchedAt))
    : null;

  const explorerAddressUrl = `${stats?.chain?.explorerUrl || 'https://basescan.org'}/address`;
  const c = stats?.contracts;
  const proofPoints = [
    {
      label: 'On-chain record',
      value: formatWinRate(onchainRecord?.winRate, onchainRecord?.decisionsResolved),
      detail: onchainRecord && onchainRecord.available !== false
        ? `${formatNumber(onchainRecord.decisionsResolved, '0')} resolved · ${formatNumber(onchainRecord.pending, '0')} pending · ${formatNumber(onchainRecord.commitmentsCreated, '0')} commitments`
        : onchainRecord ? 'TrackRecord unavailable right now.' : 'Waiting for the TrackRecord contract.',
      proof: 'TrackRecord contract',
      href: `${explorerAddressUrl}/${c?.trackRecord?.address ?? ''}`,
    },
    {
      label: 'Public debate ledger',
      value: publicRecord ? `${formatNumber(publicRecord.decisionsResolved, '0')} resolved` : '—',
      detail: publicRecord
        ? `${formatNumber(publicRecord.pending, '0')} pending · ${formatNumber(publicRecord.expired, '0')} expired · ${formatNumber(publicRecord.wins, '0')}W / ${formatNumber(publicRecord.losses, '0')}L · ${publicRecord.winRate?.toFixed(1)}%`
        : 'Waiting for the public resolution ledger.',
      proof: 'Resolution ledger',
      href: '#what-it-does',
    },
    {
      label: 'Adversarial bounties',
      value: formatNumber(c?.adversarialBounties?.totalPosted),
      detail: 'Open bounties paid for breaking Bobby\u2019s own reasoning. Being wrong in public is part of the design.',
      proof: 'AdversarialBounties contract',
      href: `${explorerAddressUrl}/${c?.adversarialBounties?.address ?? ''}`,
    },
    {
      label: 'Contracts live',
      value: '6',
      detail: 'Registry, economy, oracle, track record, bounties and identity — all deployed and explorer-verified.',
      proof: 'AgentEconomy V2 contract',
      href: `${explorerAddressUrl}/${c?.agentEconomy?.address ?? ''}`,
    },
  ];

  const navItems = [
    ['Verified calls', '/protocol/calls'],
    ['The rules', '#rules'],
    ['The procedure', '#how-it-works'],
    ['Integration', '#for-agents'],
    ['The record', '#contracts'],
    ['The app', '/app'],
  ];

  const filteredActivity = useMemo(() => {
    const list = activityFilter === 'all'
      ? activity
      : activity.filter((item) => (activityFilter === 'settled' ? item.paid : !item.paid));
    return list.slice(0, 6);
  }, [activity, activityFilter]);

  const marqueeItems = [
    ['Bobby is online', true],
    [btc ? `BTC $${btc.price.toLocaleString('en-US')}` : 'BTC —', false],
    [stats?.chain?.blockNumber ? `${chainLabel} block ${formatNumber(stats.chain.blockNumber)}` : 'On-chain verification', false],
    ['Every thesis gets challenged', false],
    ['Proof-of-debate', true],
    [`${formatNumber(totalTrades, '—')} decisions committed`, false],
  ] as const;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#050505] text-white selection:bg-[#0052ff] selection:text-white">
      <Helmet>
        <title>Bobby Protocol — Refuted before execution</title>
        <meta name="description" content="The verification layer for financial intelligence. Every decision is refuted before execution and published before its outcome is known." />
      </Helmet>

      <div className="pointer-events-none fixed inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:52px_52px]" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#050505]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 lg:px-8">
          <BrandMark />
          <nav className="hidden items-center gap-9 md:flex">
            {navItems.map(([label, href]) => <a key={href} href={href} className="font-mono text-xs uppercase tracking-[0.15em] text-white/55 transition hover:text-white">{label}</a>)}
            <a href="/protocol/docs" className="font-mono text-xs uppercase tracking-[0.15em] text-white/55 transition hover:text-white">Docs</a>
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <a href="https://github.com/anthonysurfermx/Bobby-Agent-Trader" target="_blank" rel="noreferrer" className="rounded-full p-2 text-white/45 transition hover:bg-white/10 hover:text-white"><Github className="h-4 w-4" /></a>
            <a href="/agentic-world/bobby" className="rounded-lg bg-white px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.15em] text-black transition hover:bg-[#0052ff] hover:text-white">Try Bobby</a>
          </div>
          <button onClick={() => setMenuOpen((open) => !open)} className="rounded-full p-2 md:hidden" aria-label="Toggle navigation">
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && <nav className="border-t border-white/10 bg-[#0a0a0a] px-5 py-4 md:hidden">{navItems.map(([label, href]) => <a key={href} href={href} onClick={() => setMenuOpen(false)} className="block py-3 font-mono text-xs uppercase tracking-[0.15em] text-white/70">{label}</a>)}<a href="/agentic-world/bobby" className="mt-2 block rounded-lg bg-white px-5 py-3 text-center font-mono text-xs font-bold uppercase tracking-[0.15em] text-black">Try Bobby</a></nav>}
      </header>

      <main className="relative">
        <section className="relative isolate min-h-[calc(100vh-72px)] overflow-hidden bg-[#050505] text-white">
          <SectionMedia name="hero" className="opacity-55 grayscale contrast-125" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,5,.96)_0%,rgba(5,5,5,.7)_42%,rgba(5,5,5,.3)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_46%,rgba(0,82,255,.4),transparent_35%)]" />
          <div className="relative z-10 mx-auto flex min-h-[calc(100vh-72px)] max-w-7xl flex-col justify-center px-5 pb-20 pt-20 lg:px-8 lg:pb-28 lg:pt-24">
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55 }}>
              <a href="/agentic-world/bobby/history" className="mb-8 inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#7da6ff] transition hover:text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0052ff]" />The verification layer for financial intelligence <span aria-hidden>›</span>
              </a>
              <h1 className="max-w-4xl text-[clamp(2.4rem,5.2vw,5rem)] font-extrabold leading-[.96] tracking-[-0.085em]">No decision is approved<br />without being <span className="text-[#0052ff]">refuted.</span></h1>
              <p className="mt-8 max-w-2xl text-lg leading-8 text-white/60 md:text-xl">Every idea follows a fixed procedure — case, refutation, risk gate and verdict — and the verdict is published on Base before any outcome exists to justify it.</p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <a href="/agentic-world/bobby" className="group inline-flex items-center justify-center gap-3 rounded-lg bg-white px-8 py-4 font-mono text-sm font-bold uppercase tracking-[0.15em] text-black transition hover:bg-[#0052ff] hover:text-white">Inspect a verdict <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></a>
                <a href="#how-it-works" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-8 py-4 font-mono text-sm font-bold uppercase tracking-[0.15em] text-white backdrop-blur transition hover:bg-white/20">See the procedure <ChevronDown className="h-4 w-4" /></a>
              </div>
              <div className="mt-14 grid max-w-xl grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-4">
                {[
                  ['Debates', formatNumber(totalDebates)],
                  ['Decisions', formatNumber(totalTrades)],
                  ['MCP calls', formatNumber(totalMcpCalls)],
                  ['Win rate', formatWinRate(winRate, publicRecord?.decisionsResolved, publicRecord?.wins, publicRecord?.losses)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</div>
                    <div className="font-mono text-3xl font-bold tracking-[-0.04em] text-white md:text-4xl">{value}</div>
                  </div>
                ))}
              </div>
              <p className="mt-4 max-w-xl font-mono text-[10px] leading-5 tracking-[0.04em] text-white/35">{provenanceNote}</p>
            </motion.div>
          </div>
        </section>

        <div className="border-y border-white/10 bg-[#0a0a14] py-4 overflow-hidden">
          <div className="flex gap-12 whitespace-nowrap animate-marquee font-mono text-xs uppercase tracking-[0.18em] text-white/50">
            {[0, 1].map((dup) => (
              <div key={dup} className="flex gap-12 shrink-0">
                {marqueeItems.map(([label, highlight], index) => (
                  <span key={`${dup}-${index}`} className={highlight ? 'text-[#7da6ff]' : undefined}>{label}</span>
                ))}
              </div>
            ))}
          </div>
        </div>


        <section id="rules" className="relative overflow-hidden border-b border-white/10 bg-[#050505]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,82,255,.10),transparent_44%)]" />
          <div className="relative mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
            <div className="mb-8 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">The two rules</div>
            <div className="border-t border-white/15">
              {[
                ['I', 'No idea is approved without an independent system working against it.'],
                ['II', 'No verdict is published after its outcome is known.'],
              ].map(([numeral, rule]) => (
                <div key={numeral} className="grid grid-cols-[3rem_1fr] gap-4 border-b border-white/10 py-6 md:grid-cols-[5rem_1fr]">
                  <span className="font-mono text-xs uppercase tracking-[0.18em] text-white/35">{numeral}</span>
                  <p className="max-w-3xl text-lg leading-8 tracking-[-0.01em] text-white/85 md:text-xl">{rule}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-white/35">
              Refuted before execution. Published before the outcome.
            </p>
          </div>
        </section>

        <section className="relative overflow-hidden bg-[#050505]" id="architecture">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(0,82,255,.12),transparent_45%)]" />
          <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="mb-12 flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">01 / The procedure</div>
                <h2 className="max-w-xl text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">One procedure,<br />end to end.</h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-white/45">Four checks before capital moves.</p>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              className="overflow-hidden rounded-2xl border border-white/10 shadow-[0_30px_100px_rgba(0,82,255,0.18)]"
            >
              <video
                className="h-full w-full"
                src="/videos/architecture.mp4"
                autoPlay
                muted
                loop
                playsInline
                poster="/posters/architecture.jpg"
              />
            </motion.div>
          </div>
        </section>

        <section className="relative isolate min-h-[940px] overflow-hidden bg-[#050505] text-white" id="how-it-works">
          <SectionMedia name="orb" className="scale-105 opacity-75 blur-[2px] saturate-150" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,5,.88)_0%,rgba(5,5,5,.38)_55%,rgba(5,5,5,.24)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,5,.25)_0%,rgba(5,5,5,.2)_48%,rgba(5,5,5,.98)_88%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_67%_30%,rgba(0,82,255,.28),transparent_42%)]" />

          <div className="relative z-10 mx-auto max-w-7xl px-5 pb-20 pt-24 lg:px-8 lg:pb-28 lg:pt-32">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              className="max-w-3xl"
            >
              <div className="mb-5 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">02 / Before capital moves</div>
              <h2 className="text-5xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-7xl">
                No blind decisions.<br />
                <span className="text-white/72">Just four checks.</span>
              </h2>
              <p className="mt-7 max-w-xl text-base leading-7 text-white/55 md:text-lg">
                Every idea must survive its own refutation before it moves capital.
              </p>
            </motion.div>

            <div className="mt-14 grid grid-cols-2 gap-x-8 gap-y-7 md:grid-cols-4 lg:max-w-5xl">
              {[
                ['Debates', formatNumber(totalDebates)],
                ['Decisions', formatNumber(totalTrades)],
                ['Agent calls', formatNumber(totalMcpCalls)],
                ['Interactions', formatNumber(totalInteractions)],
              ].map(([label, value]) => (
                <div key={label} className="border-l border-white/20 pl-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</div>
                  <div className="mt-2 font-mono text-2xl tracking-[-0.04em] text-white md:text-3xl">{value}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 max-w-3xl font-mono text-[10px] leading-5 tracking-[0.04em] text-white/35">{provenanceNote}</p>

            <div className="mt-20 flex flex-col gap-4 border-t border-white/10 pt-6 lg:mt-24 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {['All stages', 'Signal', 'Debate', 'Risk gate', 'Proof'].map((label, index) => (
                  <span
                    key={label}
                    className={`shrink-0 rounded-md px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] ${index === 0 ? 'bg-white text-black' : 'border border-white/10 bg-white/[0.07] text-white/55 backdrop-blur-md'}`}
                  >
                    {label}
                  </span>
                ))}
              </div>
              <div className="flex w-fit items-center gap-3 rounded-md border border-white/10 bg-white/[0.07] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/60 backdrop-blur-md">
                Live pipeline <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0052ff]" />
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                { icon: Bot, eyebrow: '01 / Thesis', title: 'Find the idea', text: 'A clear setup with a clear invalidation.', state: 'PROPOSED', step: '01' },
                { icon: ShieldCheck, eyebrow: '02 / Debate', title: 'Attack the idea', text: 'Red Team looks for what can break it.', state: 'CHALLENGED', step: '02' },
                { icon: CircleDollarSign, eyebrow: '03 / Risk veto', title: 'Protect the capital', text: 'Risk can pass, pause or block.', state: 'GATED', step: '03' },
                { icon: Check, eyebrow: '04 / Public record', title: 'Leave the record', text: 'The decision is visible before the result.', state: 'RECORDED', step: '04' },
              ].map(({ icon: Icon, eyebrow, title, text, state, step }, index) => (
                <motion.article
                  key={title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.07 }}
                  className="group flex min-h-[310px] flex-col rounded-xl border border-white/10 bg-[#101014]/80 p-6 shadow-[0_20px_50px_rgba(0,0,0,.35)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-[#0052ff]/60 hover:bg-[#111726]/90"
                >
                  <div className="mb-8 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white/45">
                      <span className="grid h-7 w-7 place-items-center rounded-md bg-[#0052ff]/20 text-[#7da6ff]"><Icon className="h-3.5 w-3.5" /></span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.13em]">{eyebrow}</span>
                    </div>
                    <span className="font-mono text-[10px] text-white/25">{step}</span>
                  </div>
                  <h3 className="text-xl font-bold leading-tight tracking-[-0.04em] text-white/95">{title}</h3>
                  <p className="mt-4 text-sm leading-6 text-white/45">{text}</p>
                  <div className="mt-auto flex items-center justify-between border-t border-white/10 pt-5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#7da6ff]">{state}</span>
                    <span className="h-2 w-2 rounded-full bg-[#0052ff] shadow-[0_0_14px_rgba(0,82,255,.85)]" />
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden border-y border-white/10 bg-[#08080a]" id="capabilities">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,82,255,.14),transparent_42%)]" />
          <div className="relative mx-auto max-w-[1440px] px-5 py-24 lg:px-8 lg:py-32">
            <div className="mb-14 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div>
                <div className="mb-5 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">03 / Capabilities</div>
                <h2 className="max-w-4xl text-5xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-7xl">
                  Four checks.<br />One clear decision.
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-white/45">
                Debate, risk, proof and a simple interface.
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {[
                {
                  title: 'Identity',
                  description: 'Every decision has a named agent, signer and context. The record follows the agent.',
                  image: '/images/protocol/agent-identity.jpg',
                  alt: 'Synthetic human profile visible through textured cobalt glass',
                  telemetry: ['identity.issue', 'signer  bobby.base.eth', 'reputation  portable', 'status  recorded'],
                },
                {
                  title: 'Adversarial debate',
                  description: 'Alpha proposes the thesis. Red Team attacks the assumptions. CIO resolves both into one decision.',
                  image: '/images/protocol/adversarial-debate.jpg',
                  alt: 'Three silhouettes debating behind illuminated blue glass',
                  telemetry: ['debate.open  round_03', 'agents  alpha · red · cio', 'counterpoints  active', 'consensus  pending'],
                },
                {
                  title: 'Risk gate',
                  description: 'Bobby checks size, downside and invalidation before capital moves. Risk can pass, pause or block.',
                  image: '/images/protocol/risk-gate.jpg',
                  alt: 'Human hand meeting a luminous blue glass barrier',
                  telemetry: ['risk.inspect  intent', 'exposure  bounded', 'invalidation  signed', 'gate  pass · park · block'],
                },
                {
                  title: 'Proof',
                  description: 'The thesis and decision are committed on Base before the outcome. Confirmed swaps enter a chain-ordered receipt ledger with FIFO lots and wallet-scoped PnL.',
                  image: '/images/protocol/onchain-proof.jpg',
                  alt: 'Transparent cobalt glass monolith containing a sealed point of light',
                  telemetry: ['proof.commit  thesis_hash', 'chain  base · 8453', 'outcome  unresolved', 'record  immutable'],
                },
              ].map((capability, index) => (
                <motion.article
                  key={capability.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ delay: index * 0.06 }}
                  className="group relative min-h-[430px] overflow-hidden rounded-xl border border-white/10 bg-[#0b0b0f] md:min-h-[500px]"
                >
                  <motion.img
                    src={capability.image}
                    alt={capability.alt}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                    initial={{ opacity: 0.7, scale: 1.08 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.06 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: 1.2, delay: index * 0.05, ease: 'easeOut' }}
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,7,.96)_0%,rgba(5,5,7,.72)_42%,rgba(5,5,7,.08)_100%)]" />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,7,.22)_0%,rgba(5,5,7,.05)_45%,rgba(5,5,7,.94)_100%)]" />
                  <div className="absolute inset-0 opacity-0 ring-1 ring-inset ring-[#0052ff]/70 transition-opacity duration-300 group-hover:opacity-100" />

                  <div className="relative z-10 flex min-h-[430px] max-w-[74%] flex-col p-7 md:min-h-[500px] md:p-9">
                    <div className="mb-5 flex items-center gap-3">
                      <span className="h-2 w-2 rounded-full bg-[#0052ff] shadow-[0_0_16px_rgba(0,82,255,.9)]" />
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#7da6ff]">Capability 0{index + 1}</span>
                    </div>
                    <h3 className="text-3xl font-extrabold tracking-[-0.05em] md:text-4xl">{capability.title}</h3>
                    <p className="mt-5 max-w-lg text-sm leading-6 text-white/65 md:text-base md:leading-7">{capability.description}</p>

                    <div className="mt-auto space-y-1 font-mono text-[10px] leading-5 text-white/38 md:text-[11px]">
                      <div className="mb-2 text-[#7da6ff]">&gt; {capability.telemetry[0]}</div>
                      {capability.telemetry.slice(1).map((line) => <div key={line}>&nbsp;&nbsp;{line}</div>)}
                      <div className="pt-1 text-white/65">✓ system ready</div>
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative isolate overflow-hidden" id="for-agents">
          <SectionMedia name="nebula" className="opacity-50" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#050505]/60 to-[#050505]" />
          <div className="relative z-10 mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
          <div className="mb-12 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">04 / Integration</div><h2 className="max-w-xl text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">Give any agent<br />a second layer.</h2></div><p className="max-w-sm text-sm leading-6 text-white/45">Connect over MCP.</p></div>
          <div className="grid items-start gap-5 md:grid-cols-[1.55fr_1fr]">
            <a
              href="/protocol/docs"
              className="group relative min-h-[470px] overflow-hidden rounded-3xl border border-white/10 bg-[#08080b] text-white shadow-[0_20px_60px_rgba(0,0,0,.28)] transition duration-300 hover:-translate-y-1 hover:border-[#0052ff]/60 hover:shadow-[0_24px_70px_rgba(0,82,255,.2)]"
            >
              <motion.img
                src="/images/protocol/agent-interface.jpg"
                alt="Synthetic agent connecting to a protocol through textured cobalt glass"
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
                initial={{ opacity: 0.72, scale: 1.08 }}
                whileInView={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.06 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,4,7,.98)_0%,rgba(4,4,7,.82)_40%,rgba(4,4,7,.12)_100%)]" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,4,7,.2)_0%,rgba(4,4,7,.05)_45%,rgba(4,4,7,.94)_100%)]" />
              <div className="absolute inset-0 opacity-0 ring-1 ring-inset ring-[#0052ff]/70 transition-opacity group-hover:opacity-100" />
              <div className="relative z-10 flex min-h-[470px] max-w-[76%] flex-col p-8 md:p-10">
                <div className="flex items-start justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl border border-[#0052ff]/30 bg-[#0052ff]/20 backdrop-blur"><Sparkles className="h-5 w-5 text-[#7da6ff]" /></span>
                  <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
                </div>
                <div className="mt-auto">
                  <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#7da6ff]">Agent interface</div>
                  <h3 className="text-3xl font-extrabold tracking-[-0.06em] md:text-4xl">For agents</h3>
                  <p className="mt-4 max-w-sm text-sm leading-6 text-white/65">Connect over MCP. Request conviction, inspect proof, and build Bobby into your execution workflow.</p>
                  <div className="mt-8 font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#7da6ff]">Read the docs →</div>
                </div>
              </div>
            </a>

            <a
              href="/app"
              className="group relative min-h-[380px] overflow-hidden rounded-3xl border border-white/10 bg-[#08080b] text-white shadow-[0_20px_60px_rgba(0,0,0,.28)] transition duration-300 hover:-translate-y-1 hover:border-[#0052ff]/60 hover:shadow-[0_24px_70px_rgba(0,82,255,.2)]"
            >
              <motion.img
                src="/images/protocol/human-interface.jpg"
                alt="A person reading a verdict on the Bobby iPhone app"
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
                initial={{ opacity: 0.72, scale: 1.08 }}
                whileInView={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.06 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,4,7,.98)_0%,rgba(4,4,7,.82)_40%,rgba(4,4,7,.12)_100%)]" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,4,7,.2)_0%,rgba(4,4,7,.05)_45%,rgba(4,4,7,.94)_100%)]" />
              <div className="absolute inset-0 opacity-0 ring-1 ring-inset ring-[#0052ff]/70 transition-opacity group-hover:opacity-100" />
              <div className="relative z-10 flex min-h-[380px] max-w-[76%] flex-col p-8 md:p-10">
                <div className="flex items-start justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl border border-[#0052ff]/30 bg-[#0052ff]/20 backdrop-blur"><Bot className="h-5 w-5 text-[#7da6ff]" /></span>
                  <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
                </div>
                <div className="mt-auto">
                  <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#7da6ff]">The app</div>
                  <h3 className="text-3xl font-extrabold tracking-[-0.06em] md:text-4xl">Bobby, on iPhone</h3>
                  <p className="mt-4 max-w-sm text-sm leading-6 text-white/65">The same record, in a voice you can talk to.</p>
                  <div className="mt-8 font-mono text-xs font-bold uppercase tracking-[0.14em] text-white">See the app →</div>
                </div>
              </div>
            </a>
          </div>
          </div>
        </section>

        <section className="relative overflow-hidden border-t border-white/10 bg-[#08080a]" id="what-it-does">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(0,82,255,.18),transparent_36%)]" />
          <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="mb-12 max-w-3xl">
              <div className="mb-5 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">05 / The outcome</div>
              <h2 className="text-5xl font-extrabold leading-[.96] tracking-[-0.08em] md:text-7xl">It turns an idea<br />into a decision.</h2>
              <p className="mt-7 max-w-xl text-base leading-7 text-white/55 md:text-lg">Bring a thesis. Bobby challenges it, checks the downside, and gives you one clear decision before the result.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { step: '01', title: 'Bring the idea', text: 'Start with a market thesis.' },
                { step: '02', title: 'Test the downside', text: 'Opposing agents look for what breaks it.' },
                { step: '03', title: 'Get the call', text: 'Pass, pause or block — with a public record.' },
              ].map((item) => (
                <div key={item.step} className="rounded-2xl border border-white/10 bg-white/[0.035] p-7 transition duration-300 hover:-translate-y-1 hover:border-[#0052ff]/60 hover:bg-[#0052ff]/[0.08]">
                  <div className="mb-12 font-mono text-sm font-bold text-[#7da6ff]">{item.step}</div>
                  <h3 className="text-2xl font-extrabold tracking-[-0.05em]">{item.title}</h3>
                  <p className="mt-3 max-w-xs text-sm leading-6 text-white/45">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden border-t border-white/10 bg-[#050505]" id="contracts">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,82,255,.1),transparent_45%)]" />
          <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
            <div className="mb-12 max-w-3xl">
              <div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">06 / Track record</div>
              <h2 className="text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">The record is public.<br />The live protocol is Base.</h2>
              <p className="mt-5 max-w-xl text-sm leading-6 text-white/45">
                Identity, debates, risk proofs and the execution receipt ledger now share one Base-only architecture. Wallets stay self-custodial: Bobby prepares bounded calldata, records confirmed receipts and never holds funds or exchange credentials.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {proofPoints.map((point, index) => (
                <motion.a
                  key={point.label}
                  href={point.href}
                  target="_blank"
                  rel="noreferrer"
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.06 }}
                  className="group flex flex-col rounded-2xl border border-white/10 bg-[#0b0b12]/80 p-7 transition hover:-translate-y-1 hover:border-[#0052ff]/60"
                >
                  <div className="mb-6 flex items-start justify-between">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{point.label}</span>
                    <ArrowRight className="h-3.5 w-3.5 -rotate-45 text-white/25 transition group-hover:text-[#7da6ff]" />
                  </div>
                  <div className="font-mono text-5xl font-bold tracking-[-0.05em] text-white">{point.value}</div>
                  <p className="mt-4 text-sm leading-6 text-white/50">{point.detail}</p>
                  <div className="mt-6 border-t border-white/10 pt-4 font-mono text-[11px] text-[#7da6ff]">{point.proof}</div>
                </motion.a>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] text-white/35">
              <span>Base · 8453</span>
              <a href={`${explorerAddressUrl}/${stats?.contracts?.trackRecord?.address ?? ''}`} target="_blank" rel="noreferrer" className="transition hover:text-[#7da6ff]">TrackRecord on Basescan ↗</a>
              <a href={`${explorerAddressUrl}/${stats?.contracts?.agentEconomy?.address ?? ''}`} target="_blank" rel="noreferrer" className="transition hover:text-[#7da6ff]">AgentEconomy on Basescan ↗</a>
              <a href="/protocol/heartbeat" className="transition hover:text-[#7da6ff]">Full contract heartbeat →</a>
            </div>
          </div>
        </section>


        <section className="relative overflow-hidden border-t border-white/10 bg-[#08080a]" id="limits">
          <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
            <div className="mb-10">
              <div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">07 / Scope and limits</div>
              <h2 className="text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">What the protocol<br />does not do.</h2>
            </div>
            <ul className="border-t border-white/10">
              {[
                'It holds no funds and accesses no third-party accounts.',
                'It places no orders. Execution belongs to whoever trades.',
                'It is not investment advice and promises no returns.',
                'A favorable verdict is not a buy recommendation. It is the record of an idea that survived its own refutation.',
              ].map((limit) => (
                <li key={limit} className="grid grid-cols-[3rem_1fr] gap-4 border-b border-white/10 py-5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#ff7a63]">No</span>
                  <span className="max-w-3xl text-sm leading-6 text-white/60">{limit}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-white/10 bg-[#0a0a0a]" aria-label="Protocol metrics"><div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-5 py-14 md:grid-cols-4 lg:grid-cols-8 lg:px-8"><Metric label="Commitments" value={formatNumber(publicRecord?.commitmentsCreated ?? totalTrades)} detail="created" /><Metric label="Resolved" value={formatNumber(publicRecord?.decisionsResolved)} detail="decisions" /><Metric label="Pending" value={formatNumber(publicRecord?.pending)} detail="no outcome yet" /><Metric label="Expired" value={formatNumber(publicRecord?.expired)} detail="never settled" /><Metric label="Wins / losses" value={publicRecord ? `${publicRecord.wins} / ${publicRecord.losses}` : '—'} detail="decisive outcomes" /><Metric label="Win rate" value={formatWinRate(winRate, publicRecord?.decisionsResolved, publicRecord?.wins, publicRecord?.losses)} detail={publicRecord?.decisionsResolved && publicRecord.decisionsResolved < WIN_RATE_MIN_SAMPLE ? `small sample (n=${publicRecord.decisionsResolved})` : 'over resolved'} /><Metric label="Resolution" value={publicRecord ? `${Number(publicRecord.resolutionRate).toFixed(1)}%` : '—'} detail="commitments with an outcome" /><Metric label="Interactions" value={formatNumber(totalInteractions)} detail="network" /></div></section>

        <footer className="border-t border-white/10 bg-[#050505]">
          <div className="mx-auto flex max-w-7xl flex-col gap-12 px-5 py-16 lg:px-8">
            <div className="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
              <div>
                <BrandMark />
                <p className="mt-5 max-w-xs text-sm leading-6 text-white/40">
                  The verification layer for financial intelligence. Every idea refuted before execution, every verdict published before its outcome.
                </p>
                <div className="mt-6 flex items-center gap-4">
                  <a href="https://twitter.com/bobbyprotocol" target="_blank" rel="noreferrer" aria-label="Twitter" className="text-white/40 transition hover:text-[#7da6ff]"><Twitter className="h-4 w-4" /></a>
                  <a href="https://github.com/anthonysurfermx/Bobby-Agent-Trader" target="_blank" rel="noreferrer" aria-label="GitHub" className="text-white/40 transition hover:text-[#7da6ff]"><Github className="h-4 w-4" /></a>
                </div>
              </div>
              {([
                ['Protocol', [
                  ['Architecture', '/protocol/architecture'],
                  ['Console', '/protocol/console'],
                  ['Sandbox', '/protocol/sandbox'],
                  ['Heartbeat', '/protocol/heartbeat'],
                  ['Network', '/protocol/network'],
                ]],
                ['Build', [
                  ['Docs', '/protocol/docs'],
                  ['Playbooks', '/protocol/playbooks'],
                  ['Harness', '/protocol/harness'],
                  ['MCP endpoint', '/protocol/docs'],
                ]],
                ['Bobby', [
                  ['War Room', '/agentic-world/bobby'],
                  ['Track record', '/agentic-world/bobby/history'],
                  ['Analytics', '/agentic-world/bobby/analytics'],
                  ['Agents', '/agentic-world/bobby/agents'],
                ]],
              ] as const).map(([group, links]) => (
                <div key={group}>
                  <div className="mb-5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">{group}</div>
                  <ul className="space-y-3">
                    {links.map(([label, href]) => (
                      <li key={`${label}-${href}`}>
                        <a href={href} className="text-sm text-white/60 transition hover:text-[#7da6ff]">{label}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/40 md:flex-row">
              <span>© 2026 Bobby Protocol</span>
              <span>Refuted before execution. Published before the outcome.</span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
