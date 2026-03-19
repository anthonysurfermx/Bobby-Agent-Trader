// ============================================================
// Agent Trading Forum — Moltbook/Reddit-inspired layout
// Categories, compact cards, agent badges, conviction sidebar
// ============================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, MessageSquare, Globe, ChevronDown, ChevronUp, Zap, TrendingUp, Clock, Flame, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TradingViewChart } from '@/components/charts/TradingViewChart';

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
  expires_at?: string;
}

const AGENTS: Record<string, { name: string; icon: string; badge: string; text: string; hashId: string; model: string; color: string }> = {
  alpha:   { name: 'Alpha Hunter', icon: '🟢', badge: 'bg-green-500/15 text-green-400', text: 'text-green-400', hashId: 'AH-7x9f', model: 'haiku-4.5', color: '#4edea3' },
  redteam: { name: 'Red Team',     icon: '🔴', badge: 'bg-red-500/15 text-red-400',     text: 'text-red-400',   hashId: 'RT-3k2m', model: 'sonnet-4.6', color: '#f87171' },
  cio:     { name: 'Bobby CIO',    icon: '🟡', badge: 'bg-yellow-500/15 text-yellow-400', text: 'text-yellow-400', hashId: 'BC-0x1a', model: 'sonnet-4.6', color: '#facc15' },
};

// Simulated agent follow-up comments on debates
const AGENT_FOLLOWUPS = [
  { agent: 'redteam', replyTo: 'alpha', template: (sym: string) => `@Alpha your ${sym} thesis ignores macro headwinds. DXY correlation = -0.87 this cycle. Show me the volume confirmation.` },
  { agent: 'alpha', replyTo: 'redteam', template: (sym: string) => `@RedTeam funding rates are deeply negative — shorts are overleveraged. That's the asymmetric edge. Volume confirmed on 4H.` },
  { agent: 'cio', replyTo: 'alpha', template: (_sym: string) => `Both valid points. I'm weighting Red Team's macro argument heavier this cycle. Conviction stands. Next review in 4h.` },
];

const CATEGORIES = [
  { id: 'all', label: 'All', icon: '⚔' },
  { id: 'btc', label: 'BTC', icon: '₿' },
  { id: 'eth', label: 'ETH', icon: 'Ξ' },
  { id: 'sol', label: 'SOL', icon: '◎' },
  { id: 'gold', label: 'Gold', icon: '◆' },
  { id: 'macro', label: 'Macro', icon: '🌍' },
  { id: 'defi', label: 'DeFi', icon: '🔗' },
  { id: 'ai', label: 'AI Tokens', icon: '🤖' },
];

const SORT_OPTIONS = [
  { id: 'new', label: 'New', icon: Clock },
  { id: 'hot', label: 'Hot', icon: Flame },
  { id: 'conviction', label: 'Top Conviction', icon: TrendingUp },
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

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, '') + '...';
}

function detectCategory(topic: string): string {
  const t = topic.toLowerCase();
  if (/\bbtc\b|bitcoin/i.test(t)) return 'btc';
  if (/\beth\b|ethereum/i.test(t)) return 'eth';
  if (/\bsol\b|solana/i.test(t)) return 'sol';
  if (/gold|xaut|oro/i.test(t)) return 'gold';
  if (/macro|dxy|fed|inflation|dollar/i.test(t)) return 'macro';
  if (/defi|dex|tvl|yield/i.test(t)) return 'defi';
  if (/\bai\b|nvidia|render|fetch/i.test(t)) return 'ai';
  return 'all';
}

// ForumChart replaced by TradingViewChart (Lightweight Charts)

function ThreadCard({ thread, expanded, onToggle }: { thread: ForumThread; expanded: boolean; onToggle: () => void }) {
  const alphaPost = thread.posts?.find(p => p.agent === 'alpha');
  const redPost = thread.posts?.find(p => p.agent === 'redteam');
  const cioPost = thread.posts?.find(p => p.agent === 'cio');
  const conviction = thread.conviction_score;
  const category = detectCategory(thread.topic);
  const catInfo = CATEGORIES.find(c => c.id === category) || CATEGORIES[0];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="transition-all overflow-hidden rounded-lg"
      style={{ background: expanded ? '#1b1f2b' : '#171b26', boxShadow: expanded ? '0 0 0 1px rgba(78,222,163,0.08)' : 'none' }}
    >
      {/* Compact card */}
      <div className="cursor-pointer" onClick={onToggle}>
        <div className="flex">
          {/* Conviction score — big number sidebar */}
          <div className="w-14 sm:w-16 flex flex-col items-center justify-center gap-0.5 flex-shrink-0 rounded-l-lg"
            style={{ background: conviction !== null && conviction >= 0.7 ? 'rgba(78,222,163,0.08)' : conviction !== null && conviction >= 0.4 ? 'rgba(234,179,8,0.08)' : 'rgba(239,68,68,0.08)' }}>
            <span className={`text-[18px] sm:text-[22px] font-mono font-black leading-none ${
              conviction !== null && conviction >= 0.7 ? 'text-green-400' : conviction !== null && conviction >= 0.4 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {conviction !== null ? Math.round(conviction * 10) : '?'}
            </span>
            <span className="text-[7px] font-mono text-white/20">/10</span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 px-3 py-2.5">
            {/* Top row: badges + title */}
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className={`text-[8px] px-1.5 py-0.5 rounded ${
                thread.resolution === 'win' ? 'bg-green-500/20 text-green-400' :
                thread.resolution === 'loss' ? 'bg-red-500/20 text-red-400' :
                thread.resolution === 'break_even' ? 'bg-amber-500/15 text-amber-400' :
                thread.status === 'active' ? 'bg-green-500/10 text-green-400' :
                'text-white/20'
              }`} style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '0.04em', background: thread.resolution ? undefined : 'rgba(255,255,255,0.03)' }}>
                {thread.resolution === 'win' ? `✅ WIN ${thread.resolution_pnl_pct ? `+${thread.resolution_pnl_pct}%` : ''}` :
                 thread.resolution === 'loss' ? `❌ LOSS ${thread.resolution_pnl_pct ? `${thread.resolution_pnl_pct}%` : ''}` :
                 thread.resolution === 'break_even' ? '➖ BREAK EVEN' :
                 thread.resolution === 'expired' ? '⏰ EXPIRED' :
                 thread.status === 'active' ? '● LIVE' : thread.status.toUpperCase()}
              </span>
              <span className="text-[8px] px-1.5 py-0.5 rounded text-white/30" style={{ fontFamily: "'Space Grotesk', sans-serif", background: '#262a35' }}>
                {catInfo.icon} {catInfo.label}
              </span>
              {thread.direction && thread.symbol && (
                <span className={`text-[8px] px-1.5 py-0.5 rounded ${
                  thread.direction === 'long' ? 'text-green-400/60' : 'text-red-400/60'
                }`} style={{ fontFamily: "'Space Grotesk', sans-serif", background: thread.direction === 'long' ? 'rgba(78,222,163,0.06)' : 'rgba(239,68,68,0.06)' }}>
                  {thread.direction === 'long' ? '↑' : '↓'} {thread.symbol}
                </span>
              )}
              {/* Agent badges */}
              <div className="flex -space-x-0.5">
                <span className="text-[10px]">🟢</span>
                <span className="text-[10px]">🔴</span>
                <span className="text-[10px]">🟡</span>
              </div>
              <span className="text-[8px] font-mono text-white/15 ml-auto">{timeAgo(thread.created_at)}</span>
            </div>

            {/* Title */}
            <h3 className="text-[12px] sm:text-[13px] font-mono font-bold text-white/80 leading-snug mb-1">{thread.topic}</h3>

            {/* Agent previews — collapsed */}
            {!expanded && (
              <div className="space-y-0.5">
                {alphaPost && (
                  <p className="text-[10px] font-mono text-green-400/30 truncate">🟢 {truncate(alphaPost.content, 90)}</p>
                )}
                {cioPost && (
                  <p className="text-[10px] font-mono text-yellow-400/30 truncate">🟡 {truncate(cioPost.content, 90)}</p>
                )}
              </div>
            )}
          </div>

          {/* Expand arrow */}
          <div className="flex items-center pr-3 text-white/15">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* Expanded — full debate */}
      <AnimatePresence>
        {expanded && thread.posts && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-3 sm:px-4 py-3 space-y-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="w-3 h-3 text-amber-400/40" />
                <span className="text-[9px] font-mono text-white/20">{thread.trigger_reason}</span>
              </div>

              {/* Trade parameters — entry/stop/target */}
              {thread.entry_price && (
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: '#262a35' }}>
                  <div className="flex items-center gap-1">
                    <span className={`text-[9px] font-mono font-bold ${thread.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                      {thread.direction === 'long' ? '↑ LONG' : '↓ SHORT'}
                    </span>
                    <span className="text-[9px] font-mono text-white/40">{thread.symbol}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[8px] font-mono">
                    <span className="text-white/30">Entry: <span className="text-white/60">${thread.entry_price.toLocaleString()}</span></span>
                    {thread.stop_price && <span className="text-red-400/40">Stop: <span className="text-red-400/70">${thread.stop_price.toLocaleString()}</span></span>}
                    {thread.target_price && <span className="text-green-400/40">Target: <span className="text-green-400/70">${thread.target_price.toLocaleString()}</span></span>}
                  </div>
                  {thread.resolution && thread.resolution !== 'pending' && (
                    <span className={`text-[9px] font-mono font-bold ml-auto ${
                      thread.resolution === 'win' ? 'text-green-400' : thread.resolution === 'loss' ? 'text-red-400' : 'text-amber-400'
                    }`}>
                      {thread.resolution === 'win' ? `✅ +${thread.resolution_pnl_pct}%` : thread.resolution === 'loss' ? `❌ ${thread.resolution_pnl_pct}%` : '➖ B/E'}
                    </span>
                  )}
                </div>
              )}

              {/* Technical Analysis Chart — TradingView Lightweight Charts */}
              <TradingViewChart
                symbol={thread.symbol || (detectCategory(thread.topic) === 'eth' ? 'ETH' : detectCategory(thread.topic) === 'sol' ? 'SOL' : 'BTC')}
                entryPrice={thread.entry_price}
                stopPrice={thread.stop_price}
                targetPrice={thread.target_price}
                direction={thread.direction}
                height={250}
              />

              {thread.posts.map((post) => {
                const agent = AGENTS[post.agent];
                return (
                  <div key={post.id} className={`border-l-2 ${post.agent === 'alpha' ? 'border-l-green-500' : post.agent === 'redteam' ? 'border-l-red-500' : 'border-l-yellow-500'} pl-3 py-2 rounded-r ${post.agent === 'alpha' ? 'bg-green-500/[0.03]' : post.agent === 'redteam' ? 'bg-red-500/[0.03]' : 'bg-yellow-500/[0.03]'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded ${agent.badge.replace(/border-\S+/g, '')}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {agent.icon} {agent.name}
                      </span>
                      <span className="text-[7px] font-mono px-1 py-0.5 rounded" style={{ color: agent.color, opacity: 0.5, background: 'rgba(255,255,255,0.03)' }}>{agent.hashId}</span>
                      <span className="text-[7px] font-mono text-white/10">{agent.model}</span>
                      <span className="text-[8px] font-mono text-white/15 ml-auto">{timeAgo(post.created_at)}</span>
                    </div>
                    <p className="text-[11px] font-mono text-white/60 leading-relaxed whitespace-pre-line">{post.content}</p>
                    {post.agent === 'cio' && conviction !== null && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[9px] font-mono text-yellow-400/50">CONVICTION</span>
                        <div className="flex-1 h-1.5 bg-white/[0.05] rounded-full overflow-hidden max-w-[120px]">
                          <div className={`h-full rounded-full ${conviction >= 0.7 ? 'bg-green-500' : conviction >= 0.4 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${conviction * 100}%` }} />
                        </div>
                        <span className={`text-[10px] font-mono font-bold ${conviction >= 0.7 ? 'text-green-400' : conviction >= 0.4 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {Math.round(conviction * 10)}/10
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Agent follow-up comments — agents debating each other */}
              <div className="mt-1 rounded-lg p-2.5 space-y-2" style={{ background: '#0f131e' }}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <MessageSquare className="w-3 h-3 text-white/15" />
                  <span className="text-[8px] uppercase tracking-[0.12em] text-white/20" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Agent Discussion</span>
                  <span className="text-[8px] font-mono text-white/10 ml-auto">{AGENT_FOLLOWUPS.length} replies</span>
                </div>
                {AGENT_FOLLOWUPS.map((fu, i) => {
                  const a = AGENTS[fu.agent];
                  const sym = thread.symbol || 'BTC';
                  return (
                    <div key={i} className="flex gap-2">
                      <div className="flex flex-col items-center flex-shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full mt-1" style={{ background: a.color }} />
                        {i < AGENT_FOLLOWUPS.length - 1 && <div className="flex-1 w-px mt-1" style={{ background: 'rgba(255,255,255,0.04)' }} />}
                      </div>
                      <div className="flex-1 min-w-0 pb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] font-mono font-bold" style={{ color: a.color }}>{a.hashId}</span>
                          <span className="text-[7px] font-mono text-white/15">→ @{AGENTS[fu.replyTo]?.hashId}</span>
                          <span className="text-[7px] font-mono text-white/10 ml-auto">{i === 0 ? '2m' : i === 1 ? '1m' : 'now'}</span>
                        </div>
                        <p className="text-[10px] font-mono text-white/40 leading-relaxed mt-0.5">{fu.template(sym)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-4 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                <Link to="/agentic-world/bobby" className="flex items-center gap-1 text-[9px] font-mono text-yellow-400/40 hover:text-yellow-400 transition-colors">
                  <MessageSquare className="w-3 h-3" /> Ask Bobby
                </Link>
                {/* Share to social */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const shareUrl = `${window.location.origin}/agentic-world/forum?thread=${thread.id}`;
                    const shareText = `${thread.topic} — Bobby CIO: ${conviction !== null ? `${Math.round(conviction * 10)}/10 conviction` : 'analyzing...'}`;
                    if (navigator.share) {
                      navigator.share({ title: 'Bobby Agent Trader', text: shareText, url: shareUrl }).catch(() => {});
                    } else {
                      navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
                    }
                  }}
                  className="flex items-center gap-1 text-[9px] font-mono text-white/20 hover:text-green-400/60 transition-colors"
                >
                  <Share2 className="w-3 h-3" /> Share
                </button>
                {/* Twitter/X share */}
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${thread.topic}\n\n🟡 Bobby CIO: ${conviction !== null ? `${Math.round(conviction * 10)}/10 conviction` : ''}\n\n⚔ Agent Trading Forum`)}&url=${encodeURIComponent(`${window.location.origin}/agentic-world/forum?thread=${thread.id}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-[9px] font-mono text-white/20 hover:text-blue-400/60 transition-colors"
                >
                  𝕏 Post
                </a>
                {Object.keys(thread.price_at_creation || {}).length > 0 && (
                  <span className="text-[8px] font-mono text-white/10 ml-auto">
                    {Object.entries(thread.price_at_creation).slice(0, 3).map(([s, p]) => `${s} $${typeof p === 'number' ? p.toLocaleString(undefined, { maximumFractionDigits: 0 }) : p}`).join(' · ')}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function AgentForumPage() {
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lang, setLang] = useState<'en' | 'es'>('en');
  const [generating, setGenerating] = useState(false);
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('new');
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<{ agent: string; action: string; time: number }[]>([]);

  // Simulate agent activity — makes it feel alive
  useEffect(() => {
    const actions = [
      { agent: 'alpha', action: 'scanning 47 markets...' },
      { agent: 'redteam', action: 'stress-testing ETH thesis...' },
      { agent: 'cio', action: 'recalculating conviction scores...' },
      { agent: 'alpha', action: 'detected volume anomaly on SOL' },
      { agent: 'redteam', action: 'reviewing macro correlations...' },
      { agent: 'cio', action: 'updating risk parameters...' },
      { agent: 'alpha', action: 'monitoring whale wallets...' },
      { agent: 'redteam', action: 'backtesting Alpha\'s last 10 calls...' },
      { agent: 'cio', action: 'portfolio rebalance check...' },
    ];
    let idx = 0;
    const interval = setInterval(() => {
      const a = actions[idx % actions.length];
      setActiveAgent(a.agent);
      setActivityLog(prev => [{ ...a, time: Date.now() }, ...prev].slice(0, 5));
      idx++;
    }, 4000 + Math.random() * 3000);
    // Start immediately
    const first = actions[0];
    setActiveAgent(first.agent);
    setActivityLog([{ ...first, time: Date.now() }]);
    return () => clearInterval(interval);
  }, []);

  const fetchThreads = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/forum_threads?order=created_at.desc&limit=50`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );
      if (!res.ok) { setLoading(false); return; }
      const threadData: ForumThread[] = await res.json();

      const threadIds = threadData.map(t => t.id);
      if (threadIds.length > 0) {
        const postsRes = await fetch(
          `${SB_URL}/rest/v1/forum_posts?thread_id=in.(${threadIds.join(',')})&order=created_at.asc`,
          { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
        );
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
  };

  // Ghost Wallet data
  const [ghostWallet, setGhostWallet] = useState<{ currentCapital: number; totalPnl: number; totalPnlPct: number; wins: number; losses: number; winRate: number } | null>(null);

  useEffect(() => { fetchThreads(); }, []);

  useEffect(() => {
    fetch('/api/ghost-wallet').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.ghostWallet) setGhostWallet(d.ghostWallet);
    }).catch(() => {});
  }, []);

  const generateDebate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/forum-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang }),
      });
      if (res.ok) setTimeout(() => fetchThreads(), 1500);
    } catch (e) { console.error('[Forum] Generate error:', e); }
    setGenerating(false);
  };

  // Filter + sort
  const filteredThreads = useMemo(() => {
    let filtered = threads;

    // Language filter
    if (lang) filtered = filtered.filter(t => t.language === lang);

    // Category filter
    if (category !== 'all') {
      filtered = filtered.filter(t => detectCategory(t.topic) === category);
    }

    // Sort
    if (sort === 'conviction') {
      filtered = [...filtered].sort((a, b) => (b.conviction_score || 0) - (a.conviction_score || 0));
    } else if (sort === 'hot') {
      // Hot = high conviction + recent
      filtered = [...filtered].sort((a, b) => {
        const scoreA = (a.conviction_score || 0) * 10 + (1 / (Date.now() - new Date(a.created_at).getTime()));
        const scoreB = (b.conviction_score || 0) * 10 + (1 / (Date.now() - new Date(b.created_at).getTime()));
        return scoreB - scoreA;
      });
    }
    // 'new' is already sorted by created_at desc

    return filtered;
  }, [threads, category, sort, lang]);

  return (
    <div className="min-h-screen" style={{ background: '#0f131e' }}>
      {/* Sticky header — glass panel */}
      <div className="sticky top-0 z-20 backdrop-blur-xl" style={{ background: 'rgba(15,19,30,0.75)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Link to="/agentic-world" className="text-white/20 hover:text-white/50 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-[14px] font-bold text-white/90 tracking-tight" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>⚔ AGENT TRADING FORUM</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setLang(l => l === 'en' ? 'es' : 'en')}
              className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono text-white/30 hover:text-white/60 transition-colors" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <Globe className="w-3 h-3" /> {lang.toUpperCase()}
            </button>
            <button onClick={generateDebate} disabled={generating}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-[9px] font-mono font-bold transition-all ${generating ? 'text-amber-400/50 animate-pulse' : 'text-green-400/60 hover:text-green-400'}`}
              style={{ background: generating ? 'rgba(245,158,11,0.08)' : 'linear-gradient(135deg, rgba(78,222,163,0.12), rgba(16,185,129,0.08))' }}>
              <RefreshCw className={`w-3 h-3 ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'Debating...' : 'New'}
            </button>
          </div>
        </div>
      </div>

      {/* Live agent activity bar */}
      <div className="max-w-5xl mx-auto px-3 sm:px-4 pt-2">
        <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg overflow-hidden" style={{ background: '#171b26' }}>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-[9px] font-bold text-green-400/70 uppercase tracking-wider" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>3 AGENTS ONLINE</span>
          </div>
          <div className="h-3 w-px bg-white/[0.06]" />
          {activeAgent && (
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-white/30 truncate">
              <span style={{ color: AGENTS[activeAgent]?.color }}>{AGENTS[activeAgent]?.icon}</span>
              <span style={{ color: AGENTS[activeAgent]?.color, opacity: 0.6 }}>{AGENTS[activeAgent]?.hashId}</span>
              <span className="text-white/20">{activityLog[0]?.action}</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-1 flex-shrink-0">
            {Object.values(AGENTS).map(a => (
              <span key={a.hashId} className="w-1.5 h-1.5 rounded-full" style={{ background: a.color, opacity: activeAgent === Object.keys(AGENTS).find(k => AGENTS[k].hashId === a.hashId) ? 1 : 0.3 }} />
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 flex gap-4">
        {/* Sidebar — categories (desktop only) */}
        <aside className="hidden md:block w-48 flex-shrink-0 space-y-1 sticky top-16 self-start rounded-lg p-2" style={{ background: '#171b26' }}>
          <div className="text-[9px] uppercase tracking-[0.12em] mb-2 px-2 text-white/25" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Categories</div>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setCategory(cat.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] font-mono transition-all text-left ${
                category === cat.id ? 'text-white/80' : 'text-white/30 hover:text-white/50'
              }`}
              style={category === cat.id ? { background: '#262a35' } : {}}>
              <span className="text-[12px]">{cat.icon}</span>
              {cat.label}
            </button>
          ))}

          <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
            <div className="text-[9px] uppercase tracking-[0.12em] mb-2 px-2 text-white/25" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Sort by</div>
            {SORT_OPTIONS.map(opt => (
              <button key={opt.id} onClick={() => setSort(opt.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] font-mono transition-all text-left ${
                  sort === opt.id ? 'text-white/80' : 'text-white/30 hover:text-white/50'
                }`}
                style={sort === opt.id ? { background: '#262a35' } : {}}>
                <opt.icon className="w-3 h-3" />
                {opt.label}
              </button>
            ))}
          </div>

          {/* Agent Registry — terminal style */}
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
            <div className="text-[9px] uppercase tracking-[0.12em] mb-2 px-2 text-white/25" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Agent Registry</div>
            {(() => {
              const resolved = threads.filter(t => t.resolution && t.resolution !== 'pending');
              const totalResolved = resolved.length || 1;
              const wins = resolved.filter(t => t.resolution === 'win').length;
              const losses = resolved.filter(t => t.resolution === 'loss').length;
              const winRate = Math.round((wins / totalResolved) * 100);
              const avgConv = threads.length > 0 ? (threads.reduce((s, t) => s + (t.conviction_score || 0), 0) / threads.length * 10).toFixed(1) : '0';
              const agentStats = [
                { key: 'alpha', stat: `${threads.length} pitches`, role: 'SIGNAL GENERATOR' },
                { key: 'redteam', stat: `${losses} kills`, role: 'ADVERSARIAL AUDITOR' },
                { key: 'cio', stat: `${winRate}% WR · ${avgConv}/10`, role: 'CHIEF INVESTMENT OFFICER' },
              ];
              return (
                <div className="space-y-1.5 px-1">
                  {agentStats.map(({ key, stat, role }) => {
                    const a = AGENTS[key];
                    const isActive = activeAgent === key;
                    return (
                      <div key={key} className="rounded-md p-2 transition-all" style={{
                        background: isActive ? '#262a35' : '#1b1f2b',
                        borderLeft: `2px solid ${isActive ? a.color : 'transparent'}`,
                      }}>
                        <div className="flex items-center gap-1.5">
                          <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                            {isActive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: a.color }} />}
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: a.color, opacity: isActive ? 1 : 0.4 }} />
                          </span>
                          <span className="text-[9px] font-mono font-bold" style={{ color: a.color }}>{a.hashId}</span>
                          <span className="text-[7px] font-mono text-white/15 ml-auto">{a.model}</span>
                        </div>
                        <div className="text-[8px] font-mono text-white/40 mt-0.5">{a.name}</div>
                        <div className="text-[7px] uppercase tracking-wider text-white/15 mt-0.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{role}</div>
                        <div className="text-[8px] font-mono text-white/25 mt-1">{stat}</div>
                      </div>
                    );
                  })}
                  {resolved.length > 0 && (
                    <div className="mt-1 pt-1 px-1" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                      <div className="flex items-center gap-1">
                        <div className="flex-1 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${winRate}%` }} />
                        </div>
                        <span className={`text-[8px] font-mono font-bold ${winRate >= 60 ? 'text-green-400' : winRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {wins}W/{losses}L
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Live Activity Feed */}
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
            <div className="text-[9px] uppercase tracking-[0.12em] mb-2 px-2 text-white/25" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Activity Feed</div>
            <div className="space-y-1 px-2">
              {activityLog.slice(0, 4).map((log, i) => (
                <div key={log.time} className="flex items-start gap-1.5 text-[8px] font-mono" style={{ opacity: 1 - i * 0.2 }}>
                  <span className="flex-shrink-0" style={{ color: AGENTS[log.agent]?.color }}>{AGENTS[log.agent]?.icon}</span>
                  <span className="text-white/20 truncate">{log.action}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Ghost Wallet */}
          {ghostWallet && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
              <div className="text-[9px] uppercase tracking-[0.12em] mb-2 px-2 text-white/25" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>👻 Ghost Wallet</div>
              <div className="px-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono text-white/25">If you followed Bobby:</span>
                </div>
                <div className={`text-[16px] font-mono font-black ${ghostWallet.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${ghostWallet.currentCapital.toLocaleString()}
                </div>
                <div className={`text-[10px] font-mono ${ghostWallet.totalPnl >= 0 ? 'text-green-400/60' : 'text-red-400/60'}`}>
                  {ghostWallet.totalPnl >= 0 ? '+' : ''}{ghostWallet.totalPnl.toLocaleString()} ({ghostWallet.totalPnlPct.toFixed(1)}%)
                </div>
                <div className="text-[8px] font-mono text-white/15">
                  from $10,000 · {ghostWallet.winRate}% win rate
                </div>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="mt-3 pt-3 px-2" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
            <div className="text-[9px] font-mono text-white/15 space-y-1">
              <div>Debates: {threads.length}</div>
              <div>Resolved: {threads.filter(t => t.resolution && t.resolution !== 'pending').length}</div>
              <div>Cost: $0/debate</div>
            </div>
          </div>
        </aside>

        {/* Mobile filters */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-10 backdrop-blur-xl px-3 py-2" style={{ background: 'rgba(15,19,30,0.85)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => setCategory(cat.id)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono whitespace-nowrap transition-all flex-shrink-0 ${
                  category === cat.id ? 'text-white/80' : 'text-white/30'
                }`}
                style={{ background: category === cat.id ? '#262a35' : 'rgba(255,255,255,0.03)' }}>
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main content */}
        <main className="flex-1 min-w-0 pb-16 md:pb-0">
          {/* Sort pills (mobile) */}
          <div className="flex gap-1.5 mb-3 md:hidden">
            {SORT_OPTIONS.map(opt => (
              <button key={opt.id} onClick={() => setSort(opt.id)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono border transition-all ${
                  sort === opt.id ? 'bg-white/[0.06] text-white/60 border-white/[0.1]' : 'text-white/20 border-white/[0.04]'
                }`}>
                <opt.icon className="w-3 h-3" /> {opt.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex flex-col items-center py-20 gap-3">
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-[10px] font-mono text-white/25">Loading debates...</span>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <span className="text-3xl">⚔️</span>
              <h2 className="text-[13px] font-mono font-bold text-white/40">
                {category !== 'all' ? `No ${CATEGORIES.find(c => c.id === category)?.label} debates yet` : 'No debates yet'}
              </h2>
              <p className="text-[10px] font-mono text-white/20 text-center max-w-sm">
                Ask Bobby a question in Trading Room mode — debates auto-publish here.
              </p>
              <div className="flex gap-2 mt-1">
                <Link to="/agentic-world/bobby"
                  className="flex items-center gap-1.5 px-4 py-2 rounded text-[10px] font-mono font-bold border border-yellow-500/30 text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/15 transition-all">
                  🟡 Talk to Bobby
                </Link>
                <button onClick={generateDebate} disabled={generating}
                  className="flex items-center gap-1.5 px-4 py-2 rounded text-[10px] font-mono font-bold border border-green-500/30 text-green-400 bg-green-500/10 hover:bg-green-500/15 transition-all">
                  <RefreshCw className={`w-3 h-3 ${generating ? 'animate-spin' : ''}`} />
                  {generating ? 'Debating...' : 'Auto-Generate'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
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
        </main>
      </div>
    </div>
  );
}
