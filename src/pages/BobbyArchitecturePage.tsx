import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  ArrowUpRight,
  Cpu,
  Database,
  FileText,
  GitBranch,
  Github,
  Menu,
  Radio,
  Scale,
  ShieldCheck,
  Twitter,
  X,
} from 'lucide-react';

// Live protocol telemetry — same endpoint the landing consumes. The page keeps
// working as an architecture overview when RPC data is unavailable.
interface ProtocolStats {
  fetchedAt?: string;
  chain?: { id?: number; name?: string; nativeSymbol?: string; explorerUrl?: string; blockNumber?: number };
  contracts?: {
    agentEconomy?: { address?: string; stats?: { totalDebates?: string } };
    convictionOracle?: { address?: string };
    trackRecord?: { address?: string };
    adversarialBounties?: { address?: string };
    hardnessRegistry?: { address?: string };
    agentRegistry?: { address?: string };
  };
  onchainRecord?: { commitmentsCreated?: number; decisionsResolved?: number; pending?: number; winRate?: number | null };
  debateActivity?: { commitmentsCreated?: number; decisionsResolved?: number; pending?: number; wins?: number; losses?: number; winRate?: number };
}

const formatNumber = (value: unknown, fallback = '—') => {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-US') : fallback;
};

function useProtocolStats() {
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/bobby-protocol-stats', { cache: 'no-store' });
      if (response.ok) setStats((await response.json()) as ProtocolStats);
    } catch {
      // Architecture copy stands on its own without live telemetry.
    }
  }, []);
  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);
  return stats;
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

function SectionMedia({ name, className = '' }: { name: string; className?: string }) {
  return (
    <>
      <img src={`/posters/${name}.jpg`} alt="" aria-hidden="true" className={`absolute inset-0 h-full w-full object-cover md:hidden ${className}`} />
      <video className={`absolute inset-0 hidden h-full w-full object-cover md:block ${className}`} src={`/videos/${name}.mp4`} autoPlay muted loop playsInline aria-hidden="true" />
    </>
  );
}

type Status = 'live' | 'canary' | 'spec' | 'gated';

const STATUS_STYLES: Record<Status, { dot: string; text: string; label: string }> = {
  live: { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'LIVE' },
  canary: { dot: 'bg-amber-400', text: 'text-amber-300', label: 'CANARY' },
  spec: { dot: 'bg-sky-400', text: 'text-sky-300', label: 'SPEC' },
  gated: { dot: 'bg-rose-400', text: 'text-rose-300', label: 'GATED' },
};

function StatusPill({ status }: { status: Status }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.18em] ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} motion-safe:animate-pulse`} />
      {s.label}
    </span>
  );
}

function SectionHeading({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <div className="max-w-3xl">
      <div className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[#7da6ff]">{eyebrow}</div>
      <h2 className="text-4xl font-extrabold tracking-[-0.04em] text-white md:text-5xl [text-wrap:balance]">{title}</h2>
      {lede ? <p className="mt-5 text-base leading-7 text-white/55">{lede}</p> : null}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border-t border-white/15 pt-4">
      <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{label}</div>
      <div className="text-3xl font-extrabold tracking-[-0.07em] text-white [font-variant-numeric:tabular-nums]">{value}</div>
      <div className="mt-1 text-xs text-white/40">{detail}</div>
    </div>
  );
}

const PIPELINE = [
  { step: '01', name: 'Signal', role: 'market data', text: 'Prices, funding and momentum from OKX market data. Raw input, zero conviction.' },
  { step: '02', name: 'Filter', role: 'pre-screen', text: 'Universe and regime filters drop noise before any model spends a token on it.' },
  { step: '03', name: 'Alpha Hunter', role: 'on-chain role · alpha', text: 'Builds the long/short thesis: entry, invalidation, targets. The optimist on record.' },
  { step: '04', name: 'Red Team', role: 'on-chain role · red', text: 'Paid to kill the thesis. Attacks structure, liquidity, crowding and timing.' },
  { step: '05', name: 'CIO', role: 'on-chain role · cio', text: 'Weighs both sides and issues the verdict with conviction and sizing.' },
  { step: '06', name: 'Risk Gate', role: 'deterministic', text: 'Position sizing, stops, exposure caps. Can veto the CIO. Vetoes are recorded, not hidden.' },
  { step: '07', name: 'Commit', role: 'on-chain', text: 'The decision hash lands on-chain before the outcome exists. No retroactive editing.' },
  { step: '08', name: 'Resolve', role: 'price-bound', text: 'Outcomes settle against reference prices — wins and losses signed by a 2-of-3 resolver quorum.' },
] as const;

const LAYERS = [
  {
    icon: Radio,
    title: 'Data in',
    text: 'Market structure feeding every cycle.',
    items: [
      ['OKX market data — prices · funding · candles', 'live'],
      ['News & macro calendar', 'live'],
    ] as const,
  },
  {
    icon: Cpu,
    title: 'Debate engine',
    text: 'Serverless cycles that run the three-agent debate.',
    items: [
      ['agent-run — main cycle · 8h', 'live'],
      ['bobby-cycle — public debate · 5min', 'live'],
      ['bobby-intel — snapshot · ~10s', 'live'],
      ['explain — streaming analysis · SSE', 'live'],
    ] as const,
  },
  {
    icon: Database,
    title: 'Proof layer',
    text: 'Every decision committed before its outcome.',
    items: [
      ['X Layer · chain 196 — legacy archive', 'live'],
      ['Base Sepolia · 84532 — V2 oracle canary', 'canary'],
      ['Base mainnet · 8453 — behind hard gates', 'gated'],
    ] as const,
  },
  {
    icon: GitBranch,
    title: 'Surfaces',
    text: 'Where humans read, question and follow the record.',
    items: [
      ['War Room, analytics & track record views', 'live'],
      ['Telegram bot — debates on the go', 'live'],
      ['Voice Live Desk — realtime analysis', 'live'],
    ] as const,
  },
  {
    icon: Scale,
    title: 'Execution rails',
    text: 'Deliberately staged. Proof first, execution second.',
    items: [
      ['Paper / simulated — current mode', 'live'],
      ['Dedicated executor service', 'spec'],
      ['OKX Signal Bot rail — controls spec v0', 'spec'],
      ['Uniswap v4 treasury rail — hookless pools', 'spec'],
    ] as const,
  },
] as const;

const BASE_SEPOLIA_TRACK_RECORD = '0x4bfEF46d920fd67C68046901f591Fad0a2F7cadC';

const CONTRACT_ROLES = [
  ['BobbyTrackRecord V2', 'trackRecord', 'V2 anchors entry in the future and verifies entry/exit with Pyth; verified and attested ledgers never mix.'],
  ['BobbyConvictionOracle', 'convictionOracle', 'Conviction commitments published before execution. The no-take-backs ledger.'],
  ['BobbyAgentEconomyV2', 'agentEconomy', 'Debate fees and protocol economy, denominated in native gas.'],
  ['BobbyAgentRegistry', 'agentRegistry', 'Agent identities with a registration stake behind every name.'],
  ['BobbyIntentEscrow', 'intentEscrow', 'Intent attestation ledger — kept strictly separate from price-verified stats.'],
  ['BobbyAdversarialBounties', 'adversarialBounties', 'Open bounties paid for breaking Bobby’s reasoning in public.'],
  ['HardnessRegistry', 'hardnessRegistry', 'Scores how hard each debate actually was. Easy calls earn less credit.'],
] as const;

const CHAIN_STAGES = [
  {
    status: 'live' as Status,
    name: 'X Layer',
    chainId: '196',
    text: 'The readable legacy archive. Thousands of commitments were debated, committed and resolved in public during the X Layer era.',
  },
  {
    status: 'canary' as Status,
    name: 'Base Sepolia',
    chainId: '84532',
    text: 'TrackRecord V2 canary: seven verified contracts, a real Pyth/Hermes commit→resolve cycle and a 2-of-3 Safe rehearsal. Five audit rounds closed four P1 findings.',
  },
  {
    status: 'gated' as Status,
    name: 'Base mainnet',
    chainId: '8453',
    text: 'Deliberately NO-GO until every gate closes. Shipping fast is easy; earning mainnet is the point.',
    gates: ['24–48h canary soak — clean scorecard', 'Base mainnet Safe 2-of-3 — create, audit and pin', 'Production environment — predeploy checker green', 'Signed deploy + seven Safe ownership handoffs'],
  },
];

const DOCS = [
  { name: 'Architecture & status', href: '/protocol/architecture', text: 'The system, the debate cycle and the deployment pipeline — with an honest component-by-component status.', internal: true },
  { name: 'Architecture manifesto', href: 'https://github.com/anthonysurfermx/Bobby-Agent-Trader/blob/main/docs/ARCHITECTURE_MANIFESTO.md', text: 'Why proof-of-process beats promises, and the design rules the protocol refuses to break.' },
  { name: 'Base migration plan', href: 'https://github.com/anthonysurfermx/Bobby-Agent-Trader/blob/main/docs/plan-migracion-base.md', text: 'The full cutover plan to Base: contracts, Uniswap v4 rail, payments and the phase gates.' },
  { name: 'Security audits', href: 'https://github.com/anthonysurfermx/Bobby-Agent-Trader/tree/main/docs/audit', text: 'Every adversarial round published — findings, fixes and the NO-GO calls, in the open.' },
  { name: 'Docs hub', href: '/protocol/docs', text: 'Integration guides, MCP endpoint and everything builders need to plug into Bobby.', internal: true },
] as const;

const FOOTER_GROUPS = [
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
    ['Audit reports', 'https://github.com/anthonysurfermx/Bobby-Agent-Trader/tree/main/docs/audit'],
  ]],
  ['Bobby', [
    ['War Room', '/agentic-world/bobby'],
    ['Track record', '/agentic-world/bobby/history'],
    ['Analytics', '/agentic-world/bobby/analytics'],
    ['Agents', '/agentic-world/bobby/agents'],
  ]],
] as const;

const NAV_ITEMS = [
  ['Pipeline', '#pipeline'],
  ['System', '#system'],
  ['Proof', '#proof'],
  ['Chains', '#chains'],
  ['Docs', '#docs'],
] as const;

export default function BobbyArchitecturePage() {
  const stats = useProtocolStats();
  const [menuOpen, setMenuOpen] = useState(false);

  const record = stats?.onchainRecord;
  const publicRecord = stats?.debateActivity;
  const explorerAddressUrl = `${stats?.chain?.explorerUrl || 'https://basescan.org'}/address`;

  // Audit Base r4 rule, same as the landing: a rate over a tiny sample reads as
  // skill when it is noise — below the sample floor we show raw counts. All
  // fields must come from ONE record source; mixing ledgers yields nonsense
  // like "433W/244L (n=1)".
  const WIN_RATE_MIN_SAMPLE = 20;
  const resolved = publicRecord?.decisionsResolved ?? record?.decisionsResolved;
  const winRateDisplay = (() => {
    if (!resolved) return '—';
    if (publicRecord?.decisionsResolved) {
      if (publicRecord.decisionsResolved < WIN_RATE_MIN_SAMPLE) {
        return publicRecord.wins !== undefined && publicRecord.losses !== undefined
          ? `${publicRecord.wins}W / ${publicRecord.losses}L`
          : `n=${publicRecord.decisionsResolved}`;
      }
      return publicRecord.winRate !== undefined ? `${Number(publicRecord.winRate).toFixed(1)}%` : '—';
    }
    if (record?.winRate === null || record?.winRate === undefined) return '—';
    return resolved < WIN_RATE_MIN_SAMPLE ? `n=${resolved}` : `${Number(record.winRate).toFixed(1)}%`;
  })();

  const shortAddress = (address?: string) =>
    address && address.length > 10 ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#050505] text-white selection:bg-[#0052ff] selection:text-white">
      <Helmet>
        <title>Architecture | Bobby Protocol</title>
        <meta name="description" content="How Bobby works: three agents debate every thesis, a risk gate can veto it, and every decision is committed on-chain before the outcome." />
      </Helmet>

      <div className="pointer-events-none fixed inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:52px_52px]" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#050505]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 lg:px-8">
          <BrandMark />
          <nav className="hidden items-center gap-9 md:flex">
            {NAV_ITEMS.map(([label, href]) => (
              <a key={href} href={href} className="font-mono text-xs uppercase tracking-[0.15em] text-white/55 transition hover:text-white">{label}</a>
            ))}
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <a href="https://github.com/anthonysurfermx/Bobby-Agent-Trader" target="_blank" rel="noreferrer" className="rounded-full p-2 text-white/45 transition hover:bg-white/10 hover:text-white" aria-label="GitHub"><Github className="h-4 w-4" /></a>
            <a href="/agentic-world/bobby" className="rounded-lg bg-white px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.15em] text-black transition hover:bg-[#0052ff] hover:text-white">Open War Room</a>
          </div>
          <button onClick={() => setMenuOpen((open) => !open)} className="rounded-full p-2 md:hidden" aria-label="Toggle navigation">
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <nav className="border-t border-white/10 bg-[#0a0a0a] px-5 py-4 md:hidden">
            {NAV_ITEMS.map(([label, href]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)} className="block py-3 font-mono text-xs uppercase tracking-[0.15em] text-white/70">{label}</a>
            ))}
          </nav>
        )}
      </header>

      <main className="relative">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative isolate overflow-hidden border-b border-white/10">
          <SectionMedia name="architecture" className="opacity-70 saturate-125" />
          {/* Left scrim keeps the headline readable while the diagram video breathes on the right. */}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#050505_0%,rgba(5,5,5,.94)_34%,rgba(5,5,5,.55)_58%,rgba(5,5,5,.25)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,5,.5)_0%,rgba(5,5,5,.15)_45%,#050505_100%)]" />
          <div className="relative mx-auto max-w-7xl px-5 pb-24 pt-28 lg:px-8 lg:pt-36">
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
              <div className="mb-5 font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[#7da6ff]">Protocol architecture</div>
              <h1 className="max-w-4xl text-5xl font-extrabold leading-[1.02] tracking-[-0.05em] md:text-7xl [text-wrap:balance]">
                Anatomy of a<br />verifiable decision.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-white/60">
                Three specialised agents debate every thesis. A deterministic risk gate can kill it.
                Whatever survives is committed on-chain <em className="not-italic text-white">before</em> the
                outcome exists — wins, losses and vetoes alike.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <a href="#pipeline" className="group inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3.5 font-mono text-xs font-bold uppercase tracking-[0.15em] text-black transition hover:bg-[#0052ff] hover:text-white">
                  Trace the pipeline <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </a>
                <a href="#docs" className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-6 py-3.5 font-mono text-xs font-bold uppercase tracking-[0.15em] text-white/75 transition hover:border-[#0052ff]/60 hover:text-white">
                  Read the docs
                </a>
              </div>
            </motion.div>
            <div className="mt-16 flex flex-wrap items-center gap-x-8 gap-y-3 font-mono text-[11px] text-white/40">
              <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" />{stats?.chain?.name || 'Protocol'} online</span>
              {stats?.chain?.blockNumber ? <span>block {formatNumber(stats.chain.blockNumber)}</span> : null}
              <span>{formatNumber(publicRecord?.commitmentsCreated ?? record?.commitmentsCreated)} decisions committed</span>
              <span>{formatNumber(stats?.contracts?.agentEconomy?.stats?.totalDebates)} debates settled</span>
            </div>
          </div>
        </section>

        {/* ── Pipeline ─────────────────────────────────────────────────── */}
        <section id="pipeline" className="relative border-b border-white/10 bg-[#0a0a0a] py-24">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <SectionHeading
              eyebrow="The debate pipeline"
              title="No thesis survives on charm."
              lede="Eight stages between a raw signal and a settled outcome. Each agent role maps to its own on-chain address — the debate is not marketing copy, it is the execution path."
            />
            <div className="relative mt-14">
              <div className="pointer-events-none absolute -top-4 left-0 hidden h-px w-full overflow-hidden lg:block" aria-hidden="true">
                <div className="h-px w-1/3 bg-gradient-to-r from-transparent via-[#0052ff] to-transparent motion-safe:animate-[archpulse_5s_linear_infinite]" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {PIPELINE.map((stage, index) => (
                  <motion.div
                    key={stage.step}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.05 }}
                    className="group relative flex flex-col rounded-2xl border border-white/10 bg-[#0b0b12]/80 p-6 transition hover:-translate-y-1 hover:border-[#0052ff]/60"
                  >
                    <div className="mb-5 flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold tracking-[0.18em] text-[#7da6ff]">{stage.step}</span>
                      <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-white/30">{stage.role}</span>
                    </div>
                    <div className="text-lg font-extrabold tracking-[-0.03em] text-white">{stage.name}</div>
                    <p className="mt-3 text-[13px] leading-6 text-white/50">{stage.text}</p>
                    {stage.name === 'Risk Gate' && (
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                        <span className="rounded-full border border-rose-400/25 bg-rose-400/10 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-rose-300">veto → recorded</span>
                        <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-emerald-300">pass → committed</span>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
            <p className="mt-10 max-w-3xl font-mono text-[12px] leading-6 text-white/35">
              The uncomfortable part is the point: rejected trades stay on the record. A protocol that
              only publishes its wins is a highlight reel, not a track record.
            </p>
          </div>
        </section>

        {/* ── System layers ────────────────────────────────────────────── */}
        <section id="system" className="relative border-b border-white/10 py-24">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <SectionHeading
              eyebrow="System layers"
              title="Five layers, honestly labeled."
              lede="Every component wears its real status. LIVE is running in production, CANARY is rehearsing on testnet, SPEC is designed but not built, GATED is blocked on purpose."
            />
            <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {LAYERS.map((layer, index) => (
                <motion.div
                  key={layer.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.06 }}
                  className="rounded-2xl border border-white/10 bg-[#0b0b12]/80 p-7"
                >
                  <div className="mb-5 flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-xl border border-[#0052ff]/30 bg-[#0052ff]/10 text-[#7da6ff]"><layer.icon className="h-4 w-4" /></span>
                    <div className="text-base font-extrabold tracking-[-0.02em] text-white">{layer.title}</div>
                  </div>
                  <p className="mb-6 text-[13px] leading-6 text-white/45">{layer.text}</p>
                  <ul className="space-y-3 border-t border-white/10 pt-5">
                    {layer.items.map(([item, status]) => (
                      <li key={item} className="flex items-center justify-between gap-3">
                        <span className="text-[13px] leading-5 text-white/60">{item}</span>
                        <StatusPill status={status as Status} />
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Proof layer ──────────────────────────────────────────────── */}
        <section id="proof" className="relative isolate overflow-hidden border-b border-white/10 py-24">
          <SectionMedia name="nebula" className="opacity-30" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,#050505_0%,rgba(5,5,5,.72)_40%,#050505_100%)]" />
          <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
            <SectionHeading
              eyebrow="On-chain proof"
              title="Seven contracts. One rule."
              lede="Commit before the outcome, resolve against prices, and never blend what was verified with what was merely claimed."
            />
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-6">
                <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">Price-verified</div>
                <p className="text-sm leading-6 text-white/60">Outcomes resolved against reference prices with a bounded window. This is the record that earns trust.</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-6">
                <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Attested</div>
                <p className="text-sm leading-6 text-white/60">Claims without a price feed stay labeled as claims — tracked separately, never laundered into verified stats.</p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CONTRACT_ROLES.map(([name, key, description], index) => {
                const isBaseV2 = name === 'BobbyTrackRecord V2';
                const address = isBaseV2
                  ? BASE_SEPOLIA_TRACK_RECORD
                  : stats?.contracts?.[key as keyof NonNullable<ProtocolStats['contracts']>]?.address;
                const short = shortAddress(address);
                const addressHref = isBaseV2
                  ? `https://sepolia.basescan.org/address/${address}`
                  : `${explorerAddressUrl}/${address}`;
                return (
                  <motion.div
                    key={name}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.04 }}
                    className="flex flex-col rounded-2xl border border-white/10 bg-[#0b0b12]/80 p-6"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <span className="font-mono text-[13px] font-bold text-white">{name}</span>
                      <ShieldCheck className="h-4 w-4 shrink-0 text-[#7da6ff]/60" />
                    </div>
                    <p className="flex-1 text-[13px] leading-6 text-white/50">{description}</p>
                    <div className="mt-5 border-t border-white/10 pt-4 font-mono text-[11px]">
                      {short ? (
                        <a href={addressHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[#7da6ff] transition hover:text-white">
                          {short} <ArrowUpRight className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-white/30">explorer link via live telemetry</span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Chains ───────────────────────────────────────────────────── */}
        <section id="chains" className="relative border-b border-white/10 bg-[#0a0a0a] py-24">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <SectionHeading
              eyebrow="Deployment pipeline"
              title="Mainnet is earned, not shipped."
              lede="The protocol moves chain by chain, each stage burning in before the next unlocks. The current NO-GO on Base mainnet is a feature of the process, not a delay."
            />
            <div className="mt-14 grid gap-4 lg:grid-cols-3">
              {CHAIN_STAGES.map((stage, index) => (
                <motion.div
                  key={stage.name}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.08 }}
                  className="relative flex flex-col rounded-2xl border border-white/10 bg-[#0b0b12]/80 p-7"
                >
                  <div className="mb-5 flex items-center justify-between">
                    <StatusPill status={stage.status} />
                    <span className="font-mono text-[10px] text-white/30">chain {stage.chainId}</span>
                  </div>
                  <div className="text-xl font-extrabold tracking-[-0.03em] text-white">{stage.name}</div>
                  <p className="mt-3 flex-1 text-[13px] leading-6 text-white/50">{stage.text}</p>
                  {stage.gates ? (
                    <ul className="mt-5 space-y-2.5 border-t border-white/10 pt-5">
                      {stage.gates.map((gate) => (
                        <li key={gate} className="flex items-start gap-2.5 text-[12px] leading-5 text-white/55">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-400" />
                          {gate}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {index < CHAIN_STAGES.length - 1 && (
                    <div className="absolute -right-4 top-1/2 hidden -translate-y-1/2 text-white/25 lg:block" aria-hidden="true">
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Live record strip ────────────────────────────────────────── */}
        <section aria-label="Live protocol record" className="border-b border-white/10">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-5 py-14 md:grid-cols-4 lg:px-8">
            <Metric label="Commitments" value={formatNumber(publicRecord?.commitmentsCreated ?? record?.commitmentsCreated)} detail="created on-chain" />
            <Metric label="Resolved" value={formatNumber(resolved)} detail="decisions settled" />
            <Metric label="Win rate" value={winRateDisplay} detail={resolved && resolved < WIN_RATE_MIN_SAMPLE ? `small sample (n=${resolved})` : 'over resolved'} />
            <Metric label="Debates" value={formatNumber(stats?.contracts?.agentEconomy?.stats?.totalDebates)} detail="settled by the economy" />
          </div>
        </section>

        {/* ── Docs ─────────────────────────────────────────────────────── */}
        <section id="docs" className="relative py-24">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <SectionHeading
              eyebrow="Documentation"
              title="The paper trail."
              lede="Architecture, audits and migration plans — published, versioned and open. Read what the protocol says about itself before it asks for your attention."
            />
            <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {DOCS.map((doc, index) => (
                <motion.a
                  key={doc.name}
                  href={doc.href}
                  {...('internal' in doc && doc.internal ? {} : { target: '_blank', rel: 'noreferrer' })}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                  className="group flex flex-col rounded-2xl border border-white/10 bg-[#0b0b12]/80 p-7 transition hover:-translate-y-1 hover:border-[#0052ff]/60"
                >
                  <div className="mb-6 flex items-start justify-between">
                    <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-white/50 transition group-hover:border-[#0052ff]/40 group-hover:text-[#7da6ff]"><FileText className="h-4 w-4" /></span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-white/25 transition group-hover:text-[#7da6ff]" />
                  </div>
                  <div className="text-base font-extrabold tracking-[-0.02em] text-white">{doc.name}</div>
                  <p className="mt-3 text-[13px] leading-6 text-white/50">{doc.text}</p>
                </motion.a>
              ))}
            </div>
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────── */}
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
              {FOOTER_GROUPS.map(([group, links]) => (
                <div key={group}>
                  <div className="mb-5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">{group}</div>
                  <ul className="space-y-3">
                    {links.map(([label, href]) => (
                      <li key={href}>
                        <a
                          href={href}
                          {...(href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
                          className="text-sm text-white/60 transition hover:text-[#7da6ff]"
                        >
                          {label}
                        </a>
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

      <style>{`@keyframes archpulse { 0% { transform: translateX(-110%); } 100% { transform: translateX(320%); } }`}</style>
    </div>
  );
}
