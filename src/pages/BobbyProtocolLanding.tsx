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

function NetworkVisual() {
  const nodes = [
    { label: 'ALPHA', className: 'left-[2%] top-[8%]' },
    { label: 'RED TEAM', className: 'right-[3%] top-[18%]' },
    { label: 'CIO', className: 'left-[13%] bottom-[6%]' },
    { label: 'PROOF', className: 'right-[10%] bottom-[0%]' },
  ];

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[520px]">
      <div className="absolute inset-[14%] rounded-full border border-[#0052ff]/20 bg-[radial-gradient(circle_at_center,rgba(0,82,255,0.22),rgba(5,5,5,0)_64%)]" />
      <div className="absolute inset-[27%] rounded-full border border-dashed border-[#0052ff]/35" />
      <div className="absolute inset-[39%] rounded-[2rem] bg-[#0052ff] p-5 text-white shadow-[0_25px_70px_rgba(0,82,255,0.45)]">
        <div className="flex h-full flex-col justify-between">
          <Sparkles className="h-5 w-5 opacity-80" />
          <div>
            <div className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-white/65">Bobby</div>
            <div className="text-xl font-extrabold tracking-[-0.06em]">Decision layer</div>
          </div>
        </div>
      </div>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <path d="M15 20 C38 23 39 38 50 50" stroke="#0052ff" strokeOpacity=".4" strokeWidth=".35" />
        <path d="M86 28 C65 31 62 42 50 50" stroke="#0052ff" strokeOpacity=".45" strokeWidth=".35" />
        <path d="M22 84 C36 75 38 63 50 50" stroke="#0052ff" strokeOpacity=".4" strokeWidth=".35" />
        <path d="M79 86 C67 75 64 64 50 50" stroke="#ffffff" strokeOpacity=".2" strokeWidth=".35" />
        <circle cx="50" cy="50" r="1.2" fill="#fff" />
      </svg>
      {nodes.map((node) => (
        <div key={node.label} className={`absolute ${node.className} flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.4)] backdrop-blur`}>
          <span className="h-2 w-2 rounded-full bg-[#0052ff]" />
          <span className="font-mono text-[9px] font-bold tracking-[0.18em] text-white/70">{node.label}</span>
        </div>
      ))}
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
  const btc = price(stats, 'BTC');
  const totalDebates = stats?.contracts?.agentEconomy?.stats?.totalDebates;
  const totalTrades = stats?.contracts?.trackRecord?.stats?.totalTrades;
  const totalInteractions = stats?.protocolTotals?.totalInteractions;
  const winRate = stats?.contracts?.trackRecord?.stats?.winRateBps;

  const navItems = [
    ['How it works', '#how-it-works'],
    ['For agents', '#for-agents'],
    ['Activity', '#activity'],
  ];

  const activityLabel = useMemo(() => activity.slice(0, 5), [activity]);

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
          <video className="absolute inset-0 h-full w-full object-cover opacity-55 grayscale contrast-125" src="/videos/hero.mp4" autoPlay muted loop playsInline aria-hidden="true" />
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
              <div className="mt-12 flex items-center gap-3 text-xs text-white/45"><span className="flex -space-x-2"><span className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#050505] bg-[#0052ff] text-[9px] font-bold text-white">A</span><span className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#050505] bg-[#0052ff] text-[9px] font-bold text-white">R</span><span className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#050505] bg-[#0052ff] text-[9px] font-bold text-white">C</span></span><span>Alpha, Red Team, and CIO — in every decision.</span></div>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .65, delay: .1 }}><NetworkVisual /></motion.div>
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

        <section className="relative isolate overflow-hidden bg-[#050505] text-white" id="how-it-works">
          <video className="absolute inset-0 h-full w-full object-cover opacity-30" src="/videos/section-blue.mp4" autoPlay muted loop playsInline aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#050505]/40 to-[#050505]" />
          <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[.8fr_1.2fr] lg:px-8 lg:py-28">
          <div><div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">01 / The protocol</div><h2 className="max-w-md text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">Conviction is a team sport.</h2><p className="mt-6 max-w-md leading-7 text-white/55">Bobby turns a raw signal into a decision you can inspect, challenge, and verify. The result is legible to people and machines.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: Bot, title: 'Agents debate', text: 'Alpha finds the setup. Red Team tries to break it. The CIO makes the call.' },
              { icon: ShieldCheck, title: 'Risk gets a vote', text: 'Six dimensions grade the thesis before any execution path can open.' },
              { icon: CircleDollarSign, title: 'Capital stays gated', text: 'Pass, park, or block. Low conviction never gets disguised as a trade.' },
              { icon: Check, title: 'Proof is permanent', text: 'Commit-reveal records make the track record auditable after the outcome.' },
            ].map(({ icon: Icon, title, text }, index) => <motion.div key={title} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * .06 }} className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 backdrop-blur"><Icon className="mb-10 h-5 w-5 text-[#7da6ff]" /><h3 className="text-lg font-extrabold tracking-[-0.04em]">{title}</h3><p className="mt-2 text-sm leading-6 text-white/55">{text}</p></motion.div>)}
          </div>
          </div>
        </section>

        <section className="relative isolate overflow-hidden bg-[#050505] text-white" id="activity">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(0,82,255,.14),transparent_45%)]" />
          <div className="relative z-10">
          <div className="mx-auto grid max-w-7xl gap-14 px-5 py-20 lg:grid-cols-[.9fr_1.1fr] lg:px-8 lg:py-28">
            <div><div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">02 / Live network</div><h2 className="max-w-lg text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">The network is thinking in public.</h2><p className="mt-6 max-w-md leading-7 text-white/50">No black box theatre. See the decision layer, the activity, and the evidence as it happens.</p><a href="/protocol/heartbeat" className="mt-8 inline-flex items-center gap-2 font-mono text-sm font-bold uppercase tracking-[0.12em] text-[#7da6ff]">View protocol health <ArrowRight className="h-4 w-4" /></a></div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 md:p-8"><div className="mb-8 flex items-center justify-between border-b border-white/10 pb-5"><div><div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Network activity</div><div className="mt-1 text-sm text-white/70">Live protocol signals</div></div><span className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#7da6ff]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#7da6ff]" /> Online</span></div>{activityLabel.length > 0 ? <div className="space-y-4">{activityLabel.map((item, index) => <div key={`${item.tool}-${index}`} className="flex items-center justify-between gap-3 border-b border-white/[0.07] pb-4 text-sm"><div className="flex min-w-0 items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#0052ff]/20 font-mono text-[10px] font-bold text-[#7da6ff]">{(item.agent || 'B')[0]}</span><div className="min-w-0"><div className="truncate font-medium text-white/80">{item.tool || 'Agent decision'}</div><div className="text-xs text-white/35">{item.agent || 'Bobby network'} · {item.paid ? 'settled' : 'verified'}</div></div></div><span className="font-mono text-xs text-[#7da6ff]">{item.status || 'LIVE'}</span></div>)}</div> : <div className="rounded-2xl bg-white/[0.04] p-8 text-center text-sm text-white/45">Waiting for the next protocol event…</div>}</div>
          </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28" id="for-agents">
          <div className="mb-12 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">03 / Built for both sides</div><h2 className="max-w-xl text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">A better interface for capital.</h2></div><p className="max-w-sm text-sm leading-6 text-white/45">One decision layer. Two ways in.</p></div>
          <div className="grid gap-5 md:grid-cols-2"><a href="/agentic-world/bobby" className="group rounded-3xl bg-[#0052ff] p-8 text-white transition hover:-translate-y-1 hover:shadow-[0_20px_60px_rgba(0,82,255,0.35)] md:p-10"><div className="flex items-start justify-between"><Bot className="h-7 w-7" /><ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" /></div><div className="mt-20 text-3xl font-extrabold tracking-[-0.06em]">For humans</div><p className="mt-3 max-w-sm text-sm leading-6 text-white/70">Open the War Room, watch the debate, and approve the move when the thesis earns it.</p><div className="mt-8 font-mono text-sm font-bold uppercase tracking-[0.12em]">Enter War Room →</div></a><a href="/protocol/docs" className="group rounded-3xl border border-white/10 bg-white/[0.05] p-8 text-white transition hover:-translate-y-1 hover:bg-white/[0.09] md:p-10"><div className="flex items-start justify-between"><Sparkles className="h-7 w-7 text-[#7da6ff]" /><ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" /></div><div className="mt-20 text-3xl font-extrabold tracking-[-0.06em]">For agents</div><p className="mt-3 max-w-sm text-sm leading-6 text-white/55">Connect over MCP. Request conviction, inspect proof, and build Bobby into your execution workflow.</p><div className="mt-8 font-mono text-sm font-bold uppercase tracking-[0.12em] text-[#7da6ff]">Read the docs →</div></a></div>
        </section>

        <section className="border-t border-white/10 bg-[#0a0a0a]" aria-label="Protocol metrics"><div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-5 py-14 md:grid-cols-4 lg:px-8"><Metric label="Debates" value={formatNumber(totalDebates)} detail="agent conversations" /><Metric label="Decisions" value={formatNumber(totalTrades)} detail="committed before outcome" /><Metric label="Interactions" value={formatNumber(totalInteractions)} detail="across the network" /><Metric label="Win rate" value={winRate ? `${(Number(winRate) / 100).toFixed(1)}%` : '—'} detail="on the verified record" /></div></section>

        <footer className="bg-[#050505]"><div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-12 lg:px-8"><div className="flex flex-col justify-between gap-6 md:flex-row md:items-center"><BrandMark /><div className="flex items-center gap-4"><a href="https://twitter.com/bobbyprotocol" target="_blank" rel="noreferrer" className="text-white/40 hover:text-[#7da6ff]"><Twitter className="h-4 w-4" /></a><a href="https://github.com/anthonysurfermx/Bobby-Agent-Trader" target="_blank" rel="noreferrer" className="text-white/40 hover:text-[#7da6ff]"><Github className="h-4 w-4" /></a><a href="/protocol/console" className="font-mono text-xs uppercase tracking-[0.12em] text-white/55 hover:text-white">Console</a><a href="/protocol/heartbeat" className="font-mono text-xs uppercase tracking-[0.12em] text-white/55 hover:text-white">Heartbeat</a></div></div><div className="flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/40 md:flex-row"><span>© 2026 Bobby Protocol</span><span>Open decision infrastructure for autonomous agents.</span></div></div></footer>
      </main>
    </div>
  );
}
