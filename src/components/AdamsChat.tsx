// ============================================================
// AdamsChat — Trading advisor chat with real market data
// Price queries, inline charts, smart NLP, on-chain execution
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowUp, ArrowLeft, Activity, Settings, Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { AdvisorSetup, useAdvisorProfile } from './AdvisorSetup';
import type { AdvisorProfile } from './AdvisorSetup';
import { fetchTickers, fetchMarketDetail, formatVolume, type OKXTicker } from '../services/okx-market.service';
import { SwapConfirm, type TradeExecution } from './SwapConfirm';

// ---- Supabase ----

const SB_URL = import.meta.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';

interface DBMessage {
  id: string;
  wallet_address: string;
  advisor_name: string;
  message: string;
  created_at: string;
  read: boolean;
}

async function fetchDBMessages(wallet: string): Promise<DBMessage[]> {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/agent_messages?wallet_address=eq.${wallet}&order=created_at.asc&limit=50`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

// ---- Token symbol detection ----

const TOKEN_MAP: Record<string, string> = {
  btc: 'BTC-USDT', bitcoin: 'BTC-USDT',
  eth: 'ETH-USDT', ethereum: 'ETH-USDT', ether: 'ETH-USDT',
  sol: 'SOL-USDT', solana: 'SOL-USDT',
  okb: 'OKB-USDT',
  matic: 'MATIC-USDT', polygon: 'MATIC-USDT',
};

function detectTokens(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const [key, instId] of Object.entries(TOKEN_MAP)) {
    // Word boundary match
    if (new RegExp(`\\b${key}\\b`).test(lower) && !found.includes(instId)) {
      found.push(instId);
    }
  }
  return found;
}

function detectIntent(text: string): 'price' | 'analyze' | 'portfolio' | 'trending' | 'prices_all' | 'help' | 'chat' {
  const l = text.toLowerCase();
  if (/\b(pric|precio|coti|cuanto|how much|what.?s .* at|dame .* precio|give me|show me)\b/i.test(l)) return 'price';
  if (/\b(analyz|analiz|scan|escan|run|ejecut)\b/i.test(l)) return 'analyze';
  if (/\b(portfolio|position|posicion|balance|cartera|wallet)\b/i.test(l)) return 'portfolio';
  if (/\b(trend|trending|hot|popular|whats up|que hay|mercado)\b/i.test(l)) return 'trending';
  if (/\b(prices|precios|all|todos|market|overview|resumen)\b/i.test(l)) return 'prices_all';
  if (/\b(help|ayuda|command|como|how)\b/i.test(l)) return 'help';
  // If tokens detected, default to price
  if (detectTokens(text).length > 0) return 'price';
  return 'chat';
}

// ---- Chat message types ----

interface PriceCard {
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  vol24h: number;
  funding?: { rate: number; annualized: number } | null;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'advisor';
  text: string;
  timestamp: number;
  isLive?: boolean;
  trades?: TradeExecution[];
  prices?: PriceCard[];
}

// ---- Typewriter ----

function Typewriter({ text, speed = 8, onDone }: { text: string; speed?: number; onDone?: () => void }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const idxRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastRef = useRef(0);

  const skip = useCallback(() => {
    if (!done) { setDisplayed(text); setDone(true); onDone?.(); }
  }, [done, text, onDone]);

  useEffect(() => {
    idxRef.current = 0;
    lastRef.current = 0;
    setDisplayed('');
    setDone(false);
    const step = (ts: number) => {
      if (!lastRef.current) lastRef.current = ts;
      const elapsed = ts - lastRef.current;
      if (elapsed >= speed) {
        const next = Math.min(idxRef.current + Math.min(Math.floor(elapsed / speed), 4), text.length);
        idxRef.current = next;
        lastRef.current = ts;
        setDisplayed(text.slice(0, next));
        if (next >= text.length) { setDone(true); onDone?.(); return; }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [text, speed, onDone]);

  return (
    <span onClick={skip} className="cursor-pointer">
      {displayed}
      {!done && <span className="inline-block w-[5px] h-[13px] bg-green-400 ml-[1px] align-middle animate-pulse" />}
    </span>
  );
}

// ---- Helpers ----

function timeStr(ts: number | string): string {
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function fmtPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

// ---- Inline Price Card ----

function InlinePriceCard({ price }: { price: PriceCard }) {
  const isUp = price.change24h >= 0;
  return (
    <div className="border border-neutral-700/50 bg-neutral-900/50 rounded-lg p-3 font-mono text-[11px]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-white">{price.symbol}</span>
          <span className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${
            isUp ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
          }`}>
            {isUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
            {isUp ? '+' : ''}{price.change24h.toFixed(2)}%
          </span>
        </div>
        <span className="text-[15px] font-bold text-white">${fmtPrice(price.price)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-neutral-500">
        <div>
          <div className="text-[9px] text-neutral-600 uppercase">24h High</div>
          <div className="text-neutral-400">${fmtPrice(price.high24h)}</div>
        </div>
        <div>
          <div className="text-[9px] text-neutral-600 uppercase">24h Low</div>
          <div className="text-neutral-400">${fmtPrice(price.low24h)}</div>
        </div>
        <div>
          <div className="text-[9px] text-neutral-600 uppercase">Volume</div>
          <div className="text-neutral-400">{formatVolume(price.vol24h)}</div>
        </div>
      </div>
      {price.funding && (
        <div className="mt-2 pt-2 border-t border-neutral-800 flex items-center gap-3">
          <span className="text-neutral-600">Funding:</span>
          <span className={price.funding.rate > 0 ? 'text-green-400' : 'text-red-400'}>
            {(price.funding.rate * 100).toFixed(4)}%
          </span>
          <span className="text-neutral-600">({price.funding.annualized.toFixed(1)}% APR)</span>
        </div>
      )}
    </div>
  );
}

// ---- Chat Bubble ----

function ChatBubble({ msg, advisorName, isLatest, walletAddress }: { msg: ChatMsg; advisorName: string; isLatest: boolean; walletAddress?: string }) {
  const isUser = msg.role === 'user';
  const initial = advisorName.charAt(0).toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-2.5 ${isUser ? 'justify-end' : 'items-start'}`}
    >
      {!isUser && (
        <div className="w-7 h-7 border border-green-500/20 bg-green-500/5 flex items-center justify-center flex-shrink-0 mt-5">
          <span className="text-[10px] font-bold text-green-400">{initial}</span>
        </div>
      )}

      <div className={`max-w-[85%] sm:max-w-[75%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <span className="text-[9px] font-bold font-mono tracking-[1.5px] mb-1 px-0.5 text-white/30">
          {isUser ? 'YOU' : advisorName.toUpperCase()}
        </span>

        <div className={`px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-line ${
          isUser
            ? 'bg-white text-black'
            : 'border border-green-500/15 bg-green-500/[0.04] text-green-200/90 font-mono text-[12px]'
        }`}>
          {!isUser && isLatest && msg.isLive !== false ? (
            <Typewriter text={msg.text} speed={6} />
          ) : (
            msg.text
          )}
        </div>

        {/* Inline price cards */}
        {msg.prices && msg.prices.length > 0 && (
          <div className="mt-2 space-y-2 w-full">
            {msg.prices.map((p, i) => (
              <InlinePriceCard key={i} price={p} />
            ))}
          </div>
        )}

        {/* Trade execution cards */}
        {msg.trades && msg.trades.length > 0 && (
          <div className="mt-2 space-y-2 w-full">
            {msg.trades.map((trade, i) => (
              <SwapConfirm key={i} trade={trade} walletAddress={walletAddress} />
            ))}
          </div>
        )}

        <span className="text-[9px] text-white/15 mt-0.5 px-0.5 font-mono">
          {timeStr(msg.timestamp)}
        </span>
      </div>
    </motion.div>
  );
}

// ---- Live Analysis Phase Bubble ----

function LiveAnalysisBubble({ phases, advisorName }: { phases: string[]; advisorName: string }) {
  const initial = advisorName.charAt(0).toUpperCase();
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2.5 items-start">
      <div className="w-7 h-7 border border-green-500/20 bg-green-500/5 flex items-center justify-center flex-shrink-0 mt-5">
        <span className="text-[10px] font-bold text-green-400">{initial}</span>
      </div>
      <div className="max-w-[85%] flex flex-col items-start">
        <span className="text-[9px] font-bold font-mono tracking-[1.5px] mb-1 px-0.5 text-white/30">{advisorName.toUpperCase()}</span>
        <div className="border border-green-500/15 bg-green-500/[0.04] px-3.5 py-2.5 font-mono text-[11px] space-y-1">
          {phases.map((phase, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.15 }} className="flex items-start gap-1.5">
              <span className={i === phases.length - 1 ? 'text-green-400' : 'text-green-500/50'}>{i === phases.length - 1 ? '>' : '+'}</span>
              <span className={i === phases.length - 1 ? 'text-green-300' : 'text-green-400/60'}>{phase}</span>
            </motion.div>
          ))}
          <div className="flex items-center gap-1 text-green-500/30 pt-0.5">
            <span className="inline-block w-1 h-1 bg-green-400 rounded-full animate-pulse" />
            <span className="inline-block w-1 h-1 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
            <span className="inline-block w-1 h-1 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---- Quick Actions ----

function QuickActions({ onAction, disabled }: { onAction: (text: string) => void; disabled: boolean }) {
  const actions = [
    { label: 'BTC', icon: '₿' },
    { label: 'ETH', icon: 'Ξ' },
    { label: 'All Prices', icon: '$' },
    { label: 'Analyze Market', icon: '>' },
  ];
  return (
    <div className="flex gap-2 flex-wrap">
      {actions.map(a => (
        <button key={a.label} onClick={() => onAction(a.label)} disabled={disabled}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] border border-white/[0.08] bg-white/[0.02] text-white/50 hover:bg-white/[0.06] hover:text-white/80 hover:border-white/20 transition-all disabled:opacity-30">
          <span className="font-mono text-green-400">{a.icon}</span>
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ---- Main Component ----

export function AdamsChat() {
  const { profile, needsSetup, saveNewProfile, isConnected } = useAdvisorProfile();
  const { address } = useAccount();
  const { open: openWallet } = useAppKit();
  const [showSetup, setShowSetup] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisPhases, setAnalysisPhases] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Cache tickers locally for quick re-use
  const tickerCacheRef = useRef<OKXTicker[]>([]);

  const advisorName = profile?.advisorName || 'Adams';

  useEffect(() => {
    if (needsSetup) setShowSetup(true);
  }, [needsSetup]);

  // Load conversation history
  useEffect(() => {
    if (!profile?.walletAddress) return;
    fetchDBMessages(profile.walletAddress).then(dbMsgs => {
      if (dbMsgs.length === 0) {
        // Proactive: show prices in welcome message
        fetchTickers().then(tickers => {
          tickerCacheRef.current = tickers;
          const btc = tickers.find(t => t.symbol === 'BTC');
          const eth = tickers.find(t => t.symbol === 'ETH');
          const priceCards: PriceCard[] = [btc, eth].filter(Boolean).map(t => ({
            symbol: t!.symbol,
            price: t!.last,
            change24h: t!.change24h,
            high24h: t!.high24h,
            low24h: t!.low24h,
            vol24h: t!.vol24h,
            funding: t!.funding,
          }));

          setMessages([{
            id: 'welcome',
            role: 'advisor',
            text: `Hey! I'm ${advisorName}, your AI trading advisor.\n\nI scan OKX + Polymarket every ${profile.scanIntervalHours || 8}h looking for opportunities. Here's the market right now:`,
            timestamp: Date.now(),
            prices: priceCards,
          }]);
        }).catch(() => {
          setMessages([{
            id: 'welcome',
            role: 'advisor',
            text: `Hey! I'm ${advisorName}, your AI trading advisor.\n\nAsk me anything — try "BTC", "ETH", "All Prices", or hit "Analyze Market" for a full scan.`,
            timestamp: Date.now(),
          }]);
        });
        return;
      }

      const chatMsgs: ChatMsg[] = [];
      for (const m of dbMsgs) {
        chatMsgs.push({
          id: m.id + '-trigger',
          role: 'user',
          text: 'Analyze Market',
          timestamp: new Date(m.created_at).getTime() - 1000,
          isLive: false,
        });
        chatMsgs.push({
          id: m.id,
          role: 'advisor',
          text: m.message.replace(/\*/g, '').replace(/_/g, ''),
          timestamp: new Date(m.created_at).getTime(),
          isLive: false,
        });
      }
      setMessages(chatMsgs);
    });
  }, [profile?.walletAddress, advisorName]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, analysisPhases]);

  const handleSetupComplete = (p: AdvisorProfile) => {
    saveNewProfile(p);
    setShowSetup(false);
  };

  // ---- Fetch prices helper ----
  const getPriceCards = async (instIds: string[]): Promise<PriceCard[]> => {
    let tickers = tickerCacheRef.current;
    if (tickers.length === 0) {
      tickers = await fetchTickers();
      tickerCacheRef.current = tickers;
    }
    const cards: PriceCard[] = [];
    for (const instId of instIds) {
      const sym = instId.split('-')[0];
      const t = tickers.find(tk => tk.symbol === sym);
      if (t) {
        // For individual tokens, fetch detailed data with funding
        try {
          const detail = await fetchMarketDetail(instId);
          cards.push({
            symbol: t.symbol,
            price: detail.ticker?.last ?? t.last,
            change24h: detail.ticker?.change24h ?? t.change24h,
            high24h: detail.ticker?.high24h ?? t.high24h,
            low24h: detail.ticker?.low24h ?? t.low24h,
            vol24h: detail.ticker?.vol24h ?? t.vol24h,
            funding: detail.funding ? { rate: detail.funding.rate, annualized: detail.funding.annualized } : t.funding,
          });
        } catch {
          cards.push({
            symbol: t.symbol, price: t.last, change24h: t.change24h,
            high24h: t.high24h, low24h: t.low24h, vol24h: t.vol24h, funding: t.funding,
          });
        }
      }
    }
    return cards;
  };

  // ---- Send message / trigger action ----
  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text || inputText).trim();
    if (!msg || isProcessing) return;
    setInputText('');

    const userMsg: ChatMsg = { id: uid(), role: 'user', text: msg, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    const intent = detectIntent(msg);
    const tokens = detectTokens(msg);

    // ========================
    // PRICE QUERY — specific token(s)
    // ========================
    if (intent === 'price' || (intent === 'chat' && tokens.length > 0)) {
      const targetTokens = tokens.length > 0 ? tokens : ['BTC-USDT'];
      setIsProcessing(true);
      try {
        const cards = await getPriceCards(targetTokens);
        const names = cards.map(c => c.symbol).join(', ');
        const isUp = cards.length > 0 && cards[0].change24h >= 0;
        setMessages(prev => [...prev, {
          id: uid(), role: 'advisor', timestamp: Date.now(),
          text: cards.length === 1
            ? `${cards[0].symbol} is at $${fmtPrice(cards[0].price)} — ${isUp ? 'up' : 'down'} ${Math.abs(cards[0].change24h).toFixed(2)}% in the last 24h.`
            : `Here's the latest on ${names}:`,
          prices: cards,
        }]);
      } catch (err) {
        setMessages(prev => [...prev, {
          id: uid(), role: 'advisor', timestamp: Date.now(),
          text: `Couldn't fetch prices right now: ${err instanceof Error ? err.message : 'network error'}. Try again in a moment.`,
        }]);
      }
      setIsProcessing(false);
      return;
    }

    // ========================
    // ALL PRICES
    // ========================
    if (intent === 'prices_all') {
      setIsProcessing(true);
      try {
        const tickers = await fetchTickers();
        tickerCacheRef.current = tickers;
        const cards: PriceCard[] = tickers.map(t => ({
          symbol: t.symbol, price: t.last, change24h: t.change24h,
          high24h: t.high24h, low24h: t.low24h, vol24h: t.vol24h, funding: t.funding,
        }));
        const winners = [...cards].sort((a, b) => b.change24h - a.change24h);
        const top = winners[0];
        setMessages(prev => [...prev, {
          id: uid(), role: 'advisor', timestamp: Date.now(),
          text: `Market overview — ${top.symbol} leading with ${top.change24h > 0 ? '+' : ''}${top.change24h.toFixed(2)}%:`,
          prices: cards,
        }]);
      } catch {
        setMessages(prev => [...prev, {
          id: uid(), role: 'advisor', timestamp: Date.now(),
          text: 'Failed to fetch market data. OKX API might be temporarily unavailable.',
        }]);
      }
      setIsProcessing(false);
      return;
    }

    // ========================
    // TRENDING — fetch prices + commentary
    // ========================
    if (intent === 'trending') {
      setIsProcessing(true);
      try {
        const tickers = await fetchTickers();
        tickerCacheRef.current = tickers;
        const sorted = [...tickers].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));
        const cards: PriceCard[] = sorted.slice(0, 3).map(t => ({
          symbol: t.symbol, price: t.last, change24h: t.change24h,
          high24h: t.high24h, low24h: t.low24h, vol24h: t.vol24h, funding: t.funding,
        }));
        const movers = sorted.slice(0, 3).map(t =>
          `${t.symbol} ${t.change24h > 0 ? '+' : ''}${t.change24h.toFixed(2)}%`
        ).join(', ');
        setMessages(prev => [...prev, {
          id: uid(), role: 'advisor', timestamp: Date.now(),
          text: `Biggest movers right now: ${movers}\n\nFor smart money positions and whale signals, run "Analyze Market".`,
          prices: cards,
        }]);
      } catch {
        setMessages(prev => [...prev, {
          id: uid(), role: 'advisor', timestamp: Date.now(),
          text: 'Failed to fetch trending data. Try again in a moment.',
        }]);
      }
      setIsProcessing(false);
      return;
    }

    // ========================
    // PORTFOLIO
    // ========================
    if (intent === 'portfolio') {
      if (!address) {
        setMessages(prev => [...prev, {
          id: uid(), role: 'advisor', timestamp: Date.now(),
          text: 'Connect your wallet first — use the "Connect" button in the top right. Once connected, I can show your on-chain positions.',
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: uid(), role: 'advisor', timestamp: Date.now(),
          text: `Wallet connected: ${address.slice(0, 6)}...${address.slice(-4)}\n\nPortfolio tracking coming in v2. For now, run "Analyze Market" — I'll scan signals and recommend trades sized with Kelly Criterion for your risk profile.`,
        }]);
      }
      return;
    }

    // ========================
    // HELP
    // ========================
    if (intent === 'help') {
      setMessages(prev => [...prev, {
        id: uid(), role: 'advisor', timestamp: Date.now(),
        text: `Here's what I can do:\n\n"BTC" or "ETH" — Live price + funding rate\n"All Prices" — Full market overview\n"What's trending?" — Biggest movers\n"Analyze Market" — Full OKX + Polymarket scan (multi-agent debate + Kelly sizing)\n"Portfolio" — Check connected wallet\n\nOr just type any token name — SOL, OKB, MATIC...`,
      }]);
      return;
    }

    // ========================
    // ANALYZE MARKET — full agent cycle
    // ========================
    if (intent === 'analyze') {
      setIsProcessing(true);
      setAnalysisPhases([]);
      phaseTimerRef.current.forEach(clearTimeout);
      phaseTimerRef.current = [];

      const phases = [
        { text: 'Connecting to OKX OnchainOS...', delay: 0 },
        { text: 'Scanning whale signals across ETH, SOL, Base...', delay: 1200 },
        { text: 'Filtering signals (score > 20)...', delay: 3000 },
        { text: 'Fetching Polymarket leaderboard (top 15)...', delay: 5000 },
        { text: 'Self-optimizing Alpha prompt...', delay: 7500 },
        { text: 'Alpha Hunter analyzing...', delay: 10000 },
        { text: 'Red Team stress-testing...', delay: 15000 },
        { text: 'Judge making final verdict...', delay: 20000 },
        { text: 'Kelly Criterion sizing...', delay: 25000 },
        { text: 'Generating report...', delay: 28000 },
        { text: 'Still working (agent runs can take up to 2 min)...', delay: 60000 },
        { text: 'Almost done...', delay: 90000 },
      ];
      phases.forEach(p => {
        const t = setTimeout(() => setAnalysisPhases(prev => [...prev, p.text]), p.delay);
        phaseTimerRef.current.push(t);
      });

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 125_000); // 125s timeout

        const walletParam = address ? `&wallet=${address}` : '';
        const res = await fetch(`/api/agent-run?manual=true${walletParam}`, { signal: controller.signal });
        clearTimeout(timeout);
        const data = await res.json();

        phaseTimerRef.current.forEach(clearTimeout);
        phaseTimerRef.current = [];
        setAnalysisPhases([]);

        if (data.ok) {
          const trades: TradeExecution[] = (data.trades || [])
            .filter((t: any) => t.execution)
            .map((t: any) => ({
              tokenSymbol: t.tokenSymbol, amountUsd: t.amountUsd,
              confidence: t.confidence || 0, sizingMethod: t.sizingMethod || 'half-kelly',
              chain: t.chain || '196', execution: t.execution,
            }));

          // Build a summary from the response
          const summary = [
            `Scan complete in ${((data.cycle?.latency_ms || 0) / 1000).toFixed(1)}s`,
            `${data.cycle?.signals_found || 0} signals found, ${data.cycle?.signals_filtered || 0} passed filters`,
            `${data.cycle?.trades_executed || 0} trades recommended`,
            data.cycle?.total_usd_deployed ? `$${data.cycle.total_usd_deployed.toFixed(2)} total position` : null,
          ].filter(Boolean).join('\n');

          // Try to get the greeting from DB
          let greetingText = summary;
          if (profile?.walletAddress) {
            try {
              const dbMsgs = await fetchDBMessages(profile.walletAddress);
              if (dbMsgs.length > 0) {
                const latest = dbMsgs[dbMsgs.length - 1];
                greetingText = latest.message.replace(/\*/g, '').replace(/_/g, '');
              }
            } catch {}
          }

          setMessages(prev => [...prev, {
            id: uid(), role: 'advisor', timestamp: Date.now(),
            text: greetingText, isLive: true,
            trades: trades.length > 0 ? trades : undefined,
          }]);
        } else {
          // API returned ok:false — still show what we got
          const reason = data.cycle?.llm_reasoning || data.error || 'No actionable signals this cycle.';
          setMessages(prev => [...prev, {
            id: uid(), role: 'advisor', timestamp: Date.now(),
            text: `Analysis complete but no trades recommended.\n\n${reason}`,
          }]);
        }
      } catch (err) {
        phaseTimerRef.current.forEach(clearTimeout);
        phaseTimerRef.current = [];
        setAnalysisPhases([]);

        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        setMessages(prev => [...prev, {
          id: uid(), role: 'advisor', timestamp: Date.now(),
          text: isAbort
            ? 'Analysis timed out (>2 min). The agent cycle may still be running in the background. Try "Analyze Market" again in a few minutes.'
            : `Analysis error: ${err instanceof Error ? err.message : 'Unknown error'}. This is usually temporary — try again.`,
        }]);
      }
      setIsProcessing(false);
      return;
    }

    // ========================
    // GENERIC CHAT — try to be helpful
    // ========================
    setMessages(prev => [...prev, {
      id: uid(), role: 'advisor', timestamp: Date.now(),
      text: `I'm not sure what you mean by "${msg}".\n\nTry asking for a token price (e.g. "BTC", "ETH SOL"), or use "Analyze Market" for a full agent scan.\n\nType "help" to see everything I can do.`,
    }]);

  }, [inputText, isProcessing, profile?.walletAddress, address, advisorName]);

  return (
    <div className="h-[calc(100vh-4rem)] bg-black text-white flex flex-col">
      {showSetup && <AdvisorSetup onComplete={handleSetupComplete} />}

      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/[0.06] bg-black">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-white/20 hover:text-white/50 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="w-8 h-8 border border-green-500/20 bg-green-500/5 flex items-center justify-center">
              <span className="text-[11px] font-bold text-green-400">{advisorName.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <h1 className="text-[14px] font-semibold text-white/90">{advisorName}</h1>
              <p className="text-[10px] text-white/30 font-mono">
                {isProcessing ? 'Working...' : 'Online'} · Scans every {profile?.scanIntervalHours || 8}h
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {address ? (
              <button onClick={() => openWallet()}
                className="flex items-center gap-1.5 text-[11px] text-green-400/70 border border-green-500/20 px-2.5 py-1.5 hover:bg-green-500/10 transition-colors font-mono">
                <Wallet className="w-3 h-3" />
                {address.slice(0, 6)}...{address.slice(-4)}
              </button>
            ) : (
              <button onClick={() => openWallet()}
                className="flex items-center gap-1.5 text-[11px] text-green-400 border border-green-500/30 px-2.5 py-1.5 hover:bg-green-500/10 transition-colors">
                <Wallet className="w-3 h-3" />
                Connect
              </button>
            )}
            {isConnected && profile && (
              <button onClick={() => setShowSetup(true)}
                className="p-2 border border-white/[0.06] hover:border-white/20 transition-colors">
                <Settings className="w-3.5 h-3.5 text-white/30" />
              </button>
            )}
            {isConnected && !profile && (
              <button onClick={() => setShowSetup(true)}
                className="text-[11px] text-green-400/60 border border-green-500/20 px-3 py-1.5 hover:bg-green-500/10 transition-colors">
                Setup
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
          {messages.map((msg, i) => (
            <ChatBubble key={msg.id} msg={msg} advisorName={advisorName}
              isLatest={i === messages.length - 1 && msg.role === 'advisor'} walletAddress={address} />
          ))}
          <AnimatePresence>
            {isProcessing && analysisPhases.length > 0 && (
              <LiveAnalysisBubble phases={analysisPhases} advisorName={advisorName} />
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Quick Actions + Input */}
      <div className="flex-shrink-0 border-t border-white/[0.06] bg-black">
        <div className="max-w-2xl mx-auto px-4 pt-2.5 pb-0">
          <QuickActions onAction={sendMessage} disabled={isProcessing} />
        </div>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <input type="text" value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={`Ask ${advisorName} — try "BTC" or "Analyze Market"...`}
            className="flex-1 bg-transparent border border-white/[0.08] px-4 py-2.5 text-[14px] text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-colors"
            disabled={isProcessing} />
          <button onClick={() => sendMessage()} disabled={!inputText.trim() || isProcessing}
            className={`w-10 h-10 flex items-center justify-center border transition-all active:scale-[0.95] ${
              inputText.trim() && !isProcessing ? 'bg-white border-white text-black' : 'border-white/[0.08] text-white/20 cursor-not-allowed'
            }`}>
            {isProcessing ? <Activity className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
