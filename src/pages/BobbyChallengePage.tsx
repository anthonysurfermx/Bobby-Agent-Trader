// ============================================================
// Bobby $100 Challenge Dashboard — Stitch "Agent Terminal"
// Full Stitch design system: glass-card, scanline, 2-col layout
// All data is REAL from /api/bobby-pnl + Supabase debates
// ============================================================

import { useEffect, useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useTradingRoom } from '@/hooks/useTradingRoom';
import type { TechnicalAssetSignal, TechnicalMarketSummary } from '@/lib/bobby-technical';
import KineticShell from '@/components/kinetic/KineticShell';

const SB = 'https://egpixaunlnzauztbrnuz.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// On-chain stat reader — calls X Layer RPC directly
function OnChainStat({ label, selector }: { label: string; selector: string }) {
  const [value, setValue] = useState<number | null>(null);
  useEffect(() => {
    fetch('https://rpc.xlayer.tech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_call',
        params: [{ to: '0xf841b428e6d743187d7be2242eccc1078fde2395', data: selector }, 'latest'],
      }),
    })
      .then(r => r.json())
      .then(d => { if (d.result) setValue(parseInt(d.result, 16)); })
      .catch(() => {});
  }, [selector]);
  return (
    <div className="p-2 bg-black/40 rounded border border-white/5 text-center">
      <div className="font-mono text-lg font-bold text-green-400" style={{ fontVariantNumeric: 'tabular-nums' }}>{value ?? '—'}</div>
      <div className="font-mono text-[8px] text-white/30 tracking-widest">{label}</div>
    </div>
  );
}

interface PnlData {
  summary: {
    startingCapital: number;
    currentEquity: number;
    totalReturn: number;
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
  };
  closedPositions: Array<{
    symbol: string;
    direction: string;
    entryPrice: number;
    exitPrice: number;
    realizedPnl: number;
    pnlPct: number;
    leverage: string;
    closeTime: string;
    result: string;
  }>;
  openPositions: Array<{
    symbol: string;
    direction: string;
    leverage: string;
    unrealizedPnl: number;
    unrealizedPnlPct: number;
  }>;
}

interface UserConviction {
  asset: string;
  conviction: number;
  context: string;
  latestDebate?: { symbol: string; direction: string; conviction_score: number; status: string };
}

interface StoredTriggerData {
  technical?: TechnicalMarketSummary | null;
}

interface RecentDecision {
  id: string;
  topic?: string;
  symbol: string;
  direction: string;
  conviction_score: number;
  created_at: string;
  status: string;
  trigger_data?: StoredTriggerData | null;
  posts: Array<{ agent: string; content: string }>;
}

function formatSignedScore(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function formatTechnicalPrice(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return value >= 1000 ? `$${value.toFixed(1)}` : `$${value.toFixed(2)}`;
}

function getTechnicalAsset(
  technical: TechnicalMarketSummary | null | undefined,
  symbol?: string | null,
): TechnicalAssetSignal | null {
  if (!technical?.assets?.length) return null;
  if (symbol) {
    const match = technical.assets.find((asset) => asset.symbol === symbol);
    if (match) return match;
  }
  return technical.leader || technical.assets[0] || null;
}

function getBiasClasses(bias: string): string {
  if (bias === 'bullish') return 'border-green-500/20 bg-green-500/10 text-green-400';
  if (bias === 'bearish') return 'border-red-500/20 bg-red-500/10 text-red-400';
  return 'border-white/10 bg-white/[0.03] text-white/40';
}

export default function BobbyChallengePage() {
  const { profile, profileId, hasAgent, roomMode, accentColor, accentBorder } = useTradingRoom();
  const [pnl, setPnl] = useState<PnlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [userConvictions, setUserConvictions] = useState<UserConviction[]>([]);
  const [nextScan, setNextScan] = useState('--:--:--');
  const [nextScanPct, setNextScanPct] = useState(0);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [latestDebate, setLatestDebate] = useState<{ id: string; topic: string; symbol: string } | null>(null);
  const [recentDecisions, setRecentDecisions] = useState<RecentDecision[]>([]);
  const [vibe, setVibe] = useState<{
    mood: string; phrase: string; safeMode: boolean;
    signals: number; executed: number; freshness: 'fresh' | 'stable' | 'stale';
    startedAt: string;
  } | null>(null);

  useEffect(() => {
    fetch('/api/bobby-pnl')
      .then(r => r.json())
      .then(d => { if (d.ok) setPnl(d); })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch(`${SB}/rest/v1/forum_threads?order=created_at.desc&limit=5&select=id,topic,symbol,direction,conviction_score,created_at,status,trigger_data`, { headers })
      .then(r => r.json())
      .then(async (threads: RecentDecision[]) => {
        if (!Array.isArray(threads) || threads.length === 0) return;
        setLatestDebate({ id: threads[0].id, topic: threads[0].topic || 'Latest cycle', symbol: threads[0].symbol });
        setLastRun(threads[0].created_at);

        const ids = threads.map(t => t.id).join(',');
        const postsRes = await fetch(`${SB}/rest/v1/forum_posts?thread_id=in.(${ids})&order=created_at.asc&select=thread_id,agent,content`, { headers });
        const posts = await postsRes.json();

        const decisions = threads.map((t) => ({
          ...t,
          posts: (Array.isArray(posts) ? posts : []).filter((p: any) => p.thread_id === t.id).map((p: any) => ({
            agent: p.agent, content: p.content?.slice(0, 200) || '',
          })),
        }));
        setRecentDecisions(decisions as RecentDecision[]);
      }).catch(() => {});

    // Fetch Bobby's vibe — real data from latest completed cycle
    fetch(`${SB}/rest/v1/agent_cycles?status=eq.completed&order=started_at.desc&limit=1&select=mood,safe_mode_active,trades_executed,signals_found,vibe_phrase,started_at`, { headers })
      .then(r => r.json())
      .then((cycles: any[]) => {
        if (!Array.isArray(cycles) || !cycles.length) return;
        const c = cycles[0];
        const mood = c.safe_mode_active ? 'defensive' : (c.mood || 'cautious');
        const phrase = c.vibe_phrase || 'Bobby is analyzing the market. Awaiting next cycle...';
        const age = Date.now() - new Date(c.started_at).getTime();
        const freshness = age < 3600000 ? 'fresh' : age < 21600000 ? 'stable' : 'stale';
        setVibe({
          mood,
          phrase,
          safeMode: c.safe_mode_active || false,
          signals: c.signals_found || 0,
          executed: c.trades_executed || 0,
          freshness,
          startedAt: c.started_at,
        });
      }).catch(() => {});
  }, []);

  // Fetch personal conviction board when in personal mode
  useEffect(() => {
    if (roomMode !== 'personal' || !profile?.wallet_address) return;
    const wallet = profile.wallet_address;
    // Fetch user_interests (tracked assets + conviction)
    fetch(`${SB}/rest/v1/user_interests?wallet_address=eq.${wallet}&active=eq.true&order=created_at.desc&limit=8&select=asset,context,last_conviction,target_threshold`, { headers })
      .then(r => r.json())
      .then(async (interests: any[]) => {
        if (!Array.isArray(interests)) return;
        // Fetch latest private debates for each asset
        let debates: any[] = [];
        if (profileId) {
          const debRes = await fetch(`${SB}/rest/v1/forum_threads?scope=eq.private&agent_profile_id=eq.${profileId}&order=created_at.desc&limit=10&select=symbol,direction,conviction_score,status,created_at`, { headers });
          debates = await debRes.json().catch(() => []);
        }
        const convictions: UserConviction[] = interests.map(i => ({
          asset: i.asset,
          conviction: typeof i.last_conviction === 'string' ? parseFloat(i.last_conviction) : (i.last_conviction || 0),
          context: i.context || '',
          latestDebate: Array.isArray(debates) ? debates.find((d: any) => d.symbol === i.asset) : undefined,
        }));
        setUserConvictions(convictions);
      }).catch(() => {});
  }, [roomMode, profile, profileId]);

  // Countdown to next hourly scan
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const next = new Date(now);
      next.setUTCMinutes(0, 0, 0); // Next hour sharp
      next.setUTCHours(next.getUTCHours() + 1);
      const diff = next.getTime() - now.getTime();
      const m = Math.floor(diff / 60000);
      const sec = Math.floor((diff % 60000) / 1000);
      setNextScan(`${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`);
      setNextScanPct(1 - diff / 3600000);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const s = pnl?.summary;

  // Profit factor calc (memoized — countdown timer re-renders every 1s)
  const profitFactor = useMemo(() => {
    if (!pnl) return 0;
    const gross = pnl.closedPositions.filter(t => t.realizedPnl > 0).reduce((s, t) => s + t.realizedPnl, 0);
    const loss = Math.abs(pnl.closedPositions.filter(t => t.realizedPnl < 0).reduce((s, t) => s + t.realizedPnl, 0));
    return loss > 0 ? gross / loss : 0;
  }, [pnl]);

  // Equity chart data (memoized)
  const chartData = useMemo(() => {
    if (!pnl || !s) return [];
    let cumPnl = 0;
    const points = [
      { trade: 0, equity: s.startingCapital, label: 'START', result: 'START', symbol: '', pnl: undefined as number | undefined },
      ...pnl.closedPositions.map((t, i) => {
        cumPnl += t.realizedPnl;
        return { trade: i + 1, equity: s.startingCapital + cumPnl, label: `#${i + 1}`, result: t.result, symbol: t.symbol, pnl: t.realizedPnl };
      }),
    ];
    // If no trades yet, show current equity as "NOW" point so chart renders
    if (pnl.closedPositions.length === 0) {
      points.push({ trade: 1, equity: s.currentEquity, label: 'NOW', result: 'START', symbol: '', pnl: undefined });
    }
    return points;
  }, [pnl, s]);

  const latestTechnical = useMemo(() => {
    const technical = recentDecisions[0]?.trigger_data?.technical;
    return technical && typeof technical === 'object' ? technical as TechnicalMarketSummary : null;
  }, [recentDecisions]);

  const focusTechnical = useMemo(() => {
    return getTechnicalAsset(latestTechnical, latestDebate?.symbol || recentDecisions[0]?.symbol);
  }, [latestTechnical, latestDebate, recentDecisions]);

  const focusTechnicalBreakdown = useMemo(() => {
    if (!focusTechnical) return [];
    return Object.entries(focusTechnical.breakdown).sort(([, a], [, b]) => b.weight - a.weight);
  }, [focusTechnical]);

  return (
    <KineticShell activeTab="challenge">
      <Helmet>
        <title>$100 Challenge | Bobby Agent Trader</title>
        <meta name="description" content="Can an AI trading room survive with $100? Three agents debate every trade. On-chain proof on X Layer. Track Bobby's live performance." />
        <link rel="canonical" href="https://bobbyprotocol.xyz/agentic-world/bobby/challenge" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://bobbyprotocol.xyz/agentic-world/bobby/challenge" />
        <meta property="og:title" content="Bobby Live Challenge | AI Trading Dashboard" />
        <meta property="og:description" content="Witness Bobby's autonomous trading. Zero human intervention. Multi-agent debate. On-chain accountability." />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Bobby Live Challenge | AI Trading Dashboard" />
        <meta name="twitter:description" content="Track Bobby's live trading on OKX. Balance, win rate, every trade verified on X Layer." />
      </Helmet>

      <div className="max-w-7xl mx-auto p-6 md:p-10 pb-20">

          {/* === Hero Header === */}
          <motion.header initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-2xl">
              <div className="font-mono text-[8px] text-green-500 mb-4 tracking-widest uppercase">system_status: active</div>
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter leading-none mb-4">
                BOBBY <span className="text-white/20">$100</span> CHALLENGE
              </h1>
              <p className="text-white/40 max-w-lg font-mono text-sm leading-relaxed">
                Autonomous trading agent on OKX X Layer. Multi-agent debate before every decision.
                Every trade committed on-chain before the outcome is known.
              </p>
            </div>
            {/* Next Scan Countdown — Stitch amber card */}
            <div className="bg-white/[0.02] backdrop-blur-sm border border-amber-500/15 p-6 flex flex-col items-end rounded border-l-4 border-l-amber-500">
              <span className="font-mono text-[8px] text-amber-500 mb-2 tracking-widest">NEXT_SCAN_IN</span>
              <div className="font-mono text-4xl font-bold text-amber-500 tracking-tighter" style={{ fontVariantNumeric: 'tabular-nums' }}>{nextScan}</div>
              <div className="mt-2 h-1 w-full bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 transition-all" style={{ width: `${nextScanPct * 100}%`, boxShadow: '0 0 8px #F59E0B' }} />
              </div>
            </div>
          </motion.header>

          {/* === VIBE TRADING — Bobby's current mood (real data from agent_cycles) === */}
          {vibe ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className={`mb-8 p-5 rounded-xl border-l-4 min-h-[100px] ${
                vibe.safeMode
                  ? 'border-l-red-500 bg-red-500/[0.03] border border-red-500/10'
                  : vibe.mood === 'confident'
                  ? 'border-l-green-500 bg-white/[0.02] border border-white/[0.04]'
                  : vibe.mood === 'defensive'
                  ? 'border-l-red-500 bg-white/[0.02] border border-white/[0.04]'
                  : 'border-l-amber-500 bg-white/[0.02] border border-white/[0.04]'
              } hover:bg-white/[0.04] transition-all`}
            >
              {/* Header: badge + freshness */}
              <div className="flex items-center justify-between mb-3">
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full tracking-widest ${
                  vibe.safeMode
                    ? 'bg-red-500/20 text-red-400'
                    : vibe.mood === 'confident'
                    ? 'bg-green-500/15 text-green-400'
                    : vibe.mood === 'defensive'
                    ? 'bg-red-500/15 text-red-400'
                    : 'bg-amber-500/15 text-amber-400'
                }`}>
                  {vibe.safeMode ? 'CRITICAL_STATE: CAPITAL_PRESERVATION' : vibe.mood.toUpperCase()}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-white/40">
                    {(() => {
                      const age = Date.now() - new Date(vibe.startedAt).getTime();
                      const h = Math.floor(age / 3600000);
                      return h < 1 ? 'just now' : `${h}h ago`;
                    })()}
                  </span>
                  <span className={`w-2 h-2 rounded-full ${
                    vibe.freshness === 'fresh'
                      ? 'bg-green-500 animate-ping'
                      : vibe.freshness === 'stable'
                      ? 'bg-amber-500'
                      : 'bg-red-500/50'
                  }`} />
                  {vibe.freshness === 'fresh' && (
                    <span className="w-2 h-2 rounded-full bg-green-500 absolute" />
                  )}
                </div>
              </div>
              {/* Vibe phrase — the hero */}
              <p className="text-white/90 text-sm font-mono italic leading-relaxed line-clamp-3">
                <span className="text-white/30 not-italic">{`> `}</span>{vibe.phrase}
              </p>
              {/* Footer stats */}
              <div className="mt-3 text-[8px] font-mono text-white/30 tracking-widest">
                SCANNED: {vibe.signals} SIGNALS | EXECUTED: {vibe.executed}
                {vibe.safeMode && ' | SAFE_MODE: ACTIVE'}
              </div>
            </motion.div>
          ) : !loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-8 p-5 rounded-xl min-h-[100px] border border-dashed border-white/[0.1] bg-white/[0.01]"
            >
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-white/[0.05] text-white/40 tracking-widest">
                INITIALIZING...
              </span>
              <p className="mt-3 text-white/40 text-sm font-mono italic leading-relaxed">
                <span className="text-white/20 not-italic">{`> `}</span>Bobby is currently scanning the market. Awaiting first vibe assessment...
              </p>
            </motion.div>
          )}

          {/* === CONVICTION BOARD — Personal Mode === */}
          {roomMode === 'personal' && hasAgent && userConvictions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-8"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[8px] font-mono text-white/30 tracking-widest">CONVICTION_BOARD</span>
                <span className={`text-[8px] font-mono px-2 py-0.5 rounded-sm ${accentColor} bg-white/[0.03]`}>
                  {profile?.markets?.length || 0} MARKETS
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {userConvictions.map(uc => {
                  const conv = Math.abs(uc.conviction);
                  const direction = uc.latestDebate?.direction || (uc.conviction > 0.3 ? 'long' : uc.conviction < -0.3 ? 'short' : 'neutral');
                  const dirColor = direction === 'long' ? 'text-green-400' : direction === 'short' ? 'text-red-400' : 'text-white/40';
                  const dirLabel = direction === 'long' ? 'BULLISH' : direction === 'short' ? 'BEARISH' : 'NEUTRAL';
                  return (
                    <div key={uc.asset}
                      className={`bg-white/[0.02] border ${accentBorder} rounded-lg p-3 hover:bg-white/[0.04] transition-all`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono font-bold text-white">{uc.asset}</span>
                        <span className={`text-[8px] font-mono font-bold ${dirColor}`}>{dirLabel}</span>
                      </div>
                      <div className="h-1 w-full bg-white/[0.04] rounded-full overflow-hidden mb-2">
                        <div
                          className={`h-full rounded-full transition-all ${direction === 'long' ? 'bg-green-500' : direction === 'short' ? 'bg-red-500' : 'bg-white/20'}`}
                          style={{ width: `${Math.min(100, conv * 100)}%` }}
                        />
                      </div>
                      <div className="text-[9px] font-mono text-white/30">
                        {uc.latestDebate ? uc.latestDebate.status.toUpperCase() : 'WATCHING'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {loading ? (
            <div className="text-center py-20">
              <span className="text-[10px] font-mono text-white/20 animate-pulse">LOADING CHALLENGE DATA...</span>
            </div>
          ) : s ? (
            <>
              {/* === Bento Grid Metrics — Stitch style === */}
              <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
                {/* Balance — col-span-2 hero */}
                <div className="md:col-span-2 bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] p-8 flex flex-col justify-between relative overflow-hidden rounded group hover:bg-white/[0.03] transition-all">
                  <div className="absolute top-0 right-0 p-4">
                    <div className="w-1 h-1 bg-green-500" style={{ boxShadow: '0 0 5px #22C55E' }} />
                  </div>
                  <div className="font-mono text-xs text-white/40 mb-8 tracking-widest">NET_BALANCE_AVAILABLE</div>
                  <div>
                    <div className="text-6xl md:text-7xl font-mono font-black text-green-400 tracking-tighter mb-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      ${s.totalTrades === 0 ? s.startingCapital.toFixed(2) : s.currentEquity.toFixed(2)}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono text-white/30">
                      <span className={s.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {s.totalTrades === 0 ? '0.00' : `${s.totalReturn >= 0 ? '+' : ''}${s.totalReturn}`}%
                      </span>
                      <span>from ${s.startingCapital} initial</span>
                    </div>
                  </div>
                </div>
                {/* Total Return */}
                <div className="bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] p-8 rounded hover:bg-white/[0.04] transition-all duration-300">
                  <div className="font-mono text-xs text-white/40 mb-8 tracking-widest">TOTAL_RETURN</div>
                  <div className={`text-4xl md:text-5xl font-mono font-bold tracking-tighter ${s.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {s.totalReturn >= 0 ? '+' : ''}{s.totalReturn}%
                  </div>
                  <div className="mt-4 text-[10px] font-mono text-white/20 uppercase">
                    {s.totalReturn >= 0 ? 'Gain' : 'Loss'} relative to start
                  </div>
                </div>
                {/* Win Rate */}
                <div className="bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] p-8 rounded hover:bg-white/[0.04] transition-all duration-300">
                  <div className="font-mono text-xs text-white/40 mb-8 tracking-widest">WIN_RATE</div>
                  <div className="text-4xl md:text-5xl font-mono font-bold tracking-tighter" style={{ fontVariantNumeric: 'tabular-nums' }}>{s.winRate.toFixed(1)}%</div>
                  <div className="mt-4 text-[10px] font-mono text-white/20 uppercase">{s.wins}/{s.totalTrades} Successful cycles</div>
                </div>
              </motion.section>

              {/* === Main Split: Timeline (2/3) + Sidebar (1/3) === */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

                {/* === Left Column: Trade Timeline + Chart === */}
                <div className="lg:col-span-2 space-y-8">

                  {/* Equity Curve — Recharts */}
                  {chartData.length > 1 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                      className="bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] rounded p-6">
                      <div className="flex items-center justify-between mb-4">
                        <span className="font-mono text-xs text-white/40 tracking-widest">EQUITY_CURVE</span>
                        <span className="font-mono text-[10px] text-green-400/60">{pnl!.closedPositions.length} TRADES</span>
                      </div>
                      <div className="w-full h-48 sm:h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                            <defs>
                              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={s.currentEquity >= s.startingCapital ? '#00FF88' : '#ef4444'} stopOpacity={0.3} />
                                <stop offset="100%" stopColor={s.currentEquity >= s.startingCapital ? '#00FF88' : '#ef4444'} stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="label" tick={{ fill: '#6B7280', fontSize: 9, fontFamily: 'monospace' }} axisLine={{ stroke: 'rgba(255,255,255,0.04)' }} tickLine={false} interval="preserveStartEnd" />
                            <YAxis tick={{ fill: '#6B7280', fontSize: 9, fontFamily: 'monospace' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v.toFixed(1)}`} domain={['dataMin - 0.5', 'dataMax + 0.5']} />
                            <ReferenceLine y={s.startingCapital} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
                            <Tooltip content={({ active, payload }: any) => {
                              if (!active || !payload?.[0]) return null;
                              const d = payload[0].payload;
                              return (
                                <div className="bg-[#161A1D] border border-white/10 rounded px-3 py-2 shadow-xl">
                                  <p className="text-[10px] font-mono text-white/80 font-bold">{d.symbol ? `${d.symbol} — ${d.result}` : 'START'}</p>
                                  <p className="text-xs font-mono text-green-400">${d.equity.toFixed(4)}</p>
                                  {d.pnl !== undefined && <p className={`text-[9px] font-mono ${d.pnl >= 0 ? 'text-green-400/60' : 'text-red-400/60'}`}>PnL: {d.pnl >= 0 ? '+' : ''}${d.pnl.toFixed(4)}</p>}
                                </div>
                              );
                            }} />
                            <Area type="monotone" dataKey="equity" stroke={s.currentEquity >= s.startingCapital ? '#00FF88' : '#ef4444'} strokeWidth={2} fill="url(#equityGrad)"
                              dot={(props: any) => {
                                const { cx, cy, payload } = props;
                                if (payload.result === 'START') return <circle cx={cx} cy={cy} r={3} fill="#6B7280" stroke="none" />;
                                return <circle cx={cx} cy={cy} r={3.5} fill={payload.result === 'WIN' ? '#00FF88' : '#ef4444'} stroke="#050505" strokeWidth={1.5} />;
                              }}
                              activeDot={{ r: 5, stroke: s.currentEquity >= s.startingCapital ? '#00FF88' : '#ef4444', strokeWidth: 2, fill: '#050505' }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </motion.div>
                  )}

                  {/* Live Execution Log — Stitch glass-card trade items */}
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="font-mono text-sm font-black tracking-[0.3em] uppercase flex items-center gap-3">
                        <span className="w-2 h-2 bg-green-500 rounded-full" />
                        Live_Execution_Log
                      </h2>
                      <a href="https://www.oklink.com/xlayer/address/0xf841b428e6d743187d7be2242eccc1078fde2395"
                        target="_blank" rel="noopener noreferrer"
                        className="font-mono text-[10px] text-white/30 hover:text-green-400 transition-colors flex items-center gap-1">
                        VIEW_ON_CHAIN →
                      </a>
                    </div>
                    <div className="space-y-3">
                      {/* Pending scan indicator */}
                      <div className="bg-white/[0.02] backdrop-blur-sm border border-amber-500/15 border-l-2 border-l-amber-500 rounded p-5 flex items-center justify-between">
                        <div className="flex items-center gap-6">
                          <div className="font-mono text-xs text-amber-500">PENDING</div>
                          <div>
                            <div className="font-mono text-sm font-bold">SCANNING_MARKET...</div>
                            <div className="text-[10px] text-white/30 font-mono">IDENTIFYING_ALPHA_VECTORS</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                          <div className="font-mono text-[10px] text-amber-500">NEXT: {nextScan}</div>
                        </div>
                      </div>

                      {/* Real trades */}
                      {pnl?.closedPositions.slice(0, 5).map((trade, i) => {
                        const isWin = trade.result === 'WIN';
                        return (
                          <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.5 + i * 0.05 }}
                            className={`bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] rounded p-5 flex items-center justify-between group hover:bg-white/[0.04] transition-all ${i >= 3 ? 'opacity-60' : ''}`}>
                            <div className="flex items-center gap-6">
                              <div className="font-mono text-xs text-white/25">
                                {new Date(trade.closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </div>
                              <div>
                                <div className="font-mono text-sm font-bold">
                                  {trade.symbol}/USDT
                                  <span className={`text-[10px] ml-2 font-normal ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                                    {trade.direction.toUpperCase()}
                                  </span>
                                </div>
                                <div className="text-[10px] text-white/20 font-mono">
                                  {trade.entryPrice.toFixed(2)} → {trade.exitPrice.toFixed(2)} · {trade.leverage}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`font-mono text-sm font-bold ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                                {trade.realizedPnl >= 0 ? '+' : ''}${trade.realizedPnl.toFixed(4)}
                              </div>
                              <div className="text-[10px] text-white/20 font-mono uppercase">
                                {isWin ? 'TAKE_PROFIT' : 'STOP_LOSS'}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                      {(pnl?.closedPositions.length || 0) > 5 && (
                        <div className="text-center py-2">
                          <span className="text-[9px] font-mono text-white/15">+ {pnl!.closedPositions.length - 5} MORE TRADES</span>
                        </div>
                      )}
                    </div>
                  </motion.div>

                  {/* Agent Decisions */}
                  {recentDecisions.length > 0 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="font-mono text-sm font-black tracking-[0.3em] uppercase flex items-center gap-3">
                          <span className="w-2 h-2 bg-yellow-500 rounded-full" />
                          Agent_Decisions
                        </h2>
                        <Link to="/agentic-world/forum" className="font-mono text-[10px] text-white/30 hover:text-green-400 transition-colors">
                          VIEW_ALL →
                        </Link>
                      </div>
                      <div className="space-y-3">
                        {recentDecisions.slice(0, 3).map((d, i) => {
                          const cioPost = d.posts.find(p => p.agent === 'cio');
                          const alphaPost = d.posts.find(p => p.agent === 'alpha');
                          const convPct = Math.round((d.conviction_score || 0) * 100);
                          const isExecute = convPct >= 60;
                          const technicalAsset = getTechnicalAsset(d.trigger_data?.technical, d.symbol);

                          return (
                            <div key={d.id} className="bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] rounded p-5 hover:bg-white/[0.04] transition-all">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <span className="font-mono text-sm font-bold">{d.symbol || '?'}/USDT</span>
                                  {d.direction && (
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded tracking-wider ${
                                      d.direction === 'long' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                                    }`}>{d.direction.toUpperCase()}</span>
                                  )}
                                  <span className={`text-[9px] font-mono font-bold ${convPct >= 60 ? 'text-green-400' : convPct >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                                    {convPct}%
                                  </span>
                                  <span className={`text-[8px] font-mono px-2 py-0.5 rounded ${
                                    d.status === 'executed' ? 'bg-green-500/10 text-green-400' :
                                    d.status === 'rejected' ? 'bg-red-500/10 text-red-400' :
                                    isExecute ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                                  }`}>
                                    {d.status === 'executed' ? 'EXECUTED' : d.status === 'rejected' ? 'REJECTED' : isExecute ? 'EXECUTE' : 'REJECT'}
                                  </span>
                                  {technicalAsset && (
                                    <span className={`text-[8px] font-mono px-2 py-0.5 rounded ${
                                      technicalAsset.compositeScore >= 0 ? 'bg-cyan-500/10 text-cyan-300' : 'bg-fuchsia-500/10 text-fuchsia-300'
                                    }`}>
                                      T-PULSE {formatSignedScore(technicalAsset.compositeScore)}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] font-mono text-white/20">
                                  {new Date(d.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              {(cioPost || alphaPost) && (
                                <p className="text-[10px] font-mono text-white/30 leading-relaxed mt-1">
                                  {(cioPost || alphaPost)!.content.slice(0, 140)}...
                                </p>
                              )}
                              <Link to={`/agentic-world/bobby?q=${encodeURIComponent(`Why did you ${d.direction || 'analyze'} ${d.symbol || 'the market'}?`)}`}
                                className="text-[9px] font-mono text-yellow-400/30 hover:text-yellow-400 transition-colors mt-2 inline-block">
                                ASK BOBBY WHY →
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* === Right Sidebar === */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                  className="space-y-6">

                  {focusTechnical && latestTechnical && (
                    <div className="bg-white/[0.02] backdrop-blur-sm border border-cyan-500/10 p-6 rounded relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-emerald-500/5" />
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="font-mono text-xs text-cyan-300 uppercase tracking-widest">Technical_Pulse</h3>
                            <div className="mt-1 text-[10px] font-mono text-white/25">
                              {focusTechnical.symbol}/USDT · {latestTechnical.regime.toUpperCase()}
                            </div>
                          </div>
                          <div className={`text-right ${focusTechnical.compositeScore >= 0 ? 'text-cyan-300' : 'text-fuchsia-300'}`}>
                            <div className="font-mono text-2xl font-bold">{formatSignedScore(focusTechnical.compositeScore)}</div>
                            <div className="text-[9px] font-mono uppercase">{Math.round(focusTechnical.conviction * 100)}% conviction</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                          {[
                            { label: 'SIGNAL', value: focusTechnical.signal.replace('_', ' ') },
                            { label: 'AGREEMENT', value: `${Math.round(focusTechnical.agreement * 100)}%` },
                            { label: 'ENTRY', value: formatTechnicalPrice(focusTechnical.tradePlan.entry) },
                            { label: 'STOP', value: formatTechnicalPrice(focusTechnical.tradePlan.stop) },
                            { label: 'TARGET', value: formatTechnicalPrice(focusTechnical.tradePlan.target) },
                            { label: 'R/R', value: focusTechnical.tradePlan.rewardRisk ? `${focusTechnical.tradePlan.rewardRisk.toFixed(2)}x` : '—' },
                          ].map((item) => (
                            <div key={item.label} className="p-2 bg-black/30 rounded border border-white/5">
                              <div className="text-[8px] font-mono text-white/25 tracking-widest">{item.label}</div>
                              <div className="mt-1 text-[11px] font-mono text-white/85 uppercase">{item.value}</div>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-4">
                          {focusTechnicalBreakdown.map(([name, reading]) => (
                            <div
                              key={name}
                              className={`rounded border px-2 py-2 ${getBiasClasses(reading.bias)}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] font-mono font-bold">{name}</span>
                                <span className="text-[8px] font-mono">{Math.round(reading.weight * 100)}%</span>
                              </div>
                              <div className="mt-1 text-[10px] font-mono">{reading.bias.toUpperCase()}</div>
                              <div className="text-[9px] font-mono opacity-80">{formatSignedScore(reading.score)}</div>
                            </div>
                          ))}
                        </div>

                        <p className="text-[10px] font-mono text-white/35 leading-relaxed mb-3">
                          {focusTechnical.overview}
                        </p>
                        <p className="text-[9px] font-mono text-white/25 leading-relaxed">
                          {focusTechnical.tradePlan.invalidation}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Operational Params — Stitch style */}
                  <div className="bg-[#1c1b1b] p-6 rounded">
                    <h3 className="font-mono text-xs text-white/40 uppercase mb-6 tracking-widest border-b border-white/5 pb-2">Operational_Params</h3>
                    <div className="space-y-4 font-mono">
                      {[
                        { label: 'CHAIN:', value: 'OKX X LAYER (196)', color: '' },
                        { label: 'EXCHANGE:', value: 'OKX CEX API', color: '' },
                        { label: 'DEX:', value: 'OKX DEX API', color: '' },
                        { label: 'SIGNALS:', value: 'ONCHAINOS SKILLS', color: 'text-green-400' },
                        { label: 'STRATEGY:', value: 'MULTI_AGENT_DEBATE', color: 'text-green-400' },
                        { label: 'RUNTIME:', value: 'CLAUDE CODE + OPENCLAW', color: '' },
                        { label: 'CYCLE:', value: 'EVERY_6_HOURS', color: '' },
                        { label: 'MAX_LEVERAGE:', value: '5x', color: '' },
                        { label: 'CIRCUIT_BREAKER:', value: '-20%', color: 'text-amber-400' },
                        { label: 'STOP_LOSS:', value: 'MANDATORY', color: 'text-green-400' },
                        { label: 'PROFIT_FACTOR:', value: profitFactor.toFixed(2), color: profitFactor >= 1 ? 'text-green-400' : 'text-red-400' },
                      ].map(p => (
                        <div key={p.label} className="flex justify-between items-center">
                          <span className="text-[10px] text-white/30">{p.label}</span>
                          <span className={`text-[10px] ${p.color || 'text-white/80'}`}>{p.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Proof of Custody — Stitch style */}
                  <div className="bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] p-6 rounded relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent" />
                    <h3 className="font-mono text-xs text-white/40 uppercase mb-4 relative z-10">Proof_of_Custody</h3>
                    <div className="relative z-10 space-y-3">
                      <div className="p-3 bg-black/40 rounded flex items-center justify-between border border-white/5">
                        <span className="font-mono text-[10px] text-white/30">CONTRACT</span>
                        <span className="font-mono text-[10px] text-green-400">0xF841...2395</span>
                      </div>
                      <div className="p-3 bg-black/40 rounded flex items-center justify-between border border-white/5">
                        <span className="font-mono text-[10px] text-white/30">TREASURY</span>
                        <span className="font-mono text-[10px] text-green-400">0x09a8...dcea</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <OnChainStat label="COMMITS" selector="0x78bb86d3" />
                        <OnChainStat label="PENDING" selector="0xea70b4af" />
                      </div>
                      <p className="text-[10px] text-white/20 italic leading-relaxed font-mono">
                        Every debate committed on X Layer before the outcome. Verified via OKX Agent Trade Kit.
                      </p>
                      <a href="https://www.oklink.com/xlayer/address/0xf841b428e6d743187d7be2242eccc1078fde2395"
                        target="_blank" rel="noopener noreferrer"
                        className="block w-full py-2 bg-white/5 hover:bg-white/10 text-center font-mono text-[10px] border border-white/10 uppercase tracking-widest transition-all rounded">
                        Audit_On_Chain
                      </a>
                    </div>
                  </div>

                  {/* Agent Council */}
                  <div className="bg-[#1c1b1b] p-6 rounded">
                    <h3 className="font-mono text-xs text-white/40 uppercase mb-4 tracking-widest border-b border-white/5 pb-2">Agent_Council</h3>
                    <div className="space-y-3">
                      {[
                        { name: 'BOBBY_CIO', role: 'Final decision maker', color: 'text-yellow-400', dot: 'bg-yellow-500' },
                        { name: 'ALPHA_HUNTER', role: 'Opportunity scanner', color: 'text-green-400', dot: 'bg-green-500' },
                        { name: 'RED_TEAM', role: 'Thesis destroyer', color: 'text-red-400', dot: 'bg-red-500' },
                      ].map(a => (
                        <div key={a.name} className="flex items-center gap-3">
                          <div className={`w-1.5 h-1.5 rounded-full ${a.dot} flex-shrink-0`} />
                          <div>
                            <span className={`text-[10px] font-mono font-bold ${a.color}`}>{a.name}</span>
                            <span className="text-[9px] font-mono text-white/20 ml-2">{a.role}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 text-[8px] font-mono text-white/15">
                      {s.totalTrades} debates · {recentDecisions.length} loaded
                    </div>
                  </div>

                  {/* Infrastructure */}
                  <div className="bg-white/[0.02] backdrop-blur-sm border border-green-500/10 p-6 rounded">
                    <h3 className="font-mono text-xs text-green-400 uppercase mb-4 tracking-widest flex items-center gap-2">
                      <span className="w-1 h-1 bg-green-500 rounded-full" />
                      Infrastructure
                    </h3>
                    <div className="space-y-2 font-mono text-[10px]">
                      {[
                        { step: '01', label: 'MARKET_INTEL', desc: 'OKX + Polymarket' },
                        { step: '02', label: 'DEBATE', desc: 'Alpha vs Red Team' },
                        { step: '03', label: 'VERDICT', desc: 'CIO conviction' },
                        { step: '04', label: 'EXECUTE', desc: 'OKX + X Layer' },
                      ].map(st => (
                        <div key={st.step} className="flex items-center gap-3">
                          <span className="text-green-400/40 w-4">{st.step}</span>
                          <span className="text-white/60 font-bold">{st.label}</span>
                          <span className="text-white/20 ml-auto">{st.desc}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-col gap-2">
                      <a href="https://github.com/anthropics/claude-code" target="_blank" rel="noopener noreferrer"
                        className="text-[9px] font-mono text-white/30 hover:text-green-400 transition-colors">
                        CLAUDE CODE →
                      </a>
                      <a href="https://github.com/anthropics/claude-code/blob/main/AGENTS.md" target="_blank" rel="noopener noreferrer"
                        className="text-[9px] font-mono text-white/30 hover:text-green-400 transition-colors">
                        AGENT SDK →
                      </a>
                    </div>
                  </div>
                </motion.div>
              </div>
            </>
          ) : (
            <div className="text-center py-20 text-white/20 text-sm font-mono">No challenge data available</div>
          )}
        </div>
    </KineticShell>
  );
}
