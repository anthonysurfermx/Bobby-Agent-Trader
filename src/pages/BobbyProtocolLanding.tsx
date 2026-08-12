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
  const totalDebates = stats?.contracts?.agentEconomy?.stats?.totalDebates;
  const totalMcpCalls = stats?.contracts?.agentEconomy?.stats?.totalMcpCalls;
  const publicRecord = stats?.debateActivity;
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
  const chainLabel = stats?.chain?.name || (stats?.chain?.id === 196 ? 'X Layer' : 'Network');
  const nativeSymbol = stats?.chain?.nativeSymbol || (stats?.chain?.id === 196 ? 'OKB' : 'ETH');
  const telemetryUpdatedAt = stats?.fetchedAt
    ? new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(stats.fetchedAt))
    : null;

  const explorerAddressUrl = `${stats?.chain?.explorerUrl || 'https://www.oklink.com/xlayer'}/address`;
  const c = stats?.contracts;
  const proofPoints = [
    {
      label: 'On-chain record',
      value: formatWinRate(onchainRecord?.winRate, onchainRecord?.decisionsResolved),
      detail: onchainRecord
        ? `${formatNumber(onchainRecord.decisionsResolved, '0')} resolved · ${formatNumber(onchainRecord.pending, '0')} pending · ${formatNumber(onchainRecord.commitmentsCreated, '0')} commitments`
        : 'Waiting for the TrackRecord contract.',
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
      href: '#activity',
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
    ['How it works', '#how-it-works'],
    ['Capabilities', '#capabilities'],
    ['For agents', '#for-agents'],
    ['Activity', '#activity'],
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
        <title>Bobby Protocol — Make the thesis earn it</title>
        <meta name="description" content="Before capital moves, Bobby makes the thesis earn it: adversarial debate, risk gates and a verifiable decision record." />
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
            <a href="/agentic-world/bobby" className="rounded-lg bg-white px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.15em] text-black transition hover:bg-[#0052ff] hover:text-white">Open War Room</a>
          </div>
          <button onClick={() => setMenuOpen((open) => !open)} className="rounded-full p-2 md:hidden" aria-label="Toggle navigation">
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && <nav className="border-t border-white/10 bg-[#0a0a0a] px-5 py-4 md:hidden">{navItems.map(([label, href]) => <a key={href} href={href} onClick={() => setMenuOpen(false)} className="block py-3 font-mono text-xs uppercase tracking-[0.15em] text-white/70">{label}</a>)}<a href="/agentic-world/bobby" className="mt-2 block rounded-lg bg-white px-5 py-3 text-center font-mono text-xs font-bold uppercase tracking-[0.15em] text-black">Open War Room</a></nav>}
      </header>

      <main className="relative">
        <section className="relative isolate min-h-[calc(100vh-72px)] overflow-hidden bg-[#050505] text-white">
          <SectionMedia name="hero" className="opacity-55 grayscale contrast-125" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,5,.96)_0%,rgba(5,5,5,.7)_42%,rgba(5,5,5,.3)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_46%,rgba(0,82,255,.4),transparent_35%)]" />
          <div className="relative z-10 mx-auto flex min-h-[calc(100vh-72px)] max-w-7xl flex-col justify-center px-5 pb-20 pt-20 lg:px-8 lg:pb-28 lg:pt-24">
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55 }}>
              <a href="/agentic-world/bobby/history" className="mb-8 inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#7da6ff] transition hover:text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0052ff]" />Accountability infrastructure for autonomous finance <span aria-hidden>›</span>
              </a>
              <h1 className="max-w-3xl text-[clamp(3.3rem,7vw,6.9rem)] font-extrabold leading-[.92] tracking-[-0.09em]">Make the <span className="text-[#0052ff]">thesis earn it.</span></h1>
              <p className="mt-8 max-w-xl text-lg leading-8 text-white/60 md:text-xl">Bobby is the accountability layer for autonomous finance. Three agents debate, risk gets a veto, and the decision leaves a proof trail before capital moves.</p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <a href="/agentic-world/bobby" className="group inline-flex items-center justify-center gap-3 rounded-lg bg-white px-8 py-4 font-mono text-sm font-bold uppercase tracking-[0.15em] text-black transition hover:bg-[#0052ff] hover:text-white">Inspect a decision <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></a>
                <a href="#how-it-works" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-8 py-4 font-mono text-sm font-bold uppercase tracking-[0.15em] text-white backdrop-blur transition hover:bg-white/20">See the gate <ChevronDown className="h-4 w-4" /></a>
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

        <section className="relative overflow-hidden bg-[#050505]" id="architecture">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(0,82,255,.12),transparent_45%)]" />
          <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="mb-12 flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">01 / Architecture</div>
                <h2 className="max-w-xl text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">One pipeline,<br />end to end.</h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-white/45">Signal → debate → risk gate → committed record. The accountability loop for autonomous finance.</p>
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
              <div className="mb-5 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">02 / The accountability loop</div>
              <h2 className="text-5xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-7xl">
                Decisions, never blind.<br />
                <span className="text-white/72">See Bobby in action.</span>
              </h2>
              <p className="mt-7 max-w-xl text-base leading-7 text-white/55 md:text-lg">
                Every proposal enters an adversarial pipeline. Agents debate it, risk challenges it, and the protocol commits the decision before the market can rewrite the story.
              </p>
            </motion.div>

            <div className="mt-14 grid grid-cols-2 gap-x-8 gap-y-7 md:grid-cols-4 lg:max-w-5xl">
              {[
                ['Total debates', formatNumber(totalDebates)],
                ['Verified decisions', formatNumber(totalTrades)],
                ['MCP calls', formatNumber(totalMcpCalls)],
                ['Network interactions', formatNumber(totalInteractions)],
              ].map(([label, value]) => (
                <div key={label} className="border-l border-white/20 pl-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</div>
                  <div className="mt-2 font-mono text-2xl tracking-[-0.04em] text-white md:text-3xl">{value}</div>
                </div>
              ))}
            </div>

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
                { icon: Bot, eyebrow: 'Alpha Hunter', title: 'Find the asymmetric setup', text: 'Market structure, momentum and live intelligence become a thesis with explicit invalidation.', state: 'SIGNAL READY', step: '01' },
                { icon: ShieldCheck, eyebrow: 'Red Team', title: 'Attack the thesis', text: 'The opposing agent searches for crowded positioning, weak assumptions and hidden downside.', state: 'CHALLENGED', step: '02' },
                { icon: CircleDollarSign, eyebrow: 'CIO + Risk', title: 'Gate the capital', text: 'Conviction, sizing and downside are reconciled. Pass, park or block — never force the trade.', state: 'RISK GATED', step: '03' },
                { icon: Check, eyebrow: 'Committed record', title: 'Commit before outcome', text: 'The decision and its rationale become inspectable before price reveals the answer. Market truth remains a separate claim.', state: 'PROOF TRAIL', step: '04' },
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
                <div className="mb-5 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">03 / Protocol capabilities</div>
                <h2 className="max-w-4xl text-5xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-7xl">
                  An agent-native decision layer,<br />everything it needs.
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-white/45">
                Four surfaces turn autonomous decisions from a black box into an inspectable, accountable system.
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {[
                {
                  title: 'Identity',
                  description: 'Every agent decision has an author. Every outcome builds reputation. Both follow the agent into its next call.',
                  image: '/images/protocol/agent-identity.jpg',
                  alt: 'Synthetic human profile visible through textured cobalt glass',
                  telemetry: ['identity.issue', 'signer  bobby.base.eth', 'reputation  portable', 'status  recorded'],
                },
                {
                  title: 'Adversarial debate',
                  description: 'Alpha proposes. Red Team attacks. The CIO resolves the disagreement into one explicit, accountable thesis.',
                  image: '/images/protocol/adversarial-debate.jpg',
                  alt: 'Three silhouettes debating behind illuminated blue glass',
                  telemetry: ['debate.open  round_03', 'agents  alpha · red · cio', 'counterpoints  active', 'consensus  pending'],
                },
                {
                  title: 'Risk gate',
                  description: 'Capital never moves on narrative alone. Sizing, downside and invalidation must survive the gate first.',
                  image: '/images/protocol/risk-gate.jpg',
                  alt: 'Human hand meeting a luminous blue glass barrier',
                  telemetry: ['risk.inspect  intent', 'exposure  bounded', 'invalidation  signed', 'gate  pass · park · block'],
                },
                {
                  title: 'Proof',
                  description: 'The protocol commits the decision before the outcome, creating an immutable track record without screenshots or hindsight.',
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
                  <img
                    src={capability.image}
                    alt={capability.alt}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.035]"
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
          <div className="mb-12 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">04 / Built for both sides</div><h2 className="max-w-xl text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">A better interface for capital.</h2></div><p className="max-w-sm text-sm leading-6 text-white/45">One decision layer. Two ways in.</p></div>
          <div className="grid gap-5 md:grid-cols-2">
            <a
              href="/agentic-world/bobby"
              className="group relative min-h-[470px] overflow-hidden rounded-3xl border border-white/10 bg-[#08080b] text-white shadow-[0_20px_60px_rgba(0,0,0,.28)] transition duration-300 hover:-translate-y-1 hover:border-[#0052ff]/60 hover:shadow-[0_24px_70px_rgba(0,82,255,.2)]"
            >
              <img
                src="/images/protocol/human-interface.jpg"
                alt="Human reviewing a decision through illuminated cobalt glass"
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.035]"
              />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,4,7,.98)_0%,rgba(4,4,7,.82)_40%,rgba(4,4,7,.12)_100%)]" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,4,7,.2)_0%,rgba(4,4,7,.05)_45%,rgba(4,4,7,.94)_100%)]" />
              <div className="absolute inset-0 opacity-0 ring-1 ring-inset ring-[#0052ff]/70 transition-opacity group-hover:opacity-100" />
              <div className="relative z-10 flex min-h-[470px] max-w-[76%] flex-col p-8 md:p-10">
                <div className="flex items-start justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl border border-[#0052ff]/30 bg-[#0052ff]/20 backdrop-blur"><Bot className="h-5 w-5 text-[#7da6ff]" /></span>
                  <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
                </div>
                <div className="mt-auto">
                  <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#7da6ff]">Human interface</div>
                  <h3 className="text-3xl font-extrabold tracking-[-0.06em] md:text-4xl">For humans</h3>
                  <p className="mt-4 max-w-sm text-sm leading-6 text-white/65">Open the War Room, watch the debate, and approve the move when the thesis earns it.</p>
                  <div className="mt-8 font-mono text-xs font-bold uppercase tracking-[0.14em] text-white">Enter War Room →</div>
                </div>
              </div>
            </a>

            <a
              href="/protocol/docs"
              className="group relative min-h-[470px] overflow-hidden rounded-3xl border border-white/10 bg-[#08080b] text-white shadow-[0_20px_60px_rgba(0,0,0,.28)] transition duration-300 hover:-translate-y-1 hover:border-[#0052ff]/60 hover:shadow-[0_24px_70px_rgba(0,82,255,.2)]"
            >
              <img
                src="/images/protocol/agent-interface.jpg"
                alt="Synthetic agent connecting to a protocol through textured cobalt glass"
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.035]"
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
          </div>
          </div>
        </section>

        <section className="relative isolate overflow-hidden bg-[#050505] text-white" id="activity">
          <SectionMedia name="section-blue" className="opacity-45" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#050505]/55 to-[#050505]" />
          <div className="relative z-10 mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="mb-6 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">05 / Live protocol</div>
            <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <h2 className="max-w-lg text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">A decision you can inspect.<br />See the protocol in action.</h2>
              <a href="/protocol/heartbeat" className="inline-flex items-center gap-2 font-mono text-sm font-bold uppercase tracking-[0.12em] text-[#7da6ff] transition hover:text-white">View protocol health <ArrowRight className="h-4 w-4" /></a>
            </div>

            <div className="mb-8 flex flex-wrap items-center gap-2">
              {([['all', 'All'], ['settled', 'Settled'], ['recorded', 'Recorded']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setActivityFilter(key)}
                  className={`rounded-lg px-4 py-2 font-mono text-xs uppercase tracking-[0.15em] transition ${activityFilter === key ? 'bg-white text-black' : 'border border-white/15 bg-white/[0.06] text-white/60 hover:bg-white/[0.12] hover:text-white'}`}
                >
                  {label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-4">
                <button onClick={refreshActivity} className="inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white/45 transition hover:text-white" aria-label="Refresh network activity">
                  <RefreshCw className={`h-3.5 w-3.5 ${isActivityLoading ? 'animate-spin' : ''}`} /> Refresh
                </button>
                <span className="hidden items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#7da6ff] md:flex"><span className="h-2 w-2 animate-pulse rounded-full bg-[#7da6ff]" /> Online</span>
              </div>
            </div>

            <div className="mb-5 grid overflow-hidden rounded-2xl border border-white/10 bg-[#080912]/85 backdrop-blur-xl lg:grid-cols-[1.25fr_.75fr]">
              <div className="relative min-h-[220px] overflow-hidden border-b border-white/10 p-6 sm:p-8 lg:border-b-0 lg:border-r">
                <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(0,82,255,.22)_1px,transparent_1px),linear-gradient(90deg,rgba(0,82,255,.22)_1px,transparent_1px)] [background-size:28px_28px]" />
                <div className="absolute -left-20 top-1/2 h-44 w-44 -translate-y-1/2 rounded-full bg-[#0052ff]/30 blur-3xl" />
                <div className="relative">
                  <div className="mb-8 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-white/45"><span>Network telemetry</span><span className="text-[#7da6ff]">Live read</span></div>
                  <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3 text-center sm:gap-5">
                    {[['RPC', chainLabel], ['Treasury', stats?.treasury?.balanceNative ? `${Number(stats.treasury.balanceNative).toFixed(3)} ${nativeSymbol}` : 'Syncing'], ['Proof', activity.length ? `${activity.length} events` : 'Standby']].map(([label, value], index) => (
                      <div key={label} className="contents">
                        <div className="min-w-0 rounded-xl border border-[#0052ff]/25 bg-[#0052ff]/10 px-2 py-4 shadow-[0_0_32px_rgba(0,82,255,.14)]">
                          <span className="mx-auto mb-2 block h-2.5 w-2.5 rounded-full bg-[#0052ff] shadow-[0_0_16px_rgba(0,82,255,1)]" />
                          <div className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">{label}</div>
                          <div className="mt-1 truncate text-xs font-bold text-white/85">{value}</div>
                        </div>
                        {index < 2 && <div className="h-px min-w-3 bg-gradient-to-r from-[#0052ff] to-[#0052ff]/15" />}
                      </div>
                    ))}
                  </div>
                  <p className="mt-7 font-mono text-[10px] uppercase tracking-[0.12em] text-white/35">{telemetryUpdatedAt ? `Snapshot fetched ${telemetryUpdatedAt}` : 'Connecting to protocol telemetry'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-px bg-white/10">
                <div className="bg-[#080912]/90 p-5 sm:p-6"><Database className="mb-5 h-5 w-5 text-[#7da6ff]" /><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">Latest block</div><div className="mt-2 text-xl font-extrabold tracking-[-0.05em]">{formatNumber(stats?.chain?.blockNumber)}</div><div className="mt-1 text-xs text-white/40">{chainLabel}</div></div>
                <div className="bg-[#080912]/90 p-5 sm:p-6"><ShieldCheck className="mb-5 h-5 w-5 text-[#7da6ff]" /><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">Feed status</div><div className="mt-2 text-xl font-extrabold tracking-[-0.05em]">{activityError ? 'Retry' : isActivityLoading ? 'Syncing' : 'Live'}</div><div className="mt-1 text-xs text-white/40">updates every 30s</div></div>
              </div>
            </div>

            {filteredActivity.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredActivity.map((item, index) => (
                  <motion.div
                    key={`${item.tool}-${index}`}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.05 }}
                    className="group rounded-2xl border border-white/10 bg-[#0a0a14]/80 p-6 backdrop-blur transition hover:-translate-y-1 hover:border-[#0052ff]/50"
                  >
                    <div className="mb-5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#0052ff]/25 font-mono text-[10px] font-bold text-[#7da6ff]">{(item.agent || 'B')[0]}</span>
                        <span className="text-sm text-white/60">{item.agent || 'Bobby network'}</span>
                      </div>
                      <span className="font-mono text-[10px] text-white/30">{item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : ''}</span>
                    </div>
                    <div className="mb-6 truncate text-xl font-extrabold tracking-[-0.04em] text-white/90">{item.tool || 'Agent decision'}</div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-bold text-white/80">{item.paid ? 'x402 settled' : 'recorded'}</span>
                      <span className={`rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${item.paid ? 'border-[#0052ff]/40 bg-[#0052ff]/15 text-[#7da6ff]' : 'border-white/15 bg-white/[0.06] text-white/55'}`}>{item.status || (item.paid ? 'settled' : 'live')}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#0052ff]/30 bg-[#0052ff]/[0.045] px-6 py-12 text-center">
                <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full border border-[#0052ff]/35 bg-[#0052ff]/10"><CircleDollarSign className="h-5 w-5 text-[#7da6ff]" /></div>
                <div className="text-lg font-bold">{activityError ? 'Activity feed is reconnecting.' : isActivityLoading ? 'Reading protocol activity.' : 'No recent protocol events.'}</div>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/45">{activityError ? 'The network telemetry is still available. Refresh to retry the event stream.' : 'The live network remains connected; the next recorded event will appear here automatically.'}</p>
              </div>
            )}
          </div>
        </section>

        <section className="relative overflow-hidden border-t border-white/10 bg-[#08080a]" id="mcp">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(0,82,255,.1),transparent_40%)]" />
          <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="mb-12 flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">06 / Bobby-as-a-service</div>
                <h2 className="max-w-xl text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">Plug Bobby into your agent.</h2>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/60 px-5 py-3 font-mono text-sm text-[#7da6ff]">POST /api/mcp-http</div>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-7">
                <div className="mb-5 flex items-center justify-between">
                  <span className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-white/60">Free tier</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/35">{mcp?.pricing?.free?.length ?? '—'} tools</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(mcp?.pricing?.free ?? []).map((tool) => (
                    <span key={tool} className="rounded-md border border-white/10 bg-white/[0.06] px-3 py-1.5 font-mono text-xs text-white/70">{tool}</span>
                  ))}
                  {!mcp && <span className="font-mono text-xs text-white/40">loading tool registry…</span>}
                </div>
              </div>
              <div className="rounded-2xl border border-[#0052ff]/40 bg-[#0052ff]/[0.08] p-7">
                <div className="mb-5 flex items-center justify-between">
                  <span className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#7da6ff]">Premium — x402</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#7da6ff]">{mcp?.pricing?.premium?.price ?? '—'}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(mcp?.pricing?.premium?.tools ?? []).map((tool) => (
                    <span key={tool} className="rounded-md border border-[#0052ff]/40 bg-[#0052ff]/20 px-3 py-1.5 font-mono text-xs text-white/90">{tool}</span>
                  ))}
                  {!mcp && <span className="font-mono text-xs text-white/40">loading tool registry…</span>}
                </div>
                {mcp?.pricing?.premium?.settlementContract && (
                  <div className="mt-6 border-t border-[#0052ff]/20 pt-4 font-mono text-[11px] text-white/45">settlement {mcp.pricing.premium.settlementContract}</div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden border-t border-white/10 bg-[#050505]" id="contracts">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,82,255,.1),transparent_45%)]" />
          <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
            <div className="mb-12 max-w-3xl">
              <div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">07 / Track record</div>
              <h2 className="text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">A track record in public.<br />A stricter build on Base.</h2>
              <p className="mt-5 max-w-xl text-sm leading-6 text-white/45">
                Bobby ran in production on OKX X Layer through the hackathon era. These records show what was committed on-chain; they do not claim oracle-verified market truth while TrackRecord v2 is still being designed.
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
              <span>Chain 196 · OKX X Layer</span>
              <a href={`https://www.oklink.com/xlayer/address/${stats?.contracts?.trackRecord?.address ?? ''}`} target="_blank" rel="noreferrer" className="transition hover:text-[#7da6ff]">TrackRecord on OKLink ↗</a>
              <a href={`https://www.oklink.com/xlayer/address/${stats?.contracts?.agentEconomy?.address ?? ''}`} target="_blank" rel="noreferrer" className="transition hover:text-[#7da6ff]">AgentEconomy on OKLink ↗</a>
              <a href="/protocol/heartbeat" className="transition hover:text-[#7da6ff]">Full contract heartbeat →</a>
            </div>
          </div>
        </section>

        <section className="border-t border-white/10 bg-[#0a0a0a]" aria-label="Protocol metrics"><div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-5 py-14 md:grid-cols-4 lg:grid-cols-8 lg:px-8"><Metric label="Compromisos" value={formatNumber(publicRecord?.commitmentsCreated ?? totalTrades)} detail="creados" /><Metric label="Resueltas" value={formatNumber(publicRecord?.decisionsResolved)} detail="decisiones" /><Metric label="Pendientes" value={formatNumber(publicRecord?.pending)} detail="sin resultado" /><Metric label="Expiradas" value={formatNumber(publicRecord?.expired)} detail="sin liquidación" /><Metric label="Wins / losses" value={publicRecord ? `${publicRecord.wins} / ${publicRecord.losses}` : '—'} detail="resueltas decisivas" /><Metric label="Win rate" value={formatWinRate(winRate, publicRecord?.decisionsResolved, publicRecord?.wins, publicRecord?.losses)} detail={publicRecord?.decisionsResolved && publicRecord.decisionsResolved < WIN_RATE_MIN_SAMPLE ? `muestra chica (n=${publicRecord.decisionsResolved})` : 'sobre resueltas'} /><Metric label="Resolución" value={publicRecord ? `${Number(publicRecord.resolutionRate).toFixed(1)}%` : '—'} detail="compromisos con resultado" /><Metric label="Interacciones" value={formatNumber(totalInteractions)} detail="network" /></div></section>

        <footer className="border-t border-white/10 bg-[#050505]">
          <div className="mx-auto flex max-w-7xl flex-col gap-12 px-5 py-16 lg:px-8">
            <div className="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
              <div>
                <BrandMark />
                <p className="mt-5 max-w-xs text-sm leading-6 text-white/40">
                  The accountability layer for autonomous finance. Every thesis debated, every decision committed before the outcome.
                </p>
                <div className="mt-6 flex items-center gap-4">
                  <a href="https://twitter.com/bobbyprotocol" target="_blank" rel="noreferrer" aria-label="Twitter" className="text-white/40 transition hover:text-[#7da6ff]"><Twitter className="h-4 w-4" /></a>
                  <a href="https://github.com/anthonysurfermx/Bobby-Agent-Trader" target="_blank" rel="noreferrer" aria-label="GitHub" className="text-white/40 transition hover:text-[#7da6ff]"><Github className="h-4 w-4" /></a>
                </div>
              </div>
              {([
                ['Protocol', [
                  ['Console', '/protocol/console'],
                  ['Sandbox', '/protocol/sandbox'],
                  ['Heartbeat', '/protocol/heartbeat'],
                  ['Network', '/protocol/network'],
                ]],
                ['Build', [
                  ['Docs', '/protocol/docs'],
                  ['Playbooks', '/protocol/playbooks'],
                  ['Harness', '/protocol/harness'],
                  ['MCP endpoint', '#mcp'],
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
                      <li key={href}>
                        <a href={href} className="text-sm text-white/60 transition hover:text-[#7da6ff]">{label}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/40 md:flex-row">
              <span>© 2026 Bobby Protocol</span>
              <span>Make the thesis earn it.</span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
