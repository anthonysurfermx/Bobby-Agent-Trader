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

const AGENTS: Record<string, { name: string; icon: string; badge: string; text: string }> = {
  alpha:   { name: 'Alpha Hunter', icon: '🟢', badge: 'bg-green-500/15 text-green-400 border-green-500/30', text: 'text-green-400' },
  redteam: { name: 'Red Team',     icon: '🔴', badge: 'bg-red-500/15 text-red-400 border-red-500/30',       text: 'text-red-400' },
  cio:     { name: 'Bobby CIO',    icon: '🟡', badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', text: 'text-yellow-400' },
};

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
      className={`border border-white/[0.06] bg-white/[0.015] hover:bg-white/[0.03] transition-all overflow-hidden ${expanded ? 'ring-1 ring-white/[0.08]' : ''}`}
    >
      {/* Compact card */}
      <div className="cursor-pointer" onClick={onToggle}>
        <div className="flex">
          {/* Conviction score — big number sidebar */}
          <div className={`w-14 sm:w-16 flex flex-col items-center justify-center gap-0.5 border-r border-white/[0.04] flex-shrink-0 ${
            conviction !== null && conviction >= 0.7 ? 'bg-green-500/[0.06]' : conviction !== null && conviction >= 0.4 ? 'bg-yellow-500/[0.06]' : 'bg-red-500/[0.06]'
          }`}>
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
              <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded border ${
                thread.resolution === 'win' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                thread.resolution === 'loss' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                thread.resolution === 'break_even' ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
                thread.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                'bg-white/5 text-white/20 border-white/10'
              }`}>
                {thread.resolution === 'win' ? `✅ WIN ${thread.resolution_pnl_pct ? `+${thread.resolution_pnl_pct}%` : ''}` :
                 thread.resolution === 'loss' ? `❌ LOSS ${thread.resolution_pnl_pct ? `${thread.resolution_pnl_pct}%` : ''}` :
                 thread.resolution === 'break_even' ? '➖ BREAK EVEN' :
                 thread.resolution === 'expired' ? '⏰ EXPIRED' :
                 thread.status === 'active' ? '● LIVE' : thread.status.toUpperCase()}
              </span>
              <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-white/25 border border-white/[0.06]">
                {catInfo.icon} {catInfo.label}
              </span>
              {thread.direction && thread.symbol && (
                <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded border ${
                  thread.direction === 'long' ? 'bg-green-500/5 text-green-400/50 border-green-500/10' : 'bg-red-500/5 text-red-400/50 border-red-500/10'
                }`}>
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
            <div className="border-t border-white/[0.04] px-3 sm:px-4 py-3 space-y-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="w-3 h-3 text-amber-400/40" />
                <span className="text-[9px] font-mono text-white/20">{thread.trigger_reason}</span>
              </div>

              {/* Trade parameters — entry/stop/target */}
              {thread.entry_price && (
                <div className="flex items-center gap-3 px-3 py-2 rounded bg-white/[0.02] border border-white/[0.04]">
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
                      <span className={`text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded border ${agent.badge}`}>
                        {agent.icon} {agent.name}
                      </span>
                      <span className="text-[8px] font-mono text-white/15">{timeAgo(post.created_at)}</span>
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

              {/* Actions */}
              <div className="flex items-center gap-4 pt-2 border-t border-white/[0.04]">
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
    <div className="min-h-screen" style={{ background: '#050505' }}>
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b border-white/[0.06] backdrop-blur-md" style={{ background: 'rgba(5,5,5,0.92)' }}>
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Link to="/agentic-world" className="text-white/20 hover:text-white/50 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-[13px] font-mono font-bold text-white/80">⚔ AGENT TRADING FORUM</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setLang(l => l === 'en' ? 'es' : 'en')}
              className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono border border-white/[0.08] text-white/30 hover:text-white/60 transition-colors">
              <Globe className="w-3 h-3" /> {lang.toUpperCase()}
            </button>
            <button onClick={generateDebate} disabled={generating}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-[9px] font-mono font-bold border transition-all ${generating ? 'border-amber-500/30 text-amber-400/50 animate-pulse' : 'border-green-500/20 text-green-400/50 hover:text-green-400'}`}>
              <RefreshCw className={`w-3 h-3 ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'Debating...' : 'New'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 flex gap-4">
        {/* Sidebar — categories (desktop only) */}
        <aside className="hidden md:block w-48 flex-shrink-0 space-y-1 sticky top-16 self-start">
          <div className="text-[9px] font-mono text-white/20 uppercase tracking-wider mb-2 px-2">Categories</div>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setCategory(cat.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] font-mono transition-all text-left ${
                category === cat.id ? 'bg-white/[0.06] text-white/70 border border-white/[0.08]' : 'text-white/25 hover:text-white/50 hover:bg-white/[0.02]'
              }`}>
              <span className="text-[12px]">{cat.icon}</span>
              {cat.label}
            </button>
          ))}

          <div className="border-t border-white/[0.04] mt-3 pt-3">
            <div className="text-[9px] font-mono text-white/20 uppercase tracking-wider mb-2 px-2">Sort by</div>
            {SORT_OPTIONS.map(opt => (
              <button key={opt.id} onClick={() => setSort(opt.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] font-mono transition-all text-left ${
                  sort === opt.id ? 'bg-white/[0.06] text-white/70 border border-white/[0.08]' : 'text-white/25 hover:text-white/50 hover:bg-white/[0.02]'
                }`}>
                <opt.icon className="w-3 h-3" />
                {opt.label}
              </button>
            ))}
          </div>

          {/* Agent Profiles */}
          <div className="border-t border-white/[0.04] mt-3 pt-3">
            <div className="text-[9px] font-mono text-white/20 uppercase tracking-wider mb-2 px-2">Agent Profiles</div>
            {(() => {
              const resolved = threads.filter(t => t.resolution && t.resolution !== 'pending');
              const totalResolved = resolved.length || 1;
              const wins = resolved.filter(t => t.resolution === 'win').length;
              const losses = resolved.filter(t => t.resolution === 'loss').length;
              const winRate = Math.round((wins / totalResolved) * 100);
              const avgConv = threads.length > 0 ? (threads.reduce((s, t) => s + (t.conviction_score || 0), 0) / threads.length * 10).toFixed(1) : '0';
              return (
                <div className="space-y-2 px-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px]">🟢</span>
                    <div className="flex-1">
                      <div className="text-[9px] font-mono text-green-400/70 font-bold">Alpha Hunter</div>
                      <div className="text-[8px] font-mono text-white/20">{threads.length} pitches</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px]">🔴</span>
                    <div className="flex-1">
                      <div className="text-[9px] font-mono text-red-400/70 font-bold">Red Team</div>
                      <div className="text-[8px] font-mono text-white/20">{losses} saves</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px]">🟡</span>
                    <div className="flex-1">
                      <div className="text-[9px] font-mono text-yellow-400/70 font-bold">Bobby CIO</div>
                      <div className="text-[8px] font-mono text-white/20">
                        {winRate}% WR · avg {avgConv}/10
                      </div>
                    </div>
                  </div>
                  {resolved.length > 0 && (
                    <div className="mt-1 pt-1 border-t border-white/[0.04]">
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

          {/* Ghost Wallet */}
          {ghostWallet && (
            <div className="border-t border-white/[0.04] mt-3 pt-3">
              <div className="text-[9px] font-mono text-white/20 uppercase tracking-wider mb-2 px-2">👻 Ghost Wallet</div>
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
          <div className="border-t border-white/[0.04] mt-3 pt-3 px-2">
            <div className="text-[9px] font-mono text-white/15 space-y-1">
              <div>Debates: {threads.length}</div>
              <div>Resolved: {threads.filter(t => t.resolution && t.resolution !== 'pending').length}</div>
              <div>Cost: $0/debate</div>
            </div>
          </div>
        </aside>

        {/* Mobile filters */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-10 border-t border-white/[0.06] backdrop-blur-md px-3 py-2" style={{ background: 'rgba(5,5,5,0.95)' }}>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => setCategory(cat.id)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono whitespace-nowrap border transition-all flex-shrink-0 ${
                  category === cat.id ? 'bg-white/[0.08] text-white/70 border-white/[0.12]' : 'text-white/25 border-white/[0.04]'
                }`}>
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
