// ============================================================
// Agent Trading Forum — Stitch Bloomberg-style design
// Multi-agent debates with glass-card feed, agent avatars,
// confidence bars, expandable threads with TradingView charts
// All data REAL from Supabase forum_threads + forum_posts
// ============================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { RefreshCw, MessageSquare, ChevronDown, ChevronUp, Zap, TrendingUp, Clock, Flame, Share2, Filter } from 'lucide-react';
import { useTradingRoom } from '@/hooks/useTradingRoom';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { TradingViewChart } from '@/components/charts/TradingViewChart';
import KineticShell from '@/components/kinetic/KineticShell';

const SB_URL = import.meta.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';

interface ForumPost {
  id: string;
  thread_id: string;
  agent: 'alpha' | 'redteam' | 'cio';
  content: string;
  upvotes: number;
  created_at: string;
}

interface ForumThread {
  id: string;
  topic: string;
  trigger_reason: string;
  status: string;
  language: string;
  conviction_score: number | null;
  price_at_creation: Record<string, number>;
  created_at: string;
  posts?: ForumPost[];
  symbol?: string;
  direction?: string;
  entry_price?: number;
  stop_price?: number;
  target_price?: number;
  resolution?: string;
  resolution_price?: number;
  resolution_pnl_pct?: number;
  resolved_at?: string;
  scope?: string;
  owner_wallet?: string;
  agent_profile_id?: string;
}

const AGENTS: Record<string, { name: string; badge: string; color: string; borderColor: string; bgTint: string }> = {
  alpha:   { name: 'ALPHA HUNTER', badge: 'bg-green-500/15 text-green-400', color: '#22c55e', borderColor: 'border-green-500', bgTint: 'bg-green-500/[0.03]' },
  redteam: { name: 'RED TEAM',     badge: 'bg-red-500/15 text-red-400',     color: '#ef4444', borderColor: 'border-red-500',   bgTint: 'bg-red-500/[0.03]' },
  cio:     { name: 'BOBBY CIO',    badge: 'bg-yellow-500/15 text-yellow-400', color: '#f59e0b', borderColor: 'border-yellow-500', bgTint: 'bg-yellow-500/[0.03]' },
};

const FILTERS = [
  { id: 'all', label: 'ALL' },
  { id: 'btc', label: 'BTC' },
  { id: 'eth', label: 'ETH' },
  { id: 'sol', label: 'SOL' },
];

const SORTS = [
  { id: 'new', label: 'NEWEST', Icon: Clock },
  { id: 'hot', label: 'HOT', Icon: Flame },
  { id: 'conviction', label: 'CONVICTION', Icon: TrendingUp },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function detectSymbol(topic: string): string {
  const t = topic.toLowerCase();
  if (/\bbtc\b|bitcoin/i.test(t)) return 'btc';
  if (/\beth\b|ethereum/i.test(t)) return 'eth';
  if (/\bsol\b|solana/i.test(t)) return 'sol';
  return 'all';
}

// Bloomberg-style Thread Card
function ThreadCard({ thread, expanded, onToggle }: { thread: ForumThread; expanded: boolean; onToggle: () => void }) {
  const conviction = thread.conviction_score;
  const convPct = conviction !== null ? Math.round(conviction * 100) : 0;
  const alphaPost = thread.posts?.find(p => p.agent === 'alpha');
  const cioPost = thread.posts?.find(p => p.agent === 'cio');

  const statusBadge = thread.resolution === 'win'
    ? { text: `WIN +${thread.resolution_pnl_pct}%`, cls: 'bg-green-500/15 text-green-400' }
    : thread.resolution === 'loss'
    ? { text: `LOSS ${thread.resolution_pnl_pct}%`, cls: 'bg-red-500/15 text-red-400' }
    : thread.status === 'active'
    ? { text: 'LIVE', cls: 'bg-green-500/10 text-green-400' }
    : { text: thread.status?.toUpperCase() || 'PENDING', cls: 'bg-white/5 text-white/30' };

  return (
    <motion.article layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`bg-white/[0.02] backdrop-blur-sm border rounded overflow-hidden transition-all ${
        expanded ? 'border-green-500/20' : 'border-white/[0.04] hover:border-white/[0.08]'
      } ${thread.resolution === 'win' ? 'border-l-4 border-l-green-500' : thread.resolution === 'loss' ? 'border-l-4 border-l-red-500' : thread.direction === 'long' ? 'border-l-4 border-l-green-500' : thread.direction === 'short' ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-amber-500/50'}`}>

      {/* Compact card header */}
      <div className="cursor-pointer p-4 flex items-start gap-4" onClick={onToggle}>
        {/* Conviction score */}
        <div className="flex flex-col items-center flex-shrink-0 w-12">
          <span className={`text-2xl font-mono font-black ${
            convPct >= 70 ? 'text-green-400' : convPct >= 40 ? 'text-amber-400' : 'text-red-400'
          }`}>{conviction !== null ? Math.round(conviction * 10) : '?'}</span>
          <span className="text-[7px] font-mono text-white/20">/10</span>
          {/* Confidence bars */}
          <div className="flex gap-[2px] mt-1.5">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className={`w-1.5 h-3 ${i < Math.round(convPct / 14) ? (convPct >= 70 ? 'bg-green-500' : convPct >= 40 ? 'bg-amber-500' : 'bg-red-500') : 'bg-white/[0.04]'}`} />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded tracking-wider ${statusBadge.cls}`}>{statusBadge.text}</span>
            {thread.direction && thread.symbol && (
              <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${
                thread.direction === 'long' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
              }`}>{thread.direction === 'long' ? '↑' : '↓'} {thread.symbol}</span>
            )}
            {/* OKX Agent Trade Kit indicator badges — extracted from debate content */}
            {(() => {
              const allContent = (thread.posts || []).map((p: ForumPost) => p.content).join(' ');
              const indicators: string[] = [];
              if (/RSI/i.test(allContent)) indicators.push('RSI');
              if (/MACD/i.test(allContent)) indicators.push('MACD');
              if (/Bollinger|BB\b/i.test(allContent)) indicators.push('BB');
              if (/SuperTrend/i.test(allContent)) indicators.push('ST');
              if (/AHR999/i.test(allContent)) indicators.push('AHR999');
              if (/Rainbow/i.test(allContent)) indicators.push('RAINBOW');
              if (/ATR/i.test(allContent)) indicators.push('ATR');
              if (/KDJ/i.test(allContent)) indicators.push('KDJ');
              if (/EMA/i.test(allContent)) indicators.push('EMA');
              if (!indicators.length) return null;
              return (
                <span className="flex items-center gap-1">
                  <span className="text-[7px] font-mono text-cyan-400/40">OKX_TA:</span>
                  {indicators.slice(0, 4).map(ind => (
                    <span key={ind} className="text-[7px] font-mono px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-400/70 border border-cyan-500/10">{ind}</span>
                  ))}
                </span>
              );
            })()}
            <span className="text-[8px] font-mono text-white/15 ml-auto">{timeAgo(thread.created_at)}</span>
          </div>

          <h3 className="text-sm font-bold text-white/80 leading-snug mb-1.5">{thread.topic}</h3>

          {/* Agent preview — collapsed */}
          {!expanded && cioPost && (
            <p className="text-[10px] font-mono text-white/25 truncate leading-relaxed">
              CIO: {cioPost.content.slice(0, 120)}...
            </p>
          )}
        </div>

        <div className="text-white/15 flex-shrink-0 mt-1">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* Expanded debate — Stitch "Expanded Agent Debate" design */}
      <AnimatePresence>
        {expanded && thread.posts && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <div className="px-4 pb-5 border-t border-white/[0.04]">

              {/* Chart */}
              <TradingViewChart
                symbol={thread.symbol || (detectSymbol(thread.topic) === 'eth' ? 'ETH' : detectSymbol(thread.topic) === 'sol' ? 'SOL' : 'BTC')}
                entryPrice={thread.entry_price}
                stopPrice={thread.stop_price}
                targetPrice={thread.target_price}
                direction={thread.direction}
                height={220}
              />

              {/* ── Expanded Agent Debate — Stitch 3-section layout ── */}
              <div className="space-y-3 mt-4">

                {/* ▸ ALPHA HUNTER Section */}
                {(() => {
                  const alphaP = thread.posts.find(p => p.agent === 'alpha');
                  if (!alphaP) return null;
                  return (
                    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }}
                      className="border-l-4 border-green-500 bg-white/[0.02] rounded-r-lg p-4 hover:bg-white/[0.04] transition-all">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[9px] font-mono font-bold text-green-400 tracking-widest">ALPHA HUNTER</span>
                        <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">TIER-1 AGENT // BULLISH</span>
                        <span className="text-[8px] font-mono text-white/15 ml-auto">{timeAgo(alphaP.created_at)}</span>
                      </div>
                      <p className="text-[11px] text-white/60 leading-relaxed font-mono whitespace-pre-line">{alphaP.content}</p>
                      {/* Trade params inside Alpha card */}
                      {thread.entry_price && (
                        <div className="flex flex-col sm:flex-row gap-4 mt-3 pt-3 border-t border-white/[0.04]">
                          <div>
                            <span className="text-[8px] text-white/30 block">ENTRY</span>
                            <span className="text-green-400 font-mono text-[11px] font-bold">${thread.entry_price.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-[8px] text-white/30 block">TARGET</span>
                            <span className="text-green-400 font-mono text-[11px] font-bold">{thread.target_price ? `$${thread.target_price.toLocaleString()}` : '\u2014'}</span>
                          </div>
                          <div>
                            <span className="text-[8px] text-white/30 block">STOP</span>
                            <span className="text-red-400 font-mono text-[11px] font-bold">{thread.stop_price ? `$${thread.stop_price.toLocaleString()}` : '\u2014'}</span>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })()}

                {/* ▸ RED TEAM Section */}
                {(() => {
                  const redP = thread.posts.find(p => p.agent === 'redteam');
                  if (!redP) return null;
                  return (
                    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 }}
                      className="border-l-4 border-red-500 bg-white/[0.02] rounded-r-lg p-4 ml-4 sm:ml-6 hover:bg-white/[0.04] transition-all">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[9px] font-mono font-bold text-red-400 tracking-widest">RED TEAM</span>
                        <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">RISK MITIGATOR // BEARISH</span>
                        <span className="text-[8px] font-mono text-white/15 ml-auto">{timeAgo(redP.created_at)}</span>
                      </div>
                      <p className="text-[11px] text-white/60 leading-relaxed font-mono whitespace-pre-line">{redP.content}</p>
                    </motion.div>
                  );
                })()}

                {/* ▸ BOBBY CIO Section */}
                {(() => {
                  const cioP = thread.posts.find(p => p.agent === 'cio');
                  if (!cioP) return null;
                  return (
                    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
                      className="border-l-4 border-amber-500 bg-white/[0.02] rounded-r-lg p-4 hover:bg-white/[0.04] transition-all shadow-[0_0_20px_rgba(245,158,11,0.03)]">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[9px] font-mono font-bold text-amber-400 tracking-widest">BOBBY CIO</span>
                        <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">STRATEGIC OVERSEER // VERDICT</span>
                      </div>
                      <p className="text-[11px] text-white/60 leading-relaxed font-mono whitespace-pre-line">{cioP.content}</p>
                      {/* Conviction bar + verdict */}
                      {conviction !== null && (
                        <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-2">
                          <div className="flex items-center gap-3">
                            <div className="text-[8px] text-white/30">CONVICTION</div>
                            <div className="text-xl font-black text-amber-400">{(conviction * 10).toFixed(1)}<span className="text-xs text-white/20">/10</span></div>
                          </div>
                          <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${convPct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
                              className={`h-full rounded-full ${convPct >= 70 ? 'bg-gradient-to-r from-green-500 to-green-400' : convPct >= 40 ? 'bg-gradient-to-r from-amber-500 to-amber-400' : 'bg-gradient-to-r from-red-500 to-red-400'}`}
                              style={{ boxShadow: `0 0 8px ${convPct >= 70 ? '#22c55e' : convPct >= 40 ? '#f59e0b' : '#ef4444'}` }} />
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${convPct >= 60 ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                            <span className={`text-[10px] font-black tracking-widest ${convPct >= 60 ? 'text-green-400' : 'text-red-400'}`}>
                              {convPct >= 60 ? 'EXECUTE' : 'REJECT'}
                            </span>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })()}

                {/* ▸ Any other agent posts not covered above */}
                {thread.posts.filter(p => !['alpha', 'redteam', 'cio'].includes(p.agent)).map(post => {
                  const agent = AGENTS[post.agent] || AGENTS.cio;
                  return (
                    <div key={post.id} className={`border-l-4 ${agent.borderColor} bg-white/[0.02] rounded-r-lg p-4`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[9px] font-mono font-bold tracking-widest" style={{ color: agent.color }}>{agent.name}</span>
                      </div>
                      <p className="text-[11px] text-white/60 leading-relaxed font-mono whitespace-pre-line">{post.content}</p>
                    </div>
                  );
                })}
              </div>

              {/* ── Resolution Card — "TE LO DIJE" — Stitch style ── */}
              {thread.resolution && thread.resolution !== 'pending' && (
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
                  className={`relative overflow-hidden mt-4 border-l-4 ${
                    thread.resolution === 'win' ? 'border-green-500' : 'border-red-500'
                  } bg-white/[0.02] rounded-r-lg p-6`}>
                  {/* Background decoration */}
                  <div className={`absolute -right-8 -bottom-8 font-black text-8xl italic pointer-events-none select-none ${
                    thread.resolution === 'win' ? 'text-green-500/5' : 'text-red-500/5'
                  }`}>{thread.resolution === 'win' ? 'WIN' : 'LOSS'}</div>

                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-[9px] font-mono font-bold tracking-widest ${
                        thread.resolution === 'win' ? 'text-green-400' : 'text-red-400'
                      }`}>RESOLUTION: {thread.resolution.toUpperCase()}</span>
                      {thread.resolution_pnl_pct != null && (
                        <span className={`text-2xl font-black ${thread.resolution_pnl_pct > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {thread.resolution_pnl_pct > 0 ? '+' : ''}{thread.resolution_pnl_pct.toFixed(1)}%
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <p className="text-[9px] font-mono text-white/25 uppercase tracking-widest">
                        PNL REALIZED {thread.symbol ? `\u00B7 ${thread.symbol}` : ''}
                      </p>
                      <div className="flex gap-6 text-[9px] font-mono">
                        {thread.resolved_at && (
                          <div>
                            <span className="text-white/20 block uppercase">RESOLVED</span>
                            <span className="text-white/50">{new Date(thread.resolved_at).toLocaleDateString()}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-white/20 block uppercase">STATUS</span>
                          <span className={thread.resolution === 'win' ? 'text-green-400' : 'text-red-400'}>
                            {thread.resolution === 'win' ? 'SUCCESS' : 'STOPPED'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-4 pt-3 mt-3 border-t border-white/[0.04]">
                <Link to={`/agentic-world/bobby?q=${encodeURIComponent(`Why did you ${thread.direction || 'analyze'} ${thread.symbol || 'the market'}?`)}`}
                  className="flex items-center gap-1.5 text-[9px] font-mono text-yellow-400/40 hover:text-yellow-400 transition-colors">
                  <MessageSquare className="w-3 h-3" /> ASK BOBBY WHY
                </Link>
                <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${thread.topic}\n\nBobby CIO: ${conviction !== null ? `${Math.round(conviction * 10)}/10 conviction` : ''}\n\nAgent Trading Forum`)}&url=${encodeURIComponent(`${window.location.origin}/agentic-world/forum`)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[9px] font-mono text-white/20 hover:text-blue-400/60 transition-colors">
                  <Share2 className="w-3 h-3" /> SHARE
                </a>
                <span className="text-[8px] font-mono text-white/10 ml-auto">
                  {(thread.posts || []).length} agent posts
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

export default function AgentForumPage() {
  const { address } = useAccount();
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('new');
  const { profile, profileId, hasAgent, roomMode } = useTradingRoom();
  const [scope, setScope] = useState<'public' | 'my'>('public');
  const [lang, setLang] = useState<'all' | 'en' | 'es'>('all');
  const agentName = profile?.agent_name || localStorage.getItem('bobby_agent_name') || 'BOBBY';

  // Sync scope with room mode
  useEffect(() => {
    setScope(roomMode === 'personal' && hasAgent ? 'my' : 'public');
  }, [roomMode, hasAgent]);

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    try {
      // Server-side filtering — don't fetch all threads and filter client-side
      const scopeFilter = scope === 'my' && profileId
        ? `scope=eq.private&agent_profile_id=eq.${profileId}`
        : `or=(scope.is.null,scope.eq.public)`;
      const langFilter = lang !== 'all' ? `&language=eq.${lang}` : '';
      const res = await fetch(`${SB_URL}/rest/v1/forum_threads?${scopeFilter}${langFilter}&order=created_at.desc&limit=50&select=*`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      });
      if (!res.ok) { setLoading(false); return; }
      const threadData: ForumThread[] = await res.json();

      const threadIds = threadData.map(t => t.id);
      if (threadIds.length > 0) {
        const postsRes = await fetch(`${SB_URL}/rest/v1/forum_posts?thread_id=in.(${threadIds.join(',')})&order=created_at.asc`, {
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        });
        if (postsRes.ok) {
          const posts: ForumPost[] = await postsRes.json();
          for (const thread of threadData) {
            thread.posts = posts.filter(p => p.thread_id === thread.id);
          }
        }
      }
      setThreads(threadData);
      if (threadData.length > 0 && !expandedId) setExpandedId(threadData[0].id);
    } catch (e) { console.error('[Forum] Fetch error:', e); }
    setLoading(false);
  }, [expandedId, scope, profileId]);

  useEffect(() => { fetchThreads(); }, [scope, lang]);

  // Stats
  const forumStats = useMemo(() => {
    const resolved = threads.filter(t => t.resolution && t.resolution !== 'pending');
    const wins = resolved.filter(t => t.resolution === 'win').length;
    const avgConv = threads.length > 0
      ? (threads.reduce((s, t) => s + (t.conviction_score || 0), 0) / threads.length * 10).toFixed(1)
      : '0';
    return {
      total: threads.length,
      executed: threads.filter(t => t.status === 'executed' || t.resolution).length,
      rejected: threads.filter(t => t.status === 'rejected').length,
      avgConviction: avgConv,
      winRate: resolved.length > 0 ? Math.round((wins / resolved.length) * 100) : 0,
    };
  }, [threads]);

  // Filter + sort
  const filteredThreads = useMemo(() => {
    let filtered = threads;

    // Scope filtering is now server-side in fetchThreads()

    if (category !== 'all') {
      filtered = filtered.filter(t => detectSymbol(t.topic) === category || t.symbol?.toLowerCase() === category);
    }
    if (sort === 'conviction') {
      filtered = [...filtered].sort((a, b) => (b.conviction_score || 0) - (a.conviction_score || 0));
    } else if (sort === 'hot') {
      filtered = [...filtered].sort((a, b) => {
        const sa = (a.conviction_score || 0) * 10 + (1 / (Date.now() - new Date(a.created_at).getTime()));
        const sb = (b.conviction_score || 0) * 10 + (1 / (Date.now() - new Date(b.created_at).getTime()));
        return sb - sa;
      });
    }
    return filtered;
  }, [threads, category, sort, scope, address]);

  return (
    <KineticShell showSidebar>
      <Helmet><title>Debates | Bobby Agent Trader</title></Helmet>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 pb-20">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">AGENT DEBATES</h1>
          <p className="font-mono text-xs text-white/30 mt-1">
            Three agents debate every market move. Read the reasoning. Judge the logic. You decide.
          </p>
        </motion.div>

        {/* Scope tabs: PUBLIC vs MY ROOM */}
        <div className="flex gap-2 mb-5">
          <button onClick={() => setScope('public')}
            className={`px-4 py-2 text-[10px] font-mono font-bold tracking-wider rounded transition-all ${
              scope === 'public'
                ? 'bg-green-500/15 border border-green-500/30 text-green-400'
                : 'bg-white/[0.02] border border-white/[0.04] text-white/30 hover:text-white/50'
            }`}>
            BOBBY'S CHALLENGE
          </button>
          <button onClick={() => { if (hasAgent) setScope('my'); }}
            className={`px-4 py-2 text-[10px] font-mono font-bold tracking-wider rounded transition-all ${
              !hasAgent
                ? 'bg-white/[0.01] border border-white/[0.04] text-white/15 cursor-not-allowed'
                : scope === 'my'
                ? `${profile?.personality === 'direct' ? 'bg-orange-500/15 border-orange-500/30 text-orange-400' : profile?.personality === 'wise' ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400' : 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400'}`
                : 'bg-white/[0.02] border border-white/[0.04] text-white/30 hover:text-white/50'
            }`}>
            {hasAgent ? `${agentName}'S ROOM` : 'DEPLOY AGENT'}
          </button>

          {/* Language filter */}
          <div className="ml-auto flex gap-1">
            {(['all', 'en', 'es'] as const).map(l => (
              <button key={l} onClick={() => setLang(l)}
                className={`px-3 py-2 text-[10px] font-mono font-bold tracking-wider rounded transition-all ${
                  lang === l
                    ? 'bg-white/10 border border-white/20 text-white/80'
                    : 'bg-white/[0.02] border border-white/[0.04] text-white/30 hover:text-white/50'
                }`}>
                {l === 'all' ? 'ALL' : l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Telegram B2B CTA */}
        <Link to="/agentic-world/bobby/b2b"
          className="block mb-5 bg-gradient-to-r from-blue-500/10 via-green-500/5 to-blue-500/10 border border-blue-500/20 p-4 rounded hover:border-blue-500/40 transition-all group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-lg">⚡</span>
              <div>
                <span className="text-xs font-bold">Get these debates in your Telegram group</span>
                <p className="text-[9px] font-mono text-white/30">Voice notes · Real-time signals · 0.001 OKB on X Layer</p>
              </div>
            </div>
            <span className="text-[10px] font-mono text-blue-400 group-hover:translate-x-1 transition-transform">ADD TO TELEGRAM →</span>
          </div>
        </Link>

        {/* Stats strip — Stitch mobile style with colored left borders */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[
            { label: 'ACTIVE DEBATES', value: forumStats.total, color: 'text-green-400', border: 'border-l-2 border-green-500' },
            { label: 'AVG CONVICTION', value: `${forumStats.avgConviction}/10`, color: 'text-amber-400', border: 'border-l-2 border-amber-500' },
            { label: 'WIN RATE', value: `${forumStats.winRate}%`, color: 'text-green-400', border: 'border-l-2 border-green-500' },
          ].map(s => (
            <div key={s.label} className={`bg-[#0e0e0e] ${s.border} p-3`}>
              <span className="text-[8px] font-mono text-white/25 uppercase tracking-wider block">{s.label}</span>
              <span className={`text-lg font-mono font-bold ${s.color}`}>{s.value}</span>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <Filter className="w-3.5 h-3.5 text-white/20" />
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setCategory(f.id)}
              className={`px-3 py-1 text-[9px] font-mono tracking-wider rounded transition-all ${
                category === f.id
                  ? 'bg-green-500/15 border border-green-500/30 text-green-400'
                  : 'bg-white/[0.02] border border-white/[0.04] text-white/30 hover:text-white/50'
              }`}>{f.label}</button>
          ))}
          <div className="h-4 w-px bg-white/[0.06] mx-1" />
          {SORTS.map(s => (
            <button key={s.id} onClick={() => setSort(s.id)}
              className={`flex items-center gap-1 px-3 py-1 text-[9px] font-mono tracking-wider rounded transition-all ${
                sort === s.id
                  ? 'bg-white/[0.06] text-white/60'
                  : 'text-white/20 hover:text-white/40'
              }`}>
              <s.Icon className="w-3 h-3" /> {s.label}
            </button>
          ))}
          <button onClick={fetchThreads} disabled={loading}
            className="ml-auto flex items-center gap-1 px-3 py-1 text-[9px] font-mono text-white/20 hover:text-green-400 transition-colors">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> REFRESH
          </button>
        </div>

        {/* Thread list */}
        {loading ? (
          <div className="text-center py-20">
            <span className="text-[10px] font-mono text-white/20 animate-pulse">LOADING DEBATES...</span>
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="text-center py-20">
            <span className="text-[10px] font-mono text-white/20">NO DEBATES FOUND</span>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredThreads.map(thread => (
              <ThreadCard
                key={thread.id}
                thread={thread}
                expanded={expandedId === thread.id}
                onToggle={() => setExpandedId(expandedId === thread.id ? null : thread.id)}
              />
            ))}
          </div>
        )}
      </div>
    </KineticShell>
  );
}
