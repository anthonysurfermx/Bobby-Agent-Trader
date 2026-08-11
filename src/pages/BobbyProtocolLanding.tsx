import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  CircleDollarSign,
  Github,
  Menu,
  ShieldCheck,
  Sparkles,
  Twitter,
  X,
} from 'lucide-react';

type Price = { symbol: string; price: number; change24h: number };

interface ProtocolStats {
  fetchedAt?: string;
  chain?: { blockNumber?: number };
  treasury?: { balanceOkb?: string };
  contracts?: {
    agentEconomy?: { stats?: { totalDebates?: string; totalMcpCalls?: string } };
    trackRecord?: { stats?: { totalTrades?: string; winRateBps?: string } };
    adversarialBounties?: { totalPosted?: number };
  };
  protocolTotals?: { totalInteractions?: number; mcpPayments?: number };
  market?: { prices?: Price[] };
}

interface ActivityItem {
  agent?: string;
  tool?: string;
  paid?: boolean;
  timestamp?: string | null;
  status?: string | null;
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

  useEffect(() => {
    const load = () => fetch('/api/activity?limit=8', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: { feed?: ActivityItem[] }) => setActivity(payload.feed ?? []))
      .catch(() => setActivity([]));

    load();
    const interval = window.setInterval(load, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return activity;
}

function BrandMark() {
  return (
    <a href="/protocol" className="flex items-center gap-3 text-white" aria-label="Bobby Protocol home">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#0052ff] text-white shadow-[0_8px_24px_rgba(0,82,255,0.35)]">
        <span className="text-lg font-black tracking-[-0.14em]">B</span>
      </span>
      <span className="text-[15px] font-extrabold tracking-[-0.04em]">Bobby Protocol</span>
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

function NetworkVisual({ stats }: { stats: ProtocolStats | null }) {
  const nodes = [
    { label: 'ALPHA', role: 'finds the setup', angle: -140 },
    { label: 'RED TEAM', role: 'attacks the thesis', angle: -40 },
    { label: 'CIO', role: 'makes the call', angle: 140 },
    { label: 'PROOF', role: 'sealed on-chain', angle: 40 },
  ];
  const totalDebates = stats?.contracts?.agentEconomy?.stats?.totalDebates;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[560px]">
      {/* Ambient glow */}
      <div className="absolute inset-[6%] rounded-full bg-[radial-gradient(circle_at_center,rgba(0,82,255,0.28),transparent_62%)] blur-2xl" />

      {/* Slow conic sweep */}
      <motion.div
        className="absolute inset-[10%] rounded-full opacity-60 [background:conic-gradient(from_0deg,transparent_0deg,rgba(0,82,255,0.35)_40deg,transparent_90deg)]"
        animate={{ rotate: 360 }}
        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
      />

      {/* Orbit rings */}
      <div className="absolute inset-[10%] rounded-full border border-[#0052ff]/25" />
      <motion.div
        className="absolute inset-[22%] rounded-full border border-dashed border-[#0052ff]/40"
        animate={{ rotate: -360 }}
        transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute inset-[34%] rounded-full border border-dotted border-white/15"
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
      />

      {/* Orbiting spark */}
      <motion.div
        className="absolute inset-[10%]"
        animate={{ rotate: 360 }}
        transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
      >
        <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-[#7da6ff] shadow-[0_0_16px_4px_rgba(0,82,255,0.8)]" />
      </motion.div>

      {/* Center core */}
      <motion.div
        className="absolute inset-[36%] overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#0052ff] to-[#0033b8] p-4 text-white shadow-[0_25px_90px_rgba(0,82,255,0.55)] md:p-5"
        animate={{ scale: [1, 1.03, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="flex h-full flex-col justify-between">
          <div className="flex items-center justify-between">
            <Sparkles className="h-4 w-4 opacity-80 md:h-5 md:w-5" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          </div>
          <div className="min-w-0">
            <div className="mb-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.22em] text-white/60 md:text-[9px]">Bobby</div>
            <div className="text-sm font-extrabold leading-tight tracking-[-0.04em] md:text-lg lg:text-xl">Decision layer</div>
            <div className="mt-0.5 truncate font-mono text-[7px] uppercase tracking-[0.12em] text-white/55 md:text-[9px]">
              {totalDebates ? `${formatNumber(totalDebates)} debates` : 'debating live'}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Agent nodes on the orbit */}
      {nodes.map((node, index) => {
        const radius = 45;
        const x = 50 + radius * Math.cos((node.angle * Math.PI) / 180);
        const y = 50 + radius * Math.sin((node.angle * Math.PI) / 180);
        return (
          <motion.div
            key={node.label}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%` }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 + index * 0.15 }}
          >
            <motion.div
              className="flex items-center gap-2 rounded-full border border-white/10 bg-[#0a0a14]/90 px-3 py-2 shadow-[0_10px_40px_rgba(0,82,255,0.25)] backdrop-blur"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3 + index, repeat: Infinity, ease: 'easeInOut' }}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0052ff] opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#0052ff]" />
              </span>
              <span className="font-mono text-[9px] font-bold tracking-[0.18em] text-white/85">{node.label}</span>
              <span className="hidden font-mono text-[8px] tracking-[0.08em] text-white/40 sm:inline">{node.role}</span>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
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
  const activity = useActivity();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState<'all' | 'settled' | 'verified'>('all');
  const btc = price(stats, 'BTC');
  const totalDebates = stats?.contracts?.agentEconomy?.stats?.totalDebates;
  const totalMcpCalls = stats?.contracts?.agentEconomy?.stats?.totalMcpCalls;
  const totalTrades = stats?.contracts?.trackRecord?.stats?.totalTrades;
  const totalInteractions = stats?.protocolTotals?.totalInteractions;
  const winRate = stats?.contracts?.trackRecord?.stats?.winRateBps;

  const navItems = [
    ['How it works', '#how-it-works'],
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
    [btc ? `BTC $${btc.price.toLocaleString()}` : 'BTC —', false],
    [stats?.chain?.blockNumber ? `Base block ${formatNumber(stats.chain.blockNumber)}` : 'On-chain verification', false],
    ['Every thesis gets challenged', false],
    ['Proof-of-debate', true],
    [`${formatNumber(totalTrades, '—')} decisions committed`, false],
  ] as const;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#050505] text-white selection:bg-[#0052ff] selection:text-white">
      <Helmet>
        <title>Bobby Protocol — The decision layer for autonomous agents</title>
        <meta name="description" content="Bobby gives autonomous agents a shared, adversarial decision layer with live proof." />
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
          <div className="relative z-10 mx-auto grid min-h-[calc(100vh-72px)] max-w-7xl items-center gap-8 px-5 pb-20 pt-20 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:pb-28 lg:pt-24">
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55 }}>
              <a href="/agentic-world/bobby/history" className="mb-8 inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#7da6ff] transition hover:text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0052ff]" />A manifesto for the verified agent economy <span aria-hidden>›</span>
              </a>
              <h1 className="max-w-3xl text-[clamp(3.3rem,7vw,6.9rem)] font-extrabold leading-[.92] tracking-[-0.09em]">Agents need a <span className="text-[#0052ff]">second opinion.</span></h1>
              <p className="mt-8 max-w-xl text-lg leading-8 text-white/60 md:text-xl">Bobby is the adversarial decision layer for autonomous finance. Three agents debate the thesis, pressure-test the risk, and leave a proof trail before capital moves.</p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <a href="/agentic-world/bobby" className="group inline-flex items-center justify-center gap-3 rounded-lg bg-white px-8 py-4 font-mono text-sm font-bold uppercase tracking-[0.15em] text-black transition hover:bg-[#0052ff] hover:text-white">Enter War Room <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></a>
                <a href="#how-it-works" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-8 py-4 font-mono text-sm font-bold uppercase tracking-[0.15em] text-white backdrop-blur transition hover:bg-white/20">Explore <ChevronDown className="h-4 w-4" /></a>
              </div>
              <div className="mt-14 grid max-w-xl grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-4">
                {[
                  ['Debates', formatNumber(totalDebates)],
                  ['Decisions', formatNumber(totalTrades)],
                  ['MCP calls', formatNumber(totalMcpCalls)],
                  ['Win rate', winRate ? `${(Number(winRate) / 100).toFixed(1)}%` : '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</div>
                    <div className="font-mono text-3xl font-bold tracking-[-0.04em] text-white md:text-4xl">{value}</div>
                  </div>
                ))}
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .65, delay: .1 }}><NetworkVisual stats={stats} /></motion.div>
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
              <div className="mb-5 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">01 / The verification loop</div>
              <h2 className="text-5xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-7xl">
                Decisions, never blind.<br />
                <span className="text-white/72">See Bobby in action.</span>
              </h2>
              <p className="mt-7 max-w-xl text-base leading-7 text-white/55 md:text-lg">
                Every signal enters an adversarial pipeline. Agents debate it, risk challenges it, and the protocol records the result before the market can rewrite the story.
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
                { icon: Check, eyebrow: 'Base proof', title: 'Commit before outcome', text: 'The decision and its rationale become a verifiable record before price reveals the answer.', state: 'ONCHAIN PROOF', step: '04' },
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

        <section className="relative isolate overflow-hidden bg-[#050505] text-white" id="activity">
          <SectionMedia name="section-blue" className="opacity-45" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#050505]/55 to-[#050505]" />
          <div className="relative z-10 mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="mb-6 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">02 / Live network</div>
            <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <h2 className="max-w-lg text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">Decisions, never paused.<br />See the network in action.</h2>
              <a href="/protocol/heartbeat" className="inline-flex items-center gap-2 font-mono text-sm font-bold uppercase tracking-[0.12em] text-[#7da6ff] transition hover:text-white">View protocol health <ArrowRight className="h-4 w-4" /></a>
            </div>

            <div className="mb-8 flex flex-wrap items-center gap-2">
              {([['all', 'All'], ['settled', 'Settled'], ['verified', 'Verified']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setActivityFilter(key)}
                  className={`rounded-lg px-4 py-2 font-mono text-xs uppercase tracking-[0.15em] transition ${activityFilter === key ? 'bg-white text-black' : 'border border-white/15 bg-white/[0.06] text-white/60 hover:bg-white/[0.12] hover:text-white'}`}
                >
                  {label}
                </button>
              ))}
              <span className="ml-auto hidden items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#7da6ff] md:flex"><span className="h-2 w-2 animate-pulse rounded-full bg-[#7da6ff]" /> Online</span>
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
                      <span className="font-mono text-sm font-bold text-white/80">{item.paid ? 'x402 settled' : 'verified'}</span>
                      <span className={`rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${item.paid ? 'border-[#0052ff]/40 bg-[#0052ff]/15 text-[#7da6ff]' : 'border-white/15 bg-white/[0.06] text-white/55'}`}>{item.status || (item.paid ? 'settled' : 'live')}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 text-center text-sm text-white/45">Waiting for the next protocol event…</div>
            )}
          </div>
        </section>

        <section className="relative isolate overflow-hidden" id="for-agents">
          <SectionMedia name="nebula" className="opacity-50" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#050505]/60 to-[#050505]" />
          <div className="relative z-10 mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
          <div className="mb-12 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">03 / Built for both sides</div><h2 className="max-w-xl text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">A better interface for capital.</h2></div><p className="max-w-sm text-sm leading-6 text-white/45">One decision layer. Two ways in.</p></div>
          <div className="grid gap-5 md:grid-cols-2"><a href="/agentic-world/bobby" className="group rounded-3xl bg-[#0052ff] p-8 text-white transition hover:-translate-y-1 hover:shadow-[0_20px_60px_rgba(0,82,255,0.35)] md:p-10"><div className="flex items-start justify-between"><Bot className="h-7 w-7" /><ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" /></div><div className="mt-20 text-3xl font-extrabold tracking-[-0.06em]">For humans</div><p className="mt-3 max-w-sm text-sm leading-6 text-white/70">Open the War Room, watch the debate, and approve the move when the thesis earns it.</p><div className="mt-8 font-mono text-sm font-bold uppercase tracking-[0.12em]">Enter War Room →</div></a><a href="/protocol/docs" className="group rounded-3xl border border-white/10 bg-white/[0.05] p-8 text-white transition hover:-translate-y-1 hover:bg-white/[0.09] md:p-10"><div className="flex items-start justify-between"><Sparkles className="h-7 w-7 text-[#7da6ff]" /><ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" /></div><div className="mt-20 text-3xl font-extrabold tracking-[-0.06em]">For agents</div><p className="mt-3 max-w-sm text-sm leading-6 text-white/55">Connect over MCP. Request conviction, inspect proof, and build Bobby into your execution workflow.</p><div className="mt-8 font-mono text-sm font-bold uppercase tracking-[0.12em] text-[#7da6ff]">Read the docs →</div></a></div>
          </div>
        </section>

        <section className="border-t border-white/10 bg-[#0a0a0a]" aria-label="Protocol metrics"><div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-5 py-14 md:grid-cols-4 lg:px-8"><Metric label="Debates" value={formatNumber(totalDebates)} detail="agent conversations" /><Metric label="Decisions" value={formatNumber(totalTrades)} detail="committed before outcome" /><Metric label="Interactions" value={formatNumber(totalInteractions)} detail="across the network" /><Metric label="Win rate" value={winRate ? `${(Number(winRate) / 100).toFixed(1)}%` : '—'} detail="on the verified record" /></div></section>

        <footer className="bg-[#050505]"><div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-12 lg:px-8"><div className="flex flex-col justify-between gap-6 md:flex-row md:items-center"><BrandMark /><div className="flex items-center gap-4"><a href="https://twitter.com/bobbyprotocol" target="_blank" rel="noreferrer" className="text-white/40 hover:text-[#7da6ff]"><Twitter className="h-4 w-4" /></a><a href="https://github.com/anthonysurfermx/Bobby-Agent-Trader" target="_blank" rel="noreferrer" className="text-white/40 hover:text-[#7da6ff]"><Github className="h-4 w-4" /></a><a href="/protocol/console" className="font-mono text-xs uppercase tracking-[0.12em] text-white/55 hover:text-white">Console</a><a href="/protocol/heartbeat" className="font-mono text-xs uppercase tracking-[0.12em] text-white/55 hover:text-white">Heartbeat</a></div></div><div className="flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/40 md:flex-row"><span>© 2026 Bobby Protocol</span><span>Open decision infrastructure for autonomous agents.</span></div></div></footer>
      </main>
    </div>
  );
}
