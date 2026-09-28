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
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Twitter,
} from 'lucide-react';
import { BOBBY_BASE_MAINNET } from '@/config/chains';
import NucleoTopBar from '@/components/protocol/NucleoTopBar';
import { useNucleoPages } from '@/hooks/useNucleoPages';

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
  onchainRecord?: { available?: boolean; commitmentsCreated?: number; decisionsResolved?: number; pending?: number; winRate?: number | null };
  debateActivity?: {
    totalDebates?: number;
    commitmentsCreated?: number;
    decisionsResolved?: number;
    expired?: number;
    pending?: number;
    wins?: number;
    losses?: number;
    breakEven?: number;
    winRate?: number;
    resolutionRate?: number;
    debatesRun?: number;
    abstentions?: number;
    lastDebateAt?: string;
    latestDebate?: LatestDebate;
  };
  pipeline?: {
    desk?: { endpoint?: string; model?: string; calls?: number; timeframe?: string };
    cycle?: { endpoint?: string; schedule?: string; models?: { alpha?: string; redTeam?: string; cio?: string }; commitConvictionFloor?: number; horizonHours?: number };
    resolver?: { endpoint?: string; schedule?: string; method?: string };
  };
  market?: { prices?: Price[] };
}

interface LatestDebate {
  id?: string;
  topic?: string;
  created_at?: string;
  symbol?: string | null;
  direction?: string | null;
  entry_price?: number | null;
  stop_price?: number | null;
  target_price?: number | null;
  agents?: Array<{ agent: 'alpha' | 'redteam' | 'cio'; content: string; at?: string; verdict?: { action?: string; conviction?: number; symbol?: string; direction?: string } | null }>;
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

// Where "The app" points. The lifestyle landing lives at /app-a while /app still
// serves the previous one; change this one line when /app-a is promoted.
const APP_LANDING_URL = '/'; // the app's landing is the home now

const formatNumber = (value: unknown, fallback = '—') => {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-US') : fallback;
};

const ago = (iso: string | undefined) => {
  if (!iso) return null;
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
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

// The Núcleo wordmark (Sora, like the home's footer): no badge, no glow.
function BrandMark() {
  return (
    <a href="/protocol" className="np-display text-[26px] leading-none text-white" aria-label="Bobby Protocol home">
      Bobby Protocol
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
  if (value === '0') return null;
  return (
    <div className="border-t border-white/15 pt-4">
      <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{label}</div>
      <div className="text-3xl font-extrabold tracking-[-0.07em] text-white">{value}</div>
      <div className="mt-1 text-xs text-white/40">{detail}</div>
    </div>
  );
}

const AGENT_LABEL: Record<string, { name: string; tone: string }> = {
  alpha: { name: 'Alpha Hunter', tone: '#3FE0B5' },
  redteam: { name: 'Red Team', tone: '#FF5A5F' },
  cio: { name: 'CIO', tone: '#F6B94E' },
};

// The newest public debate, read live: each agent's own words, and the CIO's structured verdict.
function LatestDebatePanel({ debate, when }: { debate?: LatestDebate; when: string | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const agents = debate?.agents ?? [];
  const verdict = agents.find((a) => a.agent === 'cio')?.verdict;
  const ruled = verdict
    ? verdict.action === 'none' || verdict.direction === 'none'
      ? `No call${typeof verdict.conviction === 'number' ? ` · conviction ${verdict.conviction}/10` : ''}`
      : `${String(verdict.direction ?? '').toUpperCase()} ${verdict.symbol ?? ''}${typeof verdict.conviction === 'number' ? ` · conviction ${verdict.conviction}/10` : ''}`
    : null;
  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-[#0b0b12]/80 p-7">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#7da6ff]">Latest public debate</div>
        {when && <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">{when}</div>}
      </div>
      {agents.length === 0 ? (
        <p className="mt-6 text-sm leading-6 text-white/45">Loading the latest debate from the public ledger…</p>
      ) : (
        <>
          <h3 className="mt-3 text-2xl font-extrabold tracking-[-0.05em]">{debate?.topic}</h3>
          <div className="mt-5 border-t border-white/10">
            {agents.map((a) => {
              const label = AGENT_LABEL[a.agent] ?? { name: a.agent, tone: '#fff' };
              const long = a.content.length > 420;
              const shown = open === a.agent || !long ? a.content : `${a.content.slice(0, 420).replace(/\s+\S*$/, '')}…`;
              return (
                <div key={a.agent} className="border-b border-white/[0.06] py-4">
                  <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: label.tone }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: label.tone }} />{label.name}
                  </div>
                  <p className="whitespace-pre-line text-sm leading-6 text-white/70">{shown}</p>
                  {long && (
                    <button type="button" onClick={() => setOpen(open === a.agent ? null : a.agent)} className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#7da6ff] hover:text-white">
                      {open === a.agent ? 'Show less' : 'Read all'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {ruled && (
            <div className="mt-5 flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">CIO verdict</span>
              <span className="font-mono text-sm font-bold text-white">{ruled}</span>
            </div>
          )}
          <a href="/record" className="mt-6 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#7da6ff] hover:text-white">Every debate and every call →</a>
        </>
      )}
    </div>
  );
}

export default function BobbyProtocolLanding() {
  const stats = useProtocolStats();
  const mcp = useMcpMeta();
  const { activity, isLoading: isActivityLoading, error: activityError, refresh: refreshActivity } = useActivity();
  useNucleoPages();
  const [activityFilter, setActivityFilter] = useState<'all' | 'settled' | 'recorded'>('all');
  // Deep links such as /protocol#rules arrive before this lazy page has rendered its sections,
  // so the browser's own jump finds nothing. Scroll once the section exists.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 120);
    return () => window.clearTimeout(t);
  }, []);
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
  const deskModel = stats?.pipeline?.desk?.model ?? 'gpt-4o-mini';
  const debatesRun = publicRecord?.debatesRun;
  const lastDebate = ago(publicRecord?.lastDebateAt);
  const provenanceNote = `Source: the public debate ledger (Supabase, read live). A debate becomes a call only when the CIO commits entry, stop and target before the outcome; every call is graded on the 1H price path until it expires. Win rate counts break-evens against Bobby. Paid MCP settlements live separately in AgentEconomy on ${chainLabel}${liveChainDebates !== undefined ? ` (${formatNumber(liveChainDebates, '0')} so far)` : ''}.`;
  const nativeSymbol = stats?.chain?.nativeSymbol || 'ETH';
  const telemetryUpdatedAt = stats?.fetchedAt
    ? new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(stats.fetchedAt))
    : null;

  const explorerAddressUrl = `${stats?.chain?.explorerUrl || 'https://basescan.org'}/address`;
  const c = stats?.contracts;
  const proofPoints = [
    {
      label: 'On-chain record (since the Base cut-over)',
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
        ? `${formatNumber(publicRecord.pending, '0')} pending · ${formatNumber(publicRecord.wins, '0')}W / ${formatNumber(publicRecord.losses, '0')}L / ${formatNumber(publicRecord.breakEven, '0')} flat · ${publicRecord.winRate?.toFixed(1)}%${debatesRun ? ` · out of ${formatNumber(debatesRun)} debates` : ''}`
        : 'Waiting for the public resolution ledger.',
      proof: 'Every call, with its debate',
      href: '/record',
    },
    {
      label: 'Adversarial bounties',
      value: formatNumber(c?.adversarialBounties?.totalPosted),
      detail: 'Escrowed rewards for proving a verdict wrong. The contract is live and verified; no bounty has been posted yet.',
      proof: 'AdversarialBounties contract',
      href: `${explorerAddressUrl}/${c?.adversarialBounties?.address ?? ''}`,
    },
    {
      label: 'Contracts live',
      value: String(Object.keys(BOBBY_BASE_MAINNET.contracts).length),
      detail: 'Track record, oracle, economy, bounties, hardness, identity and intent escrow — all deployed on Base and owned by the 2-of-3 Safe.',
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
    ['The app', APP_LANDING_URL],
    ['Docs', '/protocol/docs'],
  ] as const;

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
    [lastDebate ? `Last public debate ${lastDebate}` : 'Daily public debate at 12:00 UTC', true],
    ['Alpha builds the case · Red Team attacks it · the CIO rules', false],
    [debatesRun ? `${formatNumber(debatesRun)} public debates · ${formatNumber(totalTrades, '—')} became calls` : `${formatNumber(totalTrades, '—')} calls committed`, false],
    ['A call is written down before the outcome', false],
  ] as const;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#050505] text-white selection:bg-[#0052ff] selection:text-white">
      <Helmet>
        <title>Bobby Protocol — Refuted before execution</title>
        <meta name="description" content="The rules behind every answer Bobby gives about a market. One agent builds the case, a second attacks it, a third rules and can veto it, and every public call is written down before the outcome." />
      </Helmet>

      <div className="pointer-events-none fixed inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:52px_52px]" />

      <NucleoTopBar links={navItems} />

      <main className="relative">
        <section className="relative isolate min-h-[calc(100vh-72px)] overflow-hidden bg-[#050505] text-white">
          <SectionMedia name="hero" className="opacity-55 grayscale contrast-125" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,5,.96)_0%,rgba(5,5,5,.7)_42%,rgba(5,5,5,.3)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_46%,rgba(0,82,255,.4),transparent_35%)]" />
          <div className="relative z-10 mx-auto flex min-h-[calc(100vh-72px)] max-w-7xl flex-col justify-center px-5 pb-20 pt-20 lg:px-8 lg:pb-28 lg:pt-24">
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55 }}>
              <a href="/record" className="mb-8 inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#7da6ff] transition hover:text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0052ff]" />The rules behind every answer Bobby gives about a market <span aria-hidden>›</span>
              </a>
              <h1 className="max-w-4xl text-[clamp(2.4rem,5.2vw,5rem)] font-extrabold leading-[.96] tracking-[-0.085em]">No decision is approved<br />without being <span className="text-[#0052ff]">refuted.</span></h1>
              <p className="mt-8 max-w-2xl text-lg leading-8 text-white/60 md:text-xl">When Bobby answers a question about an asset, this is what happens before you see it: one agent builds the case, a second one tries to break it, a third one rules and can veto it. Every public call is written down before the market settles it.</p>
              <p className="mt-5 max-w-2xl border-l-2 border-[#0052ff] pl-4 text-sm leading-6 text-white/45 md:text-base">Bobby runs on the same models everyone else uses. The difference is not the model, it is the procedure around it.</p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <a href="/desk" className="group inline-flex items-center justify-center gap-3 rounded-lg bg-white px-8 py-4 font-mono text-sm font-bold uppercase tracking-[0.15em] text-black transition hover:bg-[#0052ff] hover:text-white">Inspect a verdict <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></a>
                <a href="#how-it-works" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-8 py-4 font-mono text-sm font-bold uppercase tracking-[0.15em] text-white backdrop-blur transition hover:bg-white/20">See the procedure <ChevronDown className="h-4 w-4" /></a>
              </div>
              <div className="mt-14 grid max-w-2xl grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-4">
                {[
                  ['Debates', formatNumber(debatesRun ?? totalDebates)],
                  ['Calls', formatNumber(totalTrades)],
                  ['Resolved', formatNumber(publicRecord?.decisionsResolved)],
                  ['Win rate', formatWinRate(winRate, publicRecord?.decisionsResolved, publicRecord?.wins, publicRecord?.losses)],
                ].filter(([, value]) => value !== '0').map(([label, value]) => (
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


        <section className="relative overflow-hidden border-b border-white/10 bg-[#08080a]" id="what-it-does">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(0,82,255,.18),transparent_36%)]" />
          <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="mb-12 max-w-3xl">
              <div className="mb-5 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">01 / What it does</div>
              <h2 className="text-5xl font-extrabold leading-[.96] tracking-[-0.08em] md:text-7xl">It turns an idea<br />into a decision.</h2>
              <p className="mt-7 max-w-xl text-base leading-7 text-white/55 md:text-lg">Bring a question about a stock or a crypto. One agent builds the case, a second one attacks it, a third one rules — over the same live market data.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { step: '01', title: 'Bring the idea', text: 'Start with a market thesis.' },
                { step: '02', title: 'Test the downside', text: 'Opposing agents look for what breaks it.' },
                { step: '03', title: 'Get the ruling', text: 'The CIO weighs both sides: review the idea, or wait.' },
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
                <div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">02 / The procedure</div>
                <h2 className="max-w-xl text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">One procedure,<br />end to end.</h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-white/45">Four steps, the same on every debate.</p>
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
              <div className="mb-5 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">03 / Before anything is approved</div>
              <h2 className="text-5xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-7xl">
                Most ideas<br />
                <span className="text-white/72">do not survive.</span>
              </h2>
              <p className="mt-7 max-w-xl text-base leading-7 text-white/55 md:text-lg">
                {debatesRun && totalTrades
                  ? `Of ${formatNumber(debatesRun)} public debates, ${formatNumber(totalTrades)} ended in a call with entry, stop and target. The other ${formatNumber(Math.max(0, debatesRun - Number(totalTrades)))} ended in no call — the Red Team and the CIO held.`
                  : 'Every idea must survive its own refutation before it becomes a call.'}
              </p>
            </motion.div>

            <div className="mt-14 grid grid-cols-2 gap-x-8 gap-y-7 md:grid-cols-4 lg:max-w-5xl">
              {[
                ['Debates', formatNumber(debatesRun ?? totalDebates)],
                ['Calls', formatNumber(totalTrades)],
                ['No call', formatNumber(publicRecord?.abstentions)],
                ['Paid MCP calls', formatNumber(totalMcpCalls)],
              ].filter(([, value]) => value !== '0').map(([label, value]) => (
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
                {lastDebate ? `Last run ${lastDebate}` : 'Live pipeline'} <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0052ff]" />
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                { icon: Bot, eyebrow: '01 / Alpha Hunter', title: 'Build the case', text: 'The strongest conditional idea the market data supports, and the evidence behind it.', state: 'PROPOSED', step: '01' },
                { icon: ShieldCheck, eyebrow: '02 / Red Team', title: 'Attack the case', text: 'Reads Alpha\u2019s actual argument and goes after its weak assumptions, invalidation and missing evidence.', state: 'CHALLENGED', step: '02' },
                { icon: CircleDollarSign, eyebrow: '03 / CIO', title: 'Rule on it', text: 'Weighs both arguments. The CIO can veto the indicator engine, never upgrade it. No finished debate, no approval.', state: 'GATED', step: '03' },
                { icon: Check, eyebrow: '04 / Public record', title: 'Grade it in public', text: 'A call is written with entry, stop and target before the outcome, then graded on the real price path.', state: 'RECORDED', step: '04' },
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
                <div className="mb-5 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">04 / The agents</div>
                <h2 className="max-w-4xl text-5xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-7xl">
                  How the agents<br />are kept honest.
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-white/45">
                The desk uses the same endpoint on the web and iPhone; the daily cycle is a separate public procedure.
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {[
                {
                  title: 'Adversarial debate',
                  description: 'Three isolated model calls over the same evidence. Alpha Hunter argues the case, Red Team receives Alpha\u2019s argument and attacks it, the CIO receives both plus the original question and rules: review or wait.',
                  image: '/images/protocol/adversarial-debate.jpg',
                  alt: 'Three silhouettes debating behind illuminated blue glass',
                  telemetry: ['POST /api/desk-debate', `model  ${deskModel}`, 'red.input  question · evidence · alpha', 'cio.input  question · evidence · alpha · red'],
                },
                {
                  title: 'Veto, never upgrade',
                  description: 'A deterministic indicator engine proposes direction, conviction and levels. The debate can only take that away: a call is shown only when the CIO rules review in the same direction. If the debate does not finish, nothing is approved.',
                  image: '/images/protocol/risk-gate.jpg',
                  alt: 'Human hand meeting a luminous blue glass barrier',
                  telemetry: ['engine  1H indicators → direction · conviction · levels', 'cio  review | wait · long | short | none', 'show call  cio=review ∧ same direction', 'otherwise  no call'],
                },
                {
                  title: 'Output guard',
                  description: 'Every desk agent\u2019s text is checked after generation. A guaranteed return, a risk-free claim, a personal buy or sell instruction, or a CIO whose text contradicts its own verdict fails the desk analysis. No desk verdict is substituted.',
                  image: '/images/protocol/agent-identity.jpg',
                  alt: 'Synthetic human profile visible through textured cobalt glass',
                  telemetry: ['guard  guarantee · advice · verdict mismatch', 'on fail  503 analysis_failed', 'languages  en · es', 'fallback  none'],
                },
                {
                  title: 'Proof',
                  description: 'The daily public debate stores every call with entry, stop, target and a 48-hour expiry before the outcome, and grades it on the real 1H price path. Calls the cycle commits live also go to TrackRecordV2 on Base with a Pyth price anchor.',
                  image: '/images/protocol/onchain-proof.jpg',
                  alt: 'Transparent cobalt glass monolith containing a sealed point of light',
                  telemetry: [`cycle  ${stats?.pipeline?.cycle?.schedule ?? 'daily 12:00 UTC'}`, `resolver  ${stats?.pipeline?.resolver?.schedule ?? 'daily 12:30 UTC'}`, 'grading  first touch · stop wins a tie', `chain  base · 8453 · ${formatNumber(onchainRecord?.commitmentsCreated, '0')} on-chain`],
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
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden border-b border-white/10 bg-[#050505]" id="runtimes">
          <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
            <div className="mb-12 max-w-3xl">
              <div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">05 / Where the agents run</div>
              <h2 className="text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">Two runtimes.<br />Two procedures.</h2>
              <p className="mt-5 max-w-xl text-sm leading-6 text-white/45">Your question in the app is answered on demand and stays yours. The public record comes from a separate daily debate that anyone can audit.</p>
            </div>
            <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-5">
                {[
                  {
                    eyebrow: 'On demand · web /desk and iPhone',
                    title: 'The desk',
                    rows: [
                      ['Endpoint', stats?.pipeline?.desk?.endpoint ?? '/api/desk-debate'],
                      ['Agents', `Alpha Hunter → Red Team → CIO · ${stats?.pipeline?.desk?.calls ?? 3} sequential calls · ${deskModel}`],
                      ['Evidence', 'One instrument, 1H candles from public market data (crypto and equities). At least 59 bars; refused if older than 3 h (crypto) or 5 days (equities).'],
                      ['Engine', 'Deterministic 1H indicators (trend, RSI, ATR, EMA, support and resistance) give levels and conviction. The CIO can only veto them.'],
                      ['Output', 'Review or wait, with each agent\u2019s argument. Reads are metered per device and account.'],
                      ['Record', 'Private. A desk answer is not published to the public ledger.'],
                    ],
                  },
                  {
                    eyebrow: `Public · ${stats?.pipeline?.cycle?.schedule ?? 'daily 12:00 UTC'}`,
                    title: 'The daily cycle',
                    rows: [
                      ['Endpoint', stats?.pipeline?.cycle?.endpoint ?? '/api/bobby-cycle'],
                      ['Agents', `Alpha ${stats?.pipeline?.cycle?.models?.alpha ?? 'gpt-4o-mini'} → Red Team ${stats?.pipeline?.cycle?.models?.redTeam ?? 'gpt-4o-mini'} → CIO ${stats?.pipeline?.cycle?.models?.cio ?? 'gpt-4o'} with a forced structured verdict: action, direction, entry, stop, target, invalidation, conviction 1–10.`],
                      ['Evidence', 'Public market prices, funding, open interest and top-trader positioning, a technical pulse across indicators, Fear & Greed, Polymarket and the dollar index.'],
                      ['Gate', `Conviction = 70% backend model + 30% CIO. A call is committed only when the CIO asks to act with complete levels and conviction ≥ ${stats?.pipeline?.cycle?.commitConvictionFloor ?? 0.35}.`],
                      ['Grading', `${stats?.pipeline?.cycle?.horizonHours ?? 48} h expiry. ${stats?.pipeline?.resolver?.method ?? '1H candle path, first touch, stop wins a same-bar tie'} (${stats?.pipeline?.resolver?.schedule ?? 'daily 12:30 UTC'}).`],
                      ['Record', 'Public, with the full debate. Live commits also go to TrackRecordV2 on Base.'],
                    ],
                  },
                ].map((runtime) => (
                  <div key={runtime.title} className="rounded-2xl border border-white/10 bg-[#0b0b12]/80 p-7">
                    <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#7da6ff]">{runtime.eyebrow}</div>
                    <h3 className="mt-3 text-2xl font-extrabold tracking-[-0.05em]">{runtime.title}</h3>
                    <dl className="mt-5 border-t border-white/10">
                      {runtime.rows.map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-3 border-b border-white/[0.06] py-3 text-sm">
                          <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">{k}</dt>
                          <dd className="leading-6 text-white/70">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
              <LatestDebatePanel debate={publicRecord?.latestDebate} when={lastDebate} />
            </div>
          </div>
        </section>

        <section className="relative isolate overflow-hidden" id="for-agents">
          <SectionMedia name="nebula" className="opacity-50" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#050505]/60 to-[#050505]" />
          <div className="relative z-10 mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
          <div className="mb-12 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">06 / Integration</div><h2 className="max-w-xl text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">Give any agent<br />a second layer.</h2></div><p className="max-w-sm text-sm leading-6 text-white/45">Connect over MCP.</p></div>
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
              href={APP_LANDING_URL}
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
                  <h3 className="text-3xl font-extrabold tracking-[-0.06em] md:text-4xl">Bobby, on the web and iPhone</h3>
                  <p className="mt-4 max-w-sm text-sm leading-6 text-white/65">The same three agents and the same veto, in a voice you can talk to.</p>
                  <div className="mt-8 font-mono text-xs font-bold uppercase tracking-[0.14em] text-white">See the app →</div>
                </div>
              </div>
            </a>
          </div>
          </div>
        </section>


        <section className="relative overflow-hidden border-t border-white/10 bg-[#050505]" id="contracts">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,82,255,.1),transparent_45%)]" />
          <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
            <div className="mb-12 max-w-3xl">
              <div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">07 / Track record</div>
              <h2 className="text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">The record is public.<br />The live protocol is Base.</h2>
              <p className="mt-5 max-w-xl text-sm leading-6 text-white/45">
                Seven contracts on Base, owned by a 2-of-3 Safe. The debate ledger is read live from the database; calls the cycle commits live are also anchored on-chain. Wallets stay self-custodial: on the web Bobby prepares bounded swap calldata on Base, records confirmed receipts and never holds funds or exchange credentials.
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
              <div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#7da6ff]">08 / Scope and limits</div>
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
                  ['Verified calls', '/protocol/calls'],
                  ['Heartbeat', '/protocol/heartbeat'],
                  ['Audits', '/protocol/audits'],
                  ['Console', '/protocol/console'],
                  ['Sandbox', '/protocol/sandbox'],
                ]],
                ['Build', [
                  ['Docs', '/protocol/docs'],
                  ['Playbooks', '/protocol/playbooks'],
                  ['Harness', '/protocol/harness'],
                  ['MCP endpoint', '/protocol/docs#mcp'],
                ]],
                ['Bobby', [
                  ['The desk', '/desk'],
                  ['Track record', '/record'],
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
