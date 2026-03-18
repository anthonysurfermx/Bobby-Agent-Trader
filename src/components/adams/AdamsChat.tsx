// ============================================================
// BobbyChat — Bobby Axelrod-style trading CIO with real market data
// Price queries, inline charts, smart NLP, on-chain execution
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowUp, ArrowLeft, Activity, Settings, Wallet, TrendingUp, TrendingDown, Volume2, VolumeX, Mic, MicOff, Square, Lock, LogOut, Trash2, MoreVertical, X, Share2, Download, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { AdvisorSetup, useAdvisorProfile } from '@/components/agent-radar/AdvisorSetup';
import type { AdvisorProfile } from '@/components/agent-radar/AdvisorSetup';
import { fetchTickers, fetchMarketDetail, formatVolume, type OKXTicker } from '@/services/okx-market.service';
import { SwapConfirm, type TradeExecution } from './SwapConfirm';
import { XLayerSwapCard } from './XLayerSwapCard';
import PerpsTradeCard from './PerpsTradeCard';
import TradingModeSelector, { type TradingMode } from './TradingModeSelector';
import { VoiceOrb, type OrbState, type OrbMood } from './VoiceOrb';
import { IntelligenceFeed, type DebateData, type MetacognitionData, type SignalData, type PolyData } from './IntelligenceFeed';
import { useBobbyVoice } from '@/hooks/useBobbyVoice';
import { useAuth } from '@/hooks/useAuth';
import { ResponsiveContainer, AreaChart, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts';

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
  // Commodities — Bobby is a Macro-Sovereign Agent
  gold: 'XAUT-USDT', oro: 'XAUT-USDT', xaut: 'XAUT-USDT', xau: 'XAUT-USDT',
  paxg: 'PAXG-USDT', 'pax gold': 'PAXG-USDT',
  silver: 'XAG-USDT-SWAP', plata: 'XAG-USDT-SWAP', xag: 'XAG-USDT-SWAP',
};

function detectTokens(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const [key, instId] of Object.entries(TOKEN_MAP)) {
    if (new RegExp(`\\b${key}\\b`).test(lower) && !found.includes(instId)) {
      found.push(instId);
    }
  }
  return found;
}

// ---- Stock symbol detection ----
// Bobby also understands traditional finance — stocks, ETFs, indices

const STOCK_MAP: Record<string, string> = {
  nvidia: 'NVDA', nvda: 'NVDA',
  apple: 'AAPL', aapl: 'AAPL',
  tesla: 'TSLA', tsla: 'TSLA',
  meta: 'META', facebook: 'META',
  google: 'GOOGL', googl: 'GOOGL', alphabet: 'GOOGL',
  amazon: 'AMZN', amzn: 'AMZN',
  microsoft: 'MSFT', msft: 'MSFT',
  amd: 'AMD',
  intel: 'INTC', intc: 'INTC',
  coinbase: 'COIN', coin: 'COIN',
  microstrategy: 'MSTR', mstr: 'MSTR',
  palantir: 'PLTR', pltr: 'PLTR',
  netflix: 'NFLX', nflx: 'NFLX',
  disney: 'DIS', dis: 'DIS',
  jpmorgan: 'JPM', jpm: 'JPM',
  goldman: 'GS',
  'sp500': 'SPY', 'spy': 'SPY', 's&p': 'SPY',
  nasdaq: 'QQQ', qqq: 'QQQ',
};

function detectStocks(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const [key, ticker] of Object.entries(STOCK_MAP)) {
    if (new RegExp(`\\b${key.replace('&', '\\&')}\\b`).test(lower) && !found.includes(ticker)) {
      found.push(ticker);
    }
  }
  return found;
}

async function fetchStockPrices(symbols: string[]): Promise<Array<{ symbol: string; name: string; price: number; change24h: number; dayHigh: number; dayLow: number; volume: number }>> {
  try {
    const res = await fetch(`/api/stock-price?symbols=${symbols.join(',')}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.quotes || [];
  } catch { return []; }
}

// ---- Interest tag auto-save ----
// Bobby silently saves what assets the user is watching to user_interests
async function saveInterestTags(wallet: string, tokens: string[], context: string) {
  if (!wallet || tokens.length === 0) return;
  for (const instId of tokens) {
    const asset = instId.split('-')[0]; // BTC-USDT → BTC
    try {
      // Check if interest already exists
      const checkRes = await fetch(
        `${SB_URL}/rest/v1/user_interests?wallet_address=eq.${wallet}&asset=eq.${asset}&active=eq.true&select=id`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );
      const existing = await checkRes.json();
      if (Array.isArray(existing) && existing.length > 0) {
        // Update context timestamp — user is still interested
        await fetch(`${SB_URL}/rest/v1/user_interests?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          headers: {
            apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
            'Content-Type': 'application/json', Prefer: 'return=minimal',
          },
          body: JSON.stringify({ context, target_threshold: 0.75 }),
        });
      } else {
        // Insert new interest
        await fetch(`${SB_URL}/rest/v1/user_interests`, {
          method: 'POST',
          headers: {
            apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
            'Content-Type': 'application/json', Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            wallet_address: wallet,
            asset,
            context,
            target_threshold: 0.75,
            active: true,
          }),
        });
      }
    } catch { /* silent — don't block chat for interest tracking */ }
  }
}

function detectIntent(text: string): 'price' | 'analyze' | 'portfolio' | 'trending' | 'prices_all' | 'help' | 'chat' {
  const l = text.toLowerCase();
  const wordCount = l.split(/\s+/).length;

  // RULE 1: Opinion / analysis / outlook questions → ALWAYS Bobby's brain (chat)
  // This catches: "¿Cuál es tu análisis del oro esta semana?", "What do you think about BTC?",
  // "¿Crees que el mercado va a subir?", "How do you see ETH this week?"
  // Key: if the sentence is a QUESTION with opinion markers, it's always chat — even if it
  // contains words like "análisis" or token names.
  const isOpinionQuestion = /\b(opin|piens|crees|think|deberi|should|recomiend|recommend|tell me|dime|explica|explain|por ?qu[eé]|why|como ves|how do you see|que onda|what.?s your|cual es tu|an[aá]lisis|analysis|outlook|perspectiv|pronos|predict|forecast|va a (subir|bajar)|will .* (go|rise|fall|drop|pump|dump)|esta semana|this week|este mes|this month|próxim[oa]|next|futuro|future|qué har[ií]as|what would you|cómo est[aá]|how.?s the|sentiment|sentimiento|mercado va|market going|afectar[aá]?|impact|affect|benefici|perjudic|compar[ae]|versus|vs\.?|entre|between|conviene|mejor|worse|better|riesg|risk|oportunid|opportunity|estrategi|strategy|jugada|play|movida|move)\b/i.test(l);

  // Also route to chat if stocks are detected (any stock question needs Bobby's brain)
  if ((isOpinionQuestion && wordCount > 3) || (detectStocks(text).length > 0 && wordCount > 2)) return 'chat';

  // RULE 2: Short, direct commands → specific handlers
  if (/\b(pric|precio|coti|cuanto|how much|what.?s .* at|dame .* precio)\b/i.test(l) && wordCount <= 5) return 'price';

  // "Analyze Market" or "Run scan" — explicit full-cycle command (short, imperative)
  if (/\b(analyz|analiz|scan|escan|run|ejecut)\b/i.test(l) && wordCount <= 4) return 'analyze';

  if (/\b(portfolio|position|posicion|balance|cartera|wallet)\b/i.test(l)) return 'portfolio';
  if (/\b(trend|trending|hot|popular|whats up|que hay)\b/i.test(l) && wordCount <= 5) return 'trending';
  if (/\b(prices|precios|all|todos|overview|resumen)\b/i.test(l) && wordCount <= 4) return 'prices_all';
  if (/\b(help|ayuda|command)\b/i.test(l)) return 'help';

  // RULE 3: Token mentioned in a longer sentence → Bobby's brain analyzes it
  // Short inputs like "BTC" or "ETH SOL" → price card; anything longer → Bobby thinks
  if (detectTokens(text).length > 0) {
    return wordCount <= 2 ? 'price' : 'chat';
  }

  // Default: everything else goes to Bobby's brain
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
  debate?: DebateData;
  metacognition?: MetacognitionData;
  topSignals?: SignalData[];
  polymarket?: PolyData[];
  technicalAnalysis?: {
    symbol: string;
    candles: Array<{ ts: number; o: number; h: number; l: number; c: number; vol: number }>;
    indicators: { sma20: (number | null)[]; sma50: (number | null)[]; rsi14: (number | null)[]; bollingerUpper: (number | null)[]; bollingerLower: (number | null)[] };
    support: number[];
    resistance: number[];
    summary: Record<string, unknown>;
  };
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
    <div onClick={skip} className="cursor-pointer">
      <DebateText text={displayed} />
      {!done && <span className="inline-block w-[5px] h-[13px] bg-green-400 ml-[1px] align-middle animate-pulse" />}
    </div>
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

// ---- Inline Price Card with Expandable Chart ----

interface CandlePoint { ts: number; close: number; date: string }

const candleCache: Record<string, { data: CandlePoint[]; exp: number }> = {};

// Known stock symbols — used to route chart requests to Yahoo Finance vs OKX
const KNOWN_STOCK_SYMBOLS = new Set(Object.values(STOCK_MAP));

async function fetchCandles(symbol: string): Promise<CandlePoint[]> {
  const key = symbol;
  const cached = candleCache[key];
  if (cached && cached.exp > Date.now()) return cached.data;

  try {
    let candles: CandlePoint[];

    if (KNOWN_STOCK_SYMBOLS.has(symbol)) {
      // Stock → Yahoo Finance chart API
      const res = await fetch(`/api/stock-candles?symbol=${encodeURIComponent(symbol)}&range=7d`);
      if (!res.ok) return [];
      const json = await res.json();
      candles = (json.candles || []).map((c: { ts: number; close: number }) => ({
        ts: c.ts,
        close: c.close,
        date: new Date(c.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      }));
    } else {
      // Crypto → OKX candles API
      const instId = `${symbol}-USDT`;
      const res = await fetch(`/api/okx-candles?instId=${encodeURIComponent(instId)}&bar=1D&limit=7`);
      if (!res.ok) return [];
      const json = await res.json();
      candles = (json.candles || []).map((c: { ts: number; close: number }) => ({
        ts: c.ts,
        close: c.close,
        date: new Date(c.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      }));
    }

    candleCache[key] = { data: candles, exp: Date.now() + 5 * 60_000 };
    return candles;
  } catch { return []; }
}

function MiniChart({ symbol, isUp }: { symbol: string; isUp: boolean }) {
  const [data, setData] = useState<CandlePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchCandles(symbol).then(d => { setData(d); setLoading(false); });
  }, [symbol]);

  const color = isUp ? '#22c55e' : '#ef4444';
  const gradientId = `chart-${symbol}`;

  if (loading) {
    return (
      <div className="h-[120px] flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (data.length < 2) {
    return (
      <div className="h-[120px] flex items-center justify-center text-[10px] text-neutral-600 font-mono">
        No chart data available
      </div>
    );
  }

  const minPrice = Math.min(...data.map(d => d.close));
  const maxPrice = Math.max(...data.map(d => d.close));
  const padding = (maxPrice - minPrice) * 0.1 || maxPrice * 0.01;

  return (
    <div className="h-[120px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: '#6B7280' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[minPrice - padding, maxPrice + padding]}
            hide
          />
          <Tooltip
            contentStyle={{
              background: '#161A1D',
              border: '1px solid rgba(34,197,94,0.2)',
              borderRadius: 6,
              fontSize: 11,
              fontFamily: 'monospace',
              color: '#E5E7EB',
            }}
            formatter={(value: number) => [`$${fmtPrice(value)}`, 'Price']}
            labelStyle={{ color: '#6B7280', fontSize: 9 }}
          />
          <Area
            type="monotone"
            dataKey="close"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 3, fill: color, stroke: '#161A1D', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function InlinePriceCard({ price, highlighted, labels }: { price: PriceCard; highlighted?: boolean; labels?: { high: string; low: string; volume: string; funding: string } }) {
  const lb = labels || { high: '24h High', low: '24h Low', volume: 'Volume', funding: 'Funding' };
  const isUp = price.change24h >= 0;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`border rounded-lg p-3 font-mono text-[11px] transition-all duration-500 cursor-pointer ${
        highlighted
          ? 'border-green-500/40 bg-green-500/[0.06] shadow-[0_0_20px_rgba(34,197,94,0.15)]'
          : 'border-neutral-700/50 bg-neutral-900/50 hover:border-neutral-600/60'
      }`}
      onClick={() => setExpanded(prev => !prev)}
    >
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
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold text-white">${fmtPrice(price.price)}</span>
          <span className={`text-[9px] transition-transform duration-200 ${expanded ? 'rotate-180' : ''} text-neutral-600`}>▼</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-neutral-500">
        <div>
          <div className="text-[9px] text-neutral-600 uppercase">{lb.high}</div>
          <div className="text-neutral-400">${fmtPrice(price.high24h)}</div>
        </div>
        <div>
          <div className="text-[9px] text-neutral-600 uppercase">{lb.low}</div>
          <div className="text-neutral-400">${fmtPrice(price.low24h)}</div>
        </div>
        <div>
          <div className="text-[9px] text-neutral-600 uppercase">{lb.volume}</div>
          <div className="text-neutral-400">{formatVolume(price.vol24h)}</div>
        </div>
      </div>
      {price.funding && (
        <div className="mt-2 pt-2 border-t border-neutral-800 flex items-center gap-3">
          <span className="text-neutral-600">{lb.funding}:</span>
          <span className={price.funding.rate > 0 ? 'text-green-400' : 'text-red-400'}>
            {(price.funding.rate * 100).toFixed(4)}%
          </span>
          <span className="text-neutral-600">({price.funding.annualized.toFixed(1)}% APR)</span>
        </div>
      )}
      {/* Expandable 7-day chart */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-neutral-800/50">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-neutral-600 uppercase tracking-wider">7D Price</span>
          </div>
          <MiniChart symbol={price.symbol} isUp={isUp} />
        </div>
      )}
    </div>
  );
}

// ---- Debate Text Renderer ----
// Splits text by agent markers and renders each section with distinct visual style

const AGENT_STYLES: Record<string, { border: string; name: string; nameColor: string; icon: string }> = {
  alpha:   { border: 'border-l-green-500/60', name: 'ALPHA HUNTER', nameColor: 'text-green-400', icon: '🟢' },
  redteam: { border: 'border-l-red-500/60',   name: 'RED TEAM',     nameColor: 'text-red-400',   icon: '🔴' },
  cio:     { border: 'border-l-yellow-500/60', name: 'BOBBY CIO',   nameColor: 'text-yellow-400', icon: '🟡' },
};

function DebateText({ text }: { text: string }) {
  // Split text into agent sections
  const sectionRegex = /\*\*\s*(ALPHA\s*HUNTER|RED\s*TEAM|MY\s*VERDICT|MI\s*VEREDICTO)\s*:?\s*\*\*:?\s*/gi;
  const parts: Array<{ agent: string | null; content: string }> = [];
  let match: RegExpExecArray | null;
  const matches: Array<{ index: number; end: number; agent: string }> = [];

  sectionRegex.lastIndex = 0;
  while ((match = sectionRegex.exec(text)) !== null) {
    const label = match[1].toLowerCase().replace(/\s+/g, '');
    const agent = label.includes('alpha') ? 'alpha' : label.includes('red') ? 'redteam' : 'cio';
    matches.push({ index: match.index, end: match.index + match[0].length, agent });
  }

  if (matches.length === 0) {
    // No debate markers — render as plain text
    return <span className="whitespace-pre-line">{text}</span>;
  }

  // Text before first marker
  if (matches[0].index > 0) {
    const preamble = text.slice(0, matches[0].index).trim();
    if (preamble) parts.push({ agent: null, content: preamble });
  }

  // Each agent section
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].end;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const content = text.slice(start, end).trim();
    if (content) parts.push({ agent: matches[i].agent, content });
  }

  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        if (!part.agent) {
          return <span key={i} className="whitespace-pre-line">{part.content}</span>;
        }
        const style = AGENT_STYLES[part.agent];
        // Extract conviction score from CIO verdict (e.g. "Conviction: 7/10" or "conviction score: 0.85")
        let conviction: number | null = null;
        if (part.agent === 'cio') {
          const convMatch = part.content.match(/conviction[:\s]*(\d+(?:\.\d+)?)\s*[\/out of]*\s*10/i)
            || part.content.match(/conviction[:\s]*(\d+(?:\.\d+)?)\s*\/\s*10/i)
            || part.content.match(/conviction[:\s]+(\d+(?:\.\d+)?)/i);
          if (convMatch) {
            let val = parseFloat(convMatch[1]);
            if (val > 1) val = val / 10; // normalize 7/10 → 0.7
            conviction = Math.min(1, Math.max(0, val));
          }
        }
        return (
          <div key={i} className={`border-l-2 ${style.border} pl-3 py-1`}>
            <div className={`text-[10px] font-bold tracking-wider mb-1 ${style.nameColor}`}>
              {style.icon} {style.name}
            </div>
            <div className="whitespace-pre-line">{part.content}</div>
            {conviction !== null && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[9px] font-mono text-yellow-400/70">CONVICTION</span>
                <div className="flex-1 h-1.5 bg-white/[0.05] rounded-full overflow-hidden max-w-[150px]">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      conviction >= 0.7 ? 'bg-green-500' : conviction >= 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${conviction * 100}%` }}
                  />
                </div>
                <span className={`text-[10px] font-mono font-bold ${
                  conviction >= 0.7 ? 'text-green-400' : conviction >= 0.4 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {(conviction * 10).toFixed(0)}/10
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Technical Analysis Chart ----
// Candles + SMA20/50 + Support/Resistance lines + RSI indicator

function TechnicalChart({ data }: { data: ChatMsg['technicalAnalysis'] }) {
  if (!data || !data.candles || data.candles.length < 10) return null;

  const { candles, indicators, support, resistance, summary } = data;
  const rsiValue = summary?.rsi as number | undefined;

  // Parse entry/stop/target from Bobby's text would happen here
  // For now, show candles + SMA + S/R levels

  const chartData = candles.map((c, i) => ({
    time: new Date(c.ts).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit' }),
    price: c.c,
    high: c.h,
    low: c.l,
    sma20: indicators.sma20[i],
    sma50: indicators.sma50[i],
    bbUpper: indicators.bollingerUpper[i],
    bbLower: indicators.bollingerLower[i],
  }));

  const prices = candles.map(c => c.c);
  const allPrices = [...prices, ...support, ...resistance].filter(Boolean);
  const minPrice = Math.min(...allPrices) * 0.998;
  const maxPrice = Math.max(...allPrices) * 1.002;
  const isUp = prices[prices.length - 1] >= prices[0];
  const trend = summary?.trend as string || 'NEUTRAL';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="border border-white/[0.06] bg-white/[0.02] p-3 sm:p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-mono font-bold text-white/70">{data.symbol}</span>
          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
            trend === 'BULLISH' ? 'bg-green-500/10 text-green-400' : trend === 'BEARISH' ? 'bg-red-500/10 text-red-400' : 'bg-white/5 text-white/30'
          }`}>
            {trend}
          </span>
          {rsiValue !== undefined && (
            <span className={`text-[9px] font-mono ${rsiValue > 70 ? 'text-red-400' : rsiValue < 30 ? 'text-green-400' : 'text-white/30'}`}>
              RSI {rsiValue.toFixed(0)}
            </span>
          )}
          {summary?.bollinger_squeeze && (
            <span className="text-[8px] font-mono px-1 py-0.5 bg-amber-500/10 text-amber-400 rounded animate-pulse">SQUEEZE</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[8px] font-mono text-white/20">
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-yellow-400 inline-block" />SMA20</span>
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-blue-400 inline-block" />SMA50</span>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[180px] sm:h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
            <XAxis dataKey="time" tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.15)' }} tickLine={false} axisLine={false} interval={Math.floor(chartData.length / 6)} />
            <YAxis domain={[minPrice, maxPrice]} tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.15)' }} tickLine={false} axisLine={false} width={55} tickFormatter={v => `$${v.toLocaleString()}`} />
            <Tooltip
              contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', fontSize: 10, fontFamily: 'monospace' }}
              labelStyle={{ color: 'rgba(255,255,255,0.4)' }}
              formatter={(value: number, name: string) => [`$${value?.toLocaleString()}`, name]}
            />

            {/* Bollinger Bands (shaded area) */}
            <Area type="monotone" dataKey="bbUpper" stroke="none" fill="rgba(255,255,255,0.02)" />
            <Area type="monotone" dataKey="bbLower" stroke="none" fill="rgba(255,255,255,0.02)" />

            {/* Price line */}
            <Area
              type="monotone" dataKey="price" stroke={isUp ? '#22c55e' : '#ef4444'} strokeWidth={1.5}
              fill={isUp ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'}
            />

            {/* SMA lines */}
            <Line type="monotone" dataKey="sma20" stroke="#eab308" strokeWidth={1} dot={false} strokeDasharray="4 2" connectNulls />
            <Line type="monotone" dataKey="sma50" stroke="#3b82f6" strokeWidth={1} dot={false} strokeDasharray="4 2" connectNulls />

            {/* Support levels */}
            {support.map((level, i) => (
              <ReferenceLine key={`s${i}`} y={level} stroke="#22c55e" strokeDasharray="6 3" strokeWidth={0.8} label={{ value: `S $${level.toLocaleString()}`, position: 'left', fontSize: 8, fill: '#22c55e80' }} />
            ))}

            {/* Resistance levels */}
            {resistance.map((level, i) => (
              <ReferenceLine key={`r${i}`} y={level} stroke="#ef4444" strokeDasharray="6 3" strokeWidth={0.8} label={{ value: `R $${level.toLocaleString()}`, position: 'right', fontSize: 8, fill: '#ef444480' }} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Support/Resistance summary */}
      <div className="flex items-center justify-between mt-2 text-[8px] font-mono text-white/20">
        <div className="flex items-center gap-2">
          {support.length > 0 && <span className="text-green-400/40">Support: {support.map(s => `$${s.toLocaleString()}`).join(', ')}</span>}
        </div>
        <div className="flex items-center gap-2">
          {resistance.length > 0 && <span className="text-red-400/40">Resistance: {resistance.map(r => `$${r.toLocaleString()}`).join(', ')}</span>}
        </div>
      </div>
    </motion.div>
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
  const { isAuthenticated, signOut } = useAuth();
  const navigate = useNavigate();
  const [showSetup, setShowSetup] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    // Restore conversation from localStorage
    try {
      const saved = localStorage.getItem('bobby_chat_history');
      if (saved) {
        const parsed = JSON.parse(saved) as ChatMsg[];
        // Only restore if less than 24h old
        const newest = parsed[parsed.length - 1];
        if (newest && Date.now() - newest.timestamp < 24 * 60 * 60 * 1000) {
          return parsed.map(m => ({ ...m, isLive: false }));
        }
      }
    } catch {}
    return [];
  });
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisPhases, setAnalysisPhases] = useState<string[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // Block-by-block analysis: queue of paragraphs waiting to be revealed
  const [pendingBlocks, setPendingBlocks] = useState<string[]>([]);
  const [awaitingContinue, setAwaitingContinue] = useState(false);
  const pendingMsgIdRef = useRef<string>('');
  const pendingExtrasRef = useRef<Partial<ChatMsg>>({});
  const [highlightedSymbols, setHighlightedSymbols] = useState<Set<string>>(new Set());
  const highlightTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Cache tickers locally for quick re-use
  const tickerCacheRef = useRef<OKXTicker[]>([]);

  // Clear ticker cache every 5 minutes to ensure fresh data
  useEffect(() => {
    const interval = setInterval(() => { tickerCacheRef.current = []; }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Language must be declared early — used by voice, i18n, and intent detection
  // Detect from profile, localStorage, or browser language
  const lang = profile?.language || localStorage.getItem('bobby_lang') || (navigator.language.startsWith('es') ? 'es' : 'en');
  const advisorName = profile?.advisorName || 'Bobby';

  // ---- Bobby's Voice ----
  const { speak, speakLocal, queueSentence, flushQueue, stop: stopVoice, getLastResponseAudio, clearResponseAudio, hasResponseAudio, isSpeaking, analyser } = useBobbyVoice();
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem('bobby_voice_enabled');
      return stored === null ? true : stored === 'true'; // ON by default for first-time users
    } catch { return true; }
  });
  const toggleVoice = useCallback(() => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    try { localStorage.setItem('bobby_voice_enabled', String(next)); } catch {}
    if (!next) stopVoice();
  }, [voiceEnabled, stopVoice]);

  // ---- Live market sentiment badge (Fear & Greed + DXY) ----
  const [marketBadge, setMarketBadge] = useState<{ fgi: number; fgiLabel: string; dxy: number } | null>(null);
  useEffect(() => {
    fetch('/api/bobby-intel').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.fearGreed && d?.dxy) {
        setMarketBadge({ fgi: d.fearGreed.value, fgiLabel: d.fearGreed.classification, dxy: d.dxy.dxy });
      }
    }).catch(() => {});
  }, []);

  // ---- Trading Mode (onboarding selection) ----
  const [tradingMode, setTradingMode] = useState<TradingMode | null>(() => {
    try { return localStorage.getItem('bobby_trading_mode') as TradingMode | null; } catch { return null; }
  });

  // ---- Trading Room mode (multi-agent debate with 3 voices) ----
  const [tradingRoom, setTradingRoom] = useState(() => {
    try { const v = localStorage.getItem('bobby_trading_room'); return v === null ? true : v === 'true'; } catch { return true; }
  });
  const toggleTradingRoom = useCallback(() => {
    const next = !tradingRoom;
    setTradingRoom(next);
    try { localStorage.setItem('bobby_trading_room', String(next)); } catch {}
  }, [tradingRoom]);

  // Auto-speak new advisor messages when voice is enabled
  const lastSpokenRef = useRef<string>('');
  const speakIfEnabled = useCallback((text: string) => {
    if (!voiceEnabled || !text || text === lastSpokenRef.current) return;
    const clean = text.replace(/[-*_#>]/g, '').replace(/\n+/g, '. ').trim();
    if (clean.length < 10) return;
    lastSpokenRef.current = text;
    queueSentence(clean, 'cio', lang);
  }, [voiceEnabled, queueSentence, lang]);

  // Speak fillers via Edge TTS (same quality as main voice — no more robotic browser TTS)
  const speakFillerLocal = useCallback((text: string) => {
    if (!voiceEnabled || !text) return;
    queueSentence(text, 'cio', lang);
  }, [voiceEnabled, queueSentence, lang]);

  // ---- Ambient thinking sound (Web Audio API — no external files) ----
  const thinkingAudioRef = useRef<{ osc: OscillatorNode; gain: GainNode; ctx: AudioContext } | null>(null);
  const startThinkingSound = useCallback(() => {
    try {
      if (thinkingAudioRef.current) return; // already playing
      const ctx = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const lfo = ctx.createOscillator(); // subtle modulation
      const lfoGain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = 220; // low ambient hum
      gain.gain.value = 0;
      // Fade in smoothly
      gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.5);

      // LFO for subtle pulsing
      lfo.type = 'sine';
      lfo.frequency.value = 0.5; // slow pulse
      lfoGain.gain.value = 0.03;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      lfo.start();

      thinkingAudioRef.current = { osc, gain, ctx };
    } catch { /* silent — audio not critical */ }
  }, []);

  const stopThinkingSound = useCallback(() => {
    const ref = thinkingAudioRef.current;
    if (!ref) return;
    try {
      ref.gain.gain.linearRampToValueAtTime(0, ref.ctx.currentTime + 0.3);
      setTimeout(() => {
        try { ref.osc.stop(); ref.ctx.close(); } catch {}
      }, 400);
    } catch {}
    thinkingAudioRef.current = null;
  }, []);

  // ---- Typewriter effect for analyze results ----
  const typewriterRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typewriterText = useCallback((msgId: string, fullText: string, onDone?: () => void) => {
    let i = 0;
    const speed = Math.max(8, Math.min(25, 2000 / fullText.length)); // adaptive speed: longer text = faster
    const step = () => {
      // Reveal in chunks of 2-4 chars for natural feel
      const chunk = Math.min(fullText.length, i + (Math.random() > 0.7 ? 4 : 2));
      i = chunk;
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, text: fullText.slice(0, i) } : m
      ));
      if (i < fullText.length) {
        typewriterRef.current = setTimeout(step, speed);
      } else {
        onDone?.();
      }
    };
    step();
  }, []);

  // ---- Stop everything: voice + processing ----
  const stopAll = useCallback(() => {
    stopVoice();
    stopThinkingSound();
    if (typewriterRef.current) { clearTimeout(typewriterRef.current); typewriterRef.current = null; }
    setIsProcessing(false);
    setAnalysisPhases([]);
    phaseTimerRef.current.forEach(clearTimeout);
    phaseTimerRef.current = [];
  }, [stopVoice, stopThinkingSound]);

  // Cleanup thinking sound on unmount
  useEffect(() => () => { stopThinkingSound(); }, [stopThinkingSound]);

  // ---- Clear chat history (localStorage + Supabase) ----
  const clearChats = useCallback(async () => {
    // Clear localStorage
    try { localStorage.removeItem('bobby_chat_history'); } catch {}
    // Clear Supabase messages for this wallet
    if (profile?.walletAddress) {
      try {
        await fetch(
          `${SB_URL}/rest/v1/agent_messages?wallet_address=eq.${profile.walletAddress}`,
          { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'return=minimal' } }
        );
      } catch {}
    }
    // Reset UI
    setMessages([]);
    setConfirmClear(false);
    setShowMenu(false);
    stopAll();
  }, [profile?.walletAddress, stopAll]);

  // ---- Logout ----
  const handleLogout = useCallback(async () => {
    stopAll();
    setShowMenu(false);
    try { localStorage.removeItem('bobby_chat_history'); } catch {}
    await signOut();
    navigate('/login');
  }, [signOut, navigate, stopAll]);

  // ---- Block-by-block: reveal next paragraph ----
  const revealNextBlock = useCallback(() => {
    setPendingBlocks(prev => {
      if (prev.length === 0) return prev;
      const [nextBlock, ...rest] = prev;
      const msgId = pendingMsgIdRef.current;

      // Append block to existing message text
      setMessages(msgs => {
        const existing = msgs.find(m => m.id === msgId);
        const currentText = existing?.text || '';
        const newText = currentText ? `${currentText}\n\n${nextBlock}` : nextBlock;

        // If this is the last block, also attach extras (debate, trades, etc.)
        if (rest.length === 0) {
          return msgs.map(m => m.id === msgId ? { ...m, text: newText, ...pendingExtrasRef.current } : m);
        }
        return msgs.map(m => m.id === msgId ? { ...m, text: newText } : m);
      });

      // Speak this block
      speakIfEnabled(nextBlock);

      // Auto-scroll to show new content
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 100);

      if (rest.length > 0) {
        // More blocks remaining — ask "Continue?"
        setAwaitingContinue(true);
      } else {
        // All blocks revealed
        setAwaitingContinue(false);
        pendingExtrasRef.current = {};
      }
      return rest;
    });
  }, [speakIfEnabled]);

  // ---- Keyword-to-UI: scan streaming text and highlight mentioned symbols ----
  const scanAndHighlight = useCallback((text: string) => {
    const symbols = ['BTC', 'ETH', 'SOL', 'OKB', 'MATIC', 'XAUT', 'PAXG', 'XAG', 'GOLD', 'ORO', 'PLATA', 'SILVER', 'NVDA'];
    const upper = text.toUpperCase();
    for (const sym of symbols) {
      if (upper.includes(sym)) {
        // Normalize to display symbol
        const displaySym = sym === 'GOLD' || sym === 'ORO' ? 'XAUT' : sym === 'PLATA' || sym === 'SILVER' ? 'XAG' : sym;
        // 200ms delay — feels like Bobby is "calling" the data
        const existingTimeout = highlightTimeoutRef.current.get(displaySym);
        if (!existingTimeout) {
          const t = setTimeout(() => {
            setHighlightedSymbols(prev => new Set(prev).add(displaySym));
            // Auto-remove highlight after 4 seconds
            setTimeout(() => {
              setHighlightedSymbols(prev => {
                const next = new Set(prev);
                next.delete(displaySym);
                return next;
              });
              highlightTimeoutRef.current.delete(displaySym);
            }, 4000);
          }, 200);
          highlightTimeoutRef.current.set(displaySym, t);
        }
      }
    }
  }, []);

  // ---- Speech Recognition (user talks back to Bobby) ----
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const sendMessageRef = useRef<(text?: string) => void>(() => {});

  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || (window as typeof window & { webkitSpeechRecognition: typeof window.SpeechRecognition }).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = lang === 'es' ? 'es-MX' : lang === 'pt' ? 'pt-BR' : 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map(r => r[0].transcript)
        .join('');
      setInputText(transcript);

      // Auto-send on final result
      if (event.results[event.results.length - 1].isFinal) {
        setIsListening(false);
        setTimeout(() => sendMessageRef.current(transcript), 300);
      }
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.start();
    setIsListening(true);
  }, [isListening]);

  // ---- i18n strings keyed by language ----
  const i18n = {
    intro: {
      es: `Soy Bobby, tu CIO. Tengo a mi Alpha Hunter buscando oportunidades y a mi Red Team destruyendo cada tesis débil. 9 fuentes de datos en tiempo real — whale flows, funding rates, Fear & Greed, DXY, y más. Cuando hablo, es porque sobreviví mi propio debate interno.\n\n¿Qué quieres que analice?`,
      en: `I'm Bobby, your CIO. I've got my Alpha Hunter scanning for opportunities and my Red Team tearing apart every weak thesis. 9 real-time data sources — whale flows, funding rates, Fear & Greed, DXY, and more. When I speak, it's because I survived my own internal debate.\n\nWhat do you want me to analyze?`,
      pt: `Sou Bobby, seu CIO. Tenho minha Alpha Hunter buscando oportunidades e meu Red Team destruindo cada tese fraca. 9 fontes de dados em tempo real — whale flows, funding rates, Fear & Greed, DXY, e mais. Quando falo, é porque sobrevivi meu próprio debate interno.\n\nO que quer que eu analise?`,
    },
    introShort: {
      es: `Soy Bobby, tu CIO. Alpha Hunter + Red Team + 9 fuentes de datos. Pregúntame lo que quieras.`,
      en: `I'm Bobby, your CIO. Alpha Hunter + Red Team + 9 data sources. Ask me anything.`,
      pt: `Sou Bobby, seu CIO. Alpha Hunter + Red Team + 9 fontes de dados. Pergunte o que quiser.`,
    },
    analyzeFillers: {
      es: [
        "Escáner completo. Desplegando Alpha Hunter, Red Team, y corriendo la dialéctica. Esto toma un minuto — no apresuro mis decisiones.",
        "Corriendo el ciclo completo de inteligencia. Tres agentes debatiendo tu dinero. Dame un momento.",
        "Iniciando escaneo soberano. Señales de ballenas, consenso de Polymarket, conviction scoring. El trabajo real empieza ahora.",
      ],
      en: [
        "Full scan. Deploying Alpha Hunter, Red Team, and running the dialectic. This takes a minute — I don't rush decisions.",
        "Running the complete intelligence cycle. Three agents debating your money. Give me a moment.",
        "Initiating sovereign scan. Whale signals, Polymarket consensus, conviction scoring. The real work starts now.",
      ],
      pt: [
        "Escaneamento completo. Implantando Alpha Hunter, Red Team, e rodando a dialética. Isso leva um minuto — não apresso decisões.",
        "Rodando o ciclo completo de inteligência. Três agentes debatendo seu dinheiro. Me dê um momento.",
        "Iniciando escaneamento soberano. Sinais de baleias, consenso Polymarket, conviction scoring. O trabalho real começa agora.",
      ],
    },
    chatFillers: {
      es: [
        "El mercado se mueve rápido, déjame cruzar los flujos...",
        "Un momento, estoy escaneando la actividad de las ballenas...",
        "Déjame revisar qué está haciendo el smart money...",
        "Pregunta interesante. Déjame jalar los datos reales antes de contestar...",
        "Espera, quiero ver qué está pasando realmente on-chain...",
        "Dame un segundo, estoy analizando los flujos de capital...",
        "Checando las señales de los whales... esto se pone bueno...",
      ],
      en: [
        "The tape is moving fast, let me cross-reference the flows...",
        "Give me a second, I'm scanning the whale activity...",
        "Let me check what the smart money is doing...",
        "Interesting question. Let me pull the real data before I answer...",
        "Hold on, I want to see what's actually happening on-chain...",
        "One sec, analyzing the capital flows...",
        "Checking the whale signals... this is getting interesting...",
      ],
      pt: [
        "O mercado se move rápido, deixa eu cruzar os fluxos...",
        "Um momento, estou escaneando a atividade das baleias...",
        "Deixa eu ver o que o smart money está fazendo...",
        "Pergunta interessante. Deixa eu puxar os dados reais...",
        "Espera, quero ver o que está acontecendo on-chain...",
      ],
    },
    phases: {
      es: [
        { text: 'Conectando a OKX OnchainOS...', delay: 0 },
        { text: 'Escaneando señales whale en ETH, SOL, Base...', delay: 1200 },
        { text: 'Filtrando señales (score > 20)...', delay: 3000 },
        { text: 'Obteniendo leaderboard Polymarket (top 15)...', delay: 5000 },
        { text: 'Auto-optimizando prompt del Alpha Hunter...', delay: 7500 },
        { text: 'Alpha Hunter analizando...', delay: 10000 },
        { text: 'Red Team stress-testing...', delay: 15000 },
        { text: 'Judge emitiendo veredicto final...', delay: 20000 },
        { text: 'Kelly Criterion sizing...', delay: 25000 },
        { text: 'Generando reporte...', delay: 28000 },
        { text: 'Sigo trabajando (el ciclo puede tomar hasta 2 min)...', delay: 60000 },
        { text: 'Casi listo...', delay: 90000 },
      ],
      en: [
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
      ],
      pt: [
        { text: 'Conectando ao OKX OnchainOS...', delay: 0 },
        { text: 'Escaneando sinais whale em ETH, SOL, Base...', delay: 1200 },
        { text: 'Filtrando sinais (score > 20)...', delay: 3000 },
        { text: 'Obtendo leaderboard Polymarket (top 15)...', delay: 5000 },
        { text: 'Auto-otimizando prompt do Alpha Hunter...', delay: 7500 },
        { text: 'Alpha Hunter analisando...', delay: 10000 },
        { text: 'Red Team stress-testing...', delay: 15000 },
        { text: 'Judge emitindo veredicto final...', delay: 20000 },
        { text: 'Kelly Criterion sizing...', delay: 25000 },
        { text: 'Gerando relatório...', delay: 28000 },
        { text: 'Ainda trabalhando (ciclo pode levar até 2 min)...', delay: 60000 },
        { text: 'Quase pronto...', delay: 90000 },
      ],
    },
    priceSingle: {
      es: (sym: string, price: string, up: boolean, change: string) =>
        `${sym} está en $${price} — ${up ? 'subió' : 'bajó'} ${change}% en las últimas 24 horas.`,
      en: (sym: string, price: string, up: boolean, change: string) =>
        `${sym} is at $${price} — ${up ? 'up' : 'down'} ${change}% in the last 24h.`,
      pt: (sym: string, price: string, up: boolean, change: string) =>
        `${sym} está em $${price} — ${up ? 'subiu' : 'caiu'} ${change}% nas últimas 24h.`,
    },
    priceMulti: {
      es: (names: string) => `Aquí tienes lo último de ${names}:`,
      en: (names: string) => `Here's the latest on ${names}:`,
      pt: (names: string) => `Aqui está o mais recente de ${names}:`,
    },
    priceError: {
      es: (err: string) => `No pude obtener precios ahorita: ${err}. Intenta de nuevo en un momento.`,
      en: (err: string) => `Couldn't fetch prices right now: ${err}. Try again in a moment.`,
      pt: (err: string) => `Não consegui obter preços agora: ${err}. Tente de novo em um momento.`,
    },
    scanSummary: {
      es: (time: string, found: number, filtered: number, trades: number, usd: string | null) =>
        [`Escaneo completo en ${time}s`, `${found} señales encontradas, ${filtered} pasaron filtros`, `${trades} trades recomendados`, usd ? `$${usd} posición total` : null].filter(Boolean).join('\n'),
      en: (time: string, found: number, filtered: number, trades: number, usd: string | null) =>
        [`Scan complete in ${time}s`, `${found} signals found, ${filtered} passed filters`, `${trades} trades recommended`, usd ? `$${usd} total position` : null].filter(Boolean).join('\n'),
      pt: (time: string, found: number, filtered: number, trades: number, usd: string | null) =>
        [`Escaneamento completo em ${time}s`, `${found} sinais encontrados, ${filtered} passaram filtros`, `${trades} trades recomendados`, usd ? `$${usd} posição total` : null].filter(Boolean).join('\n'),
    },
    noTrades: {
      es: (reason: string) => `Análisis completo, pero no recomiendo trades. ${reason}`,
      en: (reason: string) => `Analysis complete but no trades recommended. ${reason}`,
      pt: (reason: string) => `Análise completa, mas não recomendo trades. ${reason}`,
    },
    timeout: {
      es: 'El análisis tardó demasiado (>2 min). El ciclo puede seguir corriendo en segundo plano. Intenta "Analyze Market" de nuevo en unos minutos.',
      en: 'Analysis timed out (>2 min). The agent cycle may still be running in the background. Try "Analyze Market" again in a few minutes.',
      pt: 'A análise demorou demais (>2 min). O ciclo pode estar rodando em segundo plano. Tente "Analyze Market" de novo em alguns minutos.',
    },
    analysisError: {
      es: (err: string) => `Error en el análisis: ${err}. Suele ser temporal — intenta de nuevo.`,
      en: (err: string) => `Analysis error: ${err}. This is usually temporary — try again.`,
      pt: (err: string) => `Erro na análise: ${err}. Geralmente é temporário — tente de novo.`,
    },
    noData: {
      es: (msg: string) => `No tengo datos sobre "${msg}". Prueba con "BTC", "ETH", o "Analyze Market".`,
      en: (msg: string) => `I don't have data on "${msg}". Try "BTC", "ETH", or "Analyze Market".`,
      pt: (msg: string) => `Não tenho dados sobre "${msg}". Tente "BTC", "ETH", ou "Analyze Market".`,
    },
    fallbackWithPrices: {
      es: 'Aquí tienes los datos más recientes. Para un análisis completo, prueba "Analyze Market" — ahí despliego el debate multi-agente completo.',
      en: 'Here\'s the latest data. For a full Bobby analysis, try "Analyze Market" — that\'s where I deploy the full multi-agent debate.',
      pt: 'Aqui estão os dados mais recentes. Para uma análise completa, tente "Analyze Market" — é onde eu faço o debate multi-agente completo.',
    },
    fallbackNoPrices: {
      es: 'Te puedo ayudar con precios y análisis de mercado. Prueba:\n\n"BTC" o "ETH" — Precio en vivo\n"All Prices" — Panorama del mercado\n"Analyze Market" — Escaneo completo',
      en: 'I can help with prices and market analysis. Try:\n\n"BTC" or "ETH" — Live price\n"All Prices" — Market overview\n"Analyze Market" — Full agent scan',
      pt: 'Posso ajudar com preços e análise de mercado. Tente:\n\n"BTC" ou "ETH" — Preço ao vivo\n"All Prices" — Visão do mercado\n"Analyze Market" — Escaneamento completo',
    },
    walletConnected: {
      es: (addr: string) => `Wallet conectada: ${addr}\n\nPortfolio tracking próximamente en v2. Por ahora, corre "Analyze Market" — escaneo señales y recomiendo trades con Kelly Criterion para tu perfil de riesgo.`,
      en: (addr: string) => `Wallet connected: ${addr}\n\nPortfolio tracking coming in v2. For now, run "Analyze Market" — I'll scan signals and recommend trades sized with Kelly Criterion for your risk profile.`,
      pt: (addr: string) => `Wallet conectada: ${addr}\n\nPortfolio tracking em breve na v2. Por agora, rode "Analyze Market" — escaneio sinais e recomendo trades com Kelly Criterion para seu perfil de risco.`,
    },
    help: {
      es: 'Esto es lo que puedo hacer:\n\n"BTC" o "ETH" — Precio en vivo + funding rate\n"All Prices" — Panorama del mercado\n"What\'s trending?" — Mayores movimientos\n"Analyze Market" — Escaneo completo OKX + Polymarket (debate multi-agente + Kelly sizing)\n"Portfolio" — Revisar wallet conectada\n\nO escribe cualquier token — SOL, OKB, MATIC...',
      en: 'Here\'s what I can do:\n\n"BTC" or "ETH" — Live price + funding rate\n"All Prices" — Full market overview\n"What\'s trending?" — Biggest movers\n"Analyze Market" — Full OKX + Polymarket scan (multi-agent debate + Kelly sizing)\n"Portfolio" — Check connected wallet\n\nOr just type any token name — SOL, OKB, MATIC...',
      pt: 'Aqui está o que posso fazer:\n\n"BTC" ou "ETH" — Preço ao vivo + funding rate\n"All Prices" — Visão do mercado\n"What\'s trending?" — Maiores movimentos\n"Analyze Market" — Escaneamento completo OKX + Polymarket (debate multi-agente + Kelly sizing)\n"Portfolio" — Verificar wallet conectada\n\nOu digite qualquer token — SOL, OKB, MATIC...',
    },
    marketOverview: {
      es: (sym: string, change: string) => `Panorama del mercado — ${sym} liderando con ${change}%:`,
      en: (sym: string, change: string) => `Market overview — ${sym} leading with ${change}%:`,
      pt: (sym: string, change: string) => `Panorama do mercado — ${sym} liderando com ${change}%:`,
    },
    marketError: {
      es: 'No pude obtener datos del mercado. La API de OKX puede estar temporalmente fuera de servicio.',
      en: 'Failed to fetch market data. OKX API might be temporarily unavailable.',
      pt: 'Não consegui obter dados do mercado. A API da OKX pode estar temporariamente indisponível.',
    },
    trending: {
      es: (movers: string) => `Mayores movimientos ahorita: ${movers}\n\nPara posiciones de smart money y señales de ballenas, corre "Analyze Market".`,
      en: (movers: string) => `Biggest movers right now: ${movers}\n\nFor smart money positions and whale signals, run "Analyze Market".`,
      pt: (movers: string) => `Maiores movimentos agora: ${movers}\n\nPara posições de smart money e sinais de baleias, rode "Analyze Market".`,
    },
    trendingError: {
      es: 'No pude obtener datos de tendencia. Intenta de nuevo en un momento.',
      en: 'Failed to fetch trending data. Try again in a moment.',
      pt: 'Não consegui obter dados de tendência. Tente de novo em um momento.',
    },
    connectWallet: {
      es: 'Conecta tu wallet primero — usa el botón "Connect" arriba a la derecha. Una vez conectada, puedo mostrar tus posiciones on-chain.',
      en: 'Connect your wallet first — use the "Connect" button in the top right. Once connected, I can show your on-chain positions.',
      pt: 'Conecte sua wallet primeiro — use o botão "Connect" no canto superior direito. Uma vez conectada, posso mostrar suas posições on-chain.',
    },
    streamFallback: {
      es: (msg: string) => `Entendí "${msg}" pero no pude generar respuesta. Prueba con precios ("BTC", "ETH") o corre "Analyze Market".`,
      en: (msg: string) => `I understood "${msg}" but couldn't generate a response. Try asking about prices ("BTC", "ETH") or run "Analyze Market".`,
      pt: (msg: string) => `Entendi "${msg}" mas não consegui gerar resposta. Tente preços ("BTC", "ETH") ou rode "Analyze Market".`,
    },
    thinkingLabel: {
      es: 'Escaneando feeds de inteligencia...',
      en: 'Scanning intelligence feeds...',
      pt: 'Escaneando feeds de inteligência...',
    },
    listening: {
      es: 'Escuchando...',
      en: 'Listening...',
      pt: 'Ouvindo...',
    },
    quickActions: {
      es: { gold: 'Oro', silver: 'Plata', allPrices: 'Todos', analyze: 'Analizar Mercado' },
      en: { gold: 'Gold', silver: 'Silver', allPrices: 'All Prices', analyze: 'Analyze Market' },
      pt: { gold: 'Ouro', silver: 'Prata', allPrices: 'Todos', analyze: 'Analisar Mercado' },
    },
    priceLabels: {
      es: { high: 'Máx 24h', low: 'Mín 24h', volume: 'Volumen', funding: 'Funding' },
      en: { high: '24h High', low: '24h Low', volume: 'Volume', funding: 'Funding' },
      pt: { high: 'Máx 24h', low: 'Mín 24h', volume: 'Volume', funding: 'Funding' },
    },
  } as const;

  // Helper to get text for current language with fallback to English
  function t<K extends keyof typeof i18n>(key: K): (typeof i18n)[K][keyof (typeof i18n)[K]] {
    const entry = i18n[key];
    return (entry as Record<string, unknown>)[lang] ?? (entry as Record<string, unknown>)['en'] as any;
  }

  // Only show AdvisorSetup AFTER trading mode is selected (not competing)
  useEffect(() => {
    if (needsSetup && tradingMode) setShowSetup(true);
  }, [needsSetup, tradingMode]);

  // Load conversation — prefer localStorage, fallback to DB, then onboarding
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current) return;
    if (!profile?.walletAddress) return;
    hasInitialized.current = true;

    // If we already restored from localStorage, skip DB fetch
    if (messages.length > 0) return;

    fetchDBMessages(profile.walletAddress).then(dbMsgs => {
      if (dbMsgs.length === 0) {
        // First time onboarding — Bobby introduces himself
        const introText = t('intro') as string;

        fetchTickers().then(tickers => {
          tickerCacheRef.current = tickers;
          const btc = tickers.find(t => t.symbol === 'BTC');
          const eth = tickers.find(t => t.symbol === 'ETH');
          const gold = tickers.find(t => t.symbol === 'XAUT');
          const priceCards: PriceCard[] = [btc, eth, gold].filter(Boolean).map(t => ({
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
            text: introText,
            timestamp: Date.now(),
            isLive: true,
            prices: priceCards, // Show prices immediately with intro
          }]);

          // Auto-speak with small delay (needs user gesture from disclaimer click)
          setTimeout(() => {
            const cleanIntro = introText.replace(/[-*_#>]/g, '').replace(/\n+/g, '. ').trim();
            speak(cleanIntro);
          }, 500);
        }).catch(() => {
          setMessages([{
            id: 'welcome',
            role: 'advisor',
            text: t('introShort') as string,
            timestamp: Date.now(),
            isLive: true,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.walletAddress, advisorName]);

  // Persist conversation to localStorage (keep last 30 messages)
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      const toSave = messages.slice(-30).map(m => ({
        ...m, isLive: false, // don't replay typewriter on restore
      }));
      localStorage.setItem('bobby_chat_history', JSON.stringify(toSave));
    } catch {}
  }, [messages]);

  // Auto-scroll — but only scroll the internal container, not the page
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
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
    // Voice interruption: stop Bobby speaking when user sends new message
    stopVoice();
    setActiveAgent(null);
    setInputText('');

    const userMsg: ChatMsg = { id: uid(), role: 'user', text: msg, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    const intent = detectIntent(msg);
    const tokens = detectTokens(msg);

    // Bobby auto-saves interest tags when user mentions assets
    if (tokens.length > 0 && profile?.walletAddress) {
      saveInterestTags(profile.walletAddress, tokens, `user inquiry: "${msg}"`);
    }

    // ========================
    // BALANCE QUERY — "cuál es mi balance" / "how much do I have"
    // ========================
    const isBalanceQuery = /balance|saldo|cuánto tengo|how much|mi cuenta|my account|disponible|available/i.test(msg);
    if (isBalanceQuery) {
      setIsProcessing(true);
      try {
        const pnlRes = await fetch('/api/bobby-pnl');
        const pnlData = await pnlRes.json();
        if (pnlData.ok) {
          const s = pnlData.summary;
          const positions = pnlData.openPositions || [];
          const modeLabel = tradingMode === 'auto' ? '🤖 AI Execution' : tradingMode === 'confirm' ? '🤝 Human Confirms' : '📝 Paper Trading';
          let balanceText = lang === 'es'
            ? `Tu cuenta de trading:\n\n💰 **Equity total:** $${s.currentEquity.toFixed(2)} USDT\n📊 **Modo:** ${modeLabel}\n📈 **Retorno total:** ${s.totalReturn >= 0 ? '+' : ''}${s.totalReturn}%\n🏆 **Win rate:** ${s.winRate}% (${s.wins}W / ${s.losses}L)`
            : `Your trading account:\n\n💰 **Total equity:** $${s.currentEquity.toFixed(2)} USDT\n📊 **Mode:** ${modeLabel}\n📈 **Total return:** ${s.totalReturn >= 0 ? '+' : ''}${s.totalReturn}%\n🏆 **Win rate:** ${s.winRate}% (${s.wins}W / ${s.losses}L)`;
          if (positions.length > 0) {
            balanceText += lang === 'es' ? '\n\n**Posiciones abiertas:**' : '\n\n**Open positions:**';
            for (const p of positions) {
              balanceText += `\n• ${p.symbol} ${p.direction.toUpperCase()} ${p.leverage} — PnL: $${p.unrealizedPnl.toFixed(4)} (${p.unrealizedPnlPct.toFixed(2)}%)`;
            }
          } else {
            balanceText += lang === 'es' ? '\n\nNo hay posiciones abiertas. Listo para operar.' : '\n\nNo open positions. Ready to trade.';
          }
          setMessages(prev => [...prev, { id: uid(), role: 'advisor', text: balanceText, timestamp: Date.now() }]);
        } else {
          setMessages(prev => [...prev, { id: uid(), role: 'advisor', text: lang === 'es' ? 'No pude conectar con tu cuenta de OKX. Verifica la configuración.' : 'Could not connect to your OKX account. Check configuration.', timestamp: Date.now() }]);
        }
      } catch { setMessages(prev => [...prev, { id: uid(), role: 'advisor', text: 'Error fetching balance', timestamp: Date.now() }]); }
      setIsProcessing(false);
      return;
    }

    // ========================
    // PRICE QUERY — specific token(s) (short direct commands only)
    // ========================
    if (intent === 'price') {
      const targetTokens = tokens.length > 0 ? tokens : ['BTC-USDT'];
      setIsProcessing(true);
      try {
        const cards = await getPriceCards(targetTokens);
        const names = cards.map(c => c.symbol).join(', ');
        const isUp = cards.length > 0 && cards[0].change24h >= 0;
        const priceFn = t('priceSingle') as (sym: string, price: string, up: boolean, change: string) => string;
        const multiPriceFn = t('priceMulti') as (names: string) => string;
        const priceText = cards.length === 1
          ? priceFn(cards[0].symbol, fmtPrice(cards[0].price), isUp, Math.abs(cards[0].change24h).toFixed(2))
          : multiPriceFn(names);
        setMessages(prev => [...prev, {
          id: uid(), role: 'advisor', timestamp: Date.now(),
          text: priceText,
          prices: cards,
        }]);
        speakIfEnabled(priceText);
      } catch (err) {
        setMessages(prev => [...prev, {
          id: uid(), role: 'advisor', timestamp: Date.now(),
          text: (t('priceError') as (err: string) => string)(err instanceof Error ? err.message : 'network error'),
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
          text: (t('marketOverview') as (sym: string, change: string) => string)(top.symbol, `${top.change24h > 0 ? '+' : ''}${top.change24h.toFixed(2)}`),
          prices: cards,
        }]);
      } catch {
        setMessages(prev => [...prev, {
          id: uid(), role: 'advisor', timestamp: Date.now(),
          text: t('marketError') as string,
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
          text: (t('trending') as (movers: string) => string)(movers),
          prices: cards,
        }]);
      } catch {
        setMessages(prev => [...prev, {
          id: uid(), role: 'advisor', timestamp: Date.now(),
          text: t('trendingError') as string,
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
          text: t('connectWallet') as string,
        }]);
      } else {
        const walletFn = t('walletConnected') as (addr: string) => string;
        setMessages(prev => [...prev, {
          id: uid(), role: 'advisor', timestamp: Date.now(),
          text: walletFn(`${address.slice(0, 6)}...${address.slice(-4)}`),
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
        text: t('help') as string,
      }]);
      return;
    }

    // ========================
    // ANALYZE MARKET — full agent cycle
    // ========================
    if (intent === 'analyze') {
      setIsProcessing(true);
      setAnalysisPhases([]);
      startThinkingSound(); // ambient hum while analyzing

      // Bobby announces the full scan — ElevenLabs voice for consistency
      if (voiceEnabled) {
        const analyzeFillers = t('analyzeFillers') as readonly string[];
        queueSentence(analyzeFillers[Math.floor(Math.random() * analyzeFillers.length)], 'cio', lang);
      }
      phaseTimerRef.current.forEach(clearTimeout);
      phaseTimerRef.current = [];

      const phases = t('phases') as Array<{ text: string; delay: number }>;
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
        stopThinkingSound();

        if (data.ok) {
          const trades: TradeExecution[] = (data.trades || [])
            .filter((t: any) => t.execution)
            .map((t: any) => ({
              tokenSymbol: t.tokenSymbol, amountUsd: t.amountUsd,
              confidence: t.confidence || 0, sizingMethod: t.sizingMethod || 'half-kelly',
              chain: t.chain || '196', execution: t.execution,
            }));

          // Build a summary from the response
          const summaryFn = t('scanSummary') as (time: string, found: number, filtered: number, trades: number, usd: string | null) => string;
          const summary = summaryFn(
            ((data.cycle?.latency_ms || 0) / 1000).toFixed(1),
            data.cycle?.signals_found || 0,
            data.cycle?.signals_filtered || 0,
            data.cycle?.trades_executed || 0,
            data.cycle?.total_usd_deployed ? data.cycle.total_usd_deployed.toFixed(2) : null,
          );

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

          const msgId = uid();
          pendingMsgIdRef.current = msgId;

          // Build extras to attach when all blocks are revealed
          const extras: Partial<ChatMsg> = {};
          if (trades.length > 0) extras.trades = trades;
          if (data.debate?.alphaView || data.debate?.redTeamView || data.debate?.judgeVerdict) {
            extras.debate = {
              alphaView: data.debate.alphaView || '',
              redTeamView: data.debate.redTeamView || '',
              judgeVerdict: data.debate.judgeVerdict || '',
              selfOptimized: data.debate.selfOptimized,
              sizingMethod: data.debate.sizingMethod,
            };
          }
          if (data.metacognition) extras.metacognition = data.metacognition;
          if (data.topSignals) extras.topSignals = data.topSignals;
          if (data.polymarket) extras.polymarket = data.polymarket;
          pendingExtrasRef.current = extras;

          // Split analysis into paragraphs for block-by-block reveal
          const blocks = greetingText.split(/\n\n+/).filter((b: string) => b.trim().length > 0);

          // Add empty message shell
          setMessages(prev => [...prev, {
            id: msgId, role: 'advisor', timestamp: Date.now(),
            text: '', isLive: true,
          }]);

          if (blocks.length <= 1) {
            // Short response — just show it all
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: greetingText, ...extras } : m));
            speakIfEnabled(greetingText);
          } else {
            // Multi-block: show first block immediately, queue the rest
            const [firstBlock, ...restBlocks] = blocks;
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: firstBlock } : m));
            speakIfEnabled(firstBlock);
            setPendingBlocks(restBlocks);
            setAwaitingContinue(true);
          }
        } else {
          // API returned ok:false — still show what we got
          const reason = data.cycle?.llm_reasoning || data.error || (lang === 'es' ? 'Sin señales accionables este ciclo.' : 'No actionable signals this cycle.');
          const noTradeFn = t('noTrades') as (reason: string) => string;
          const noTradeText = noTradeFn(reason);
          setMessages(prev => [...prev, {
            id: uid(), role: 'advisor', timestamp: Date.now(),
            text: noTradeText,
          }]);
          speakIfEnabled(noTradeText);
        }
      } catch (err) {
        phaseTimerRef.current.forEach(clearTimeout);
        phaseTimerRef.current = [];
        setAnalysisPhases([]);
        stopThinkingSound();

        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        setMessages(prev => [...prev, {
          id: uid(), role: 'advisor', timestamp: Date.now(),
          text: isAbort
            ? t('timeout') as string
            : (t('analysisError') as (err: string) => string)(err instanceof Error ? err.message : 'Unknown error'),
        }]);
      }
      setIsProcessing(false);
      return;
    }

    // ========================
    // CONVERSATIONAL AI — Bobby's brain via OpenClaw
    // If user mentions tokens, fetch live data in parallel for context
    // ========================
    setIsProcessing(true);
    clearResponseAudio(); // Reset voice note accumulator for new response
    startThinkingSound(); // ambient hum while thinking

    // Voice filler — Bobby "thinks out loud" while intelligence loads
    // Uses ElevenLabs (not Web Speech) so Bobby's voice is consistent
    if (voiceEnabled) {
      const fillers = t('chatFillers') as readonly string[];
      const filler = fillers[Math.floor(Math.random() * fillers.length)];
      queueSentence(filler, 'cio', lang);
    }

    // ---- Autonomous Reasoning: Bobby decides what data to fetch based on the question ----
    // The key insight: Bobby should ALWAYS have real data when giving opinions.
    // A CIO doesn't guess — they look at the terminal first.
    const needsOKX = /\b(btc|eth|sol|bitcoin|ethereum|solana|crypto|market|precio|price|whale|trade|trading|bull|bear|oro|gold|silver|plata|mercado|dex|defi|token|coin|nft|xaut|paxg|okb|matic|subir|bajar|pump|dump|long|short)\b/i.test(msg);
    const needsPoly = /\b(trump|biden|election|politic|war|recession|fed|rate|inflation|regulat|sec|congress|senate|law|ban|approve|etf|macro|econom|geopolit|president|gobierno|guerra|recesi[oó]n|inflaci[oó]n|elecciones?|pol[ií]tic|tariff|arancel|china|rusia|iran)\b/i.test(msg);
    const isGeneralOpinion = /\b(opin|piens|crees|think|semana|week|month|mes|futuro|future|outlook|pronos|predict|forecast|esta semana|this week|próxim[oa]|next|an[aá]lisis|analysis|qué har[ií]as|what would|cómo ves|how do you see|va a|will .* go|mercado va|market going|amanec|hoy|today|morning|ayer|yesterday|tonight|noche)\b/i.test(msg);
    const hasTokens = tokens.length > 0;
    // General market questions without specific tokens → show BTC/ETH/SOL as default context
    const isGeneralMarket = !hasTokens && (needsOKX || isGeneralOpinion) && /\b(market|mercado|crypto|cripto|amanec|hoy|today|morning|overview|resumen)\b/i.test(msg);

    // Detect stocks in the message
    const stocks = detectStocks(msg);
    const hasStocks = stocks.length > 0;

    // Bobby ALWAYS fetches intel for anything beyond casual chat
    const fetchIntel = needsOKX || needsPoly || isGeneralOpinion || hasTokens || hasStocks;
    const contextPricesPromise = (hasTokens || isGeneralMarket) ? getPriceCards(hasTokens ? tokens : ['BTC', 'ETH', 'SOL']).catch(() => []) : Promise.resolve([]);
    const stockPricesPromise = hasStocks ? fetchStockPrices(stocks).catch(() => []) : Promise.resolve([]);
    const intelPromise = fetchIntel
      ? fetch('/api/bobby-intel').then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null);
    // Technical analysis for the primary token mentioned
    const taSymbol = hasTokens ? tokens[0].split('-')[0] : (isGeneralMarket || tradingRoom || needsOKX || isGeneralOpinion ? 'BTC' : null);
    const taPromise = taSymbol
      ? fetch(`/api/technical-analysis?symbol=${taSymbol}`).then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null);

    try {
      // Enrich the message with intelligence context — Bobby reasons about what data to include
      let enrichedMessage = msg;
      let taData: any = null;
      try {
        // Promise.allSettled: partial failures don't kill the entire context
        const [pricesResult, stocksResult, intelResult, taResult] = await Promise.allSettled([contextPricesPromise, stockPricesPromise, intelPromise, taPromise]);
        const contextPrices = pricesResult.status === 'fulfilled' ? pricesResult.value : [];
        const stockQuotes = stocksResult.status === 'fulfilled' ? stocksResult.value : [];
        const intel = intelResult.status === 'fulfilled' ? intelResult.value : null;
        taData = taResult.status === 'fulfilled' ? taResult.value : null;

        if (pricesResult.status === 'rejected') console.warn('[Bobby] price fetch failed:', pricesResult.reason);
        if (stocksResult.status === 'rejected') console.warn('[Bobby] stock fetch failed:', stocksResult.reason);
        if (intelResult.status === 'rejected') console.warn('[Bobby] intel fetch failed:', intelResult.reason);
        if (taResult.status === 'rejected') console.warn('[Bobby] TA fetch failed:', taResult.reason);

        const contextBlocks: string[] = [];

        // ---- XML-tagged structured briefing (Vance strategy) ----
        if (fetchIntel) {
          const sources: string[] = [];
          if (needsOKX || hasTokens) sources.push('OKX OnchainOS');
          if (needsPoly) sources.push('Polymarket');
          if (hasStocks) sources.push('Yahoo Finance');
          if (isGeneralOpinion && !needsOKX && !needsPoly && !hasStocks) sources.push('OKX + Polymarket');
          contextBlocks.push(`<REASONING sources="${sources.join(', ')}">Use ALL live data below. Cite specific numbers, whale flows, consensus %. Cross-reference when multiple sources available.</REASONING>`);
        }

        // Inject stock data as structured XML
        if (stockQuotes.length > 0) {
          const stockJson = stockQuotes.map(s => ({
            symbol: s.symbol, name: s.name, price: s.price,
            change_pct: s.change24h, high: s.dayHigh, low: s.dayLow,
            volume_M: parseFloat((s.volume / 1e6).toFixed(1)),
          }));
          contextBlocks.push(`<STOCK_INTEL>\n${JSON.stringify(stockJson)}\n</STOCK_INTEL>`);
        }

        // Inject the full intelligence briefing (already contains OKX + Polymarket data)
        // Codex P2: sanitize upstream strings to prevent prompt injection
        if (intel?.briefing) {
          const sanitizedBriefing = intel.briefing
            .replace(/\*\*\s*(ALPHA\s*HUNTER|RED\s*TEAM|MY\s*VERDICT)\s*:?\s*\*\*/gi, '[data]') // Strip agent markers
            .replace(/<\/?(?:system|user|assistant|human|instructions?|prompt)[^>]*>/gi, '[data]') // Strip injection tags
            .replace(/(?:ignore|disregard|forget)\s+(?:all|previous|above)\s+(?:instructions?|rules?|prompts?)/gi, '[data]') // Strip override attempts
            .replace(/you\s+are\s+now\s+/gi, '[data]') // Strip persona hijack
            .slice(0, 15000); // Cap length to prevent context flooding
          contextBlocks.push(`<ONCHAIN_INTEL>\n${sanitizedBriefing}\n</ONCHAIN_INTEL>`);
        }

        // Inject live crypto prices as structured XML
        if (contextPrices.length > 0) {
          const priceJson = contextPrices.map(p => ({
            symbol: p.symbol, price: p.price,
            change_24h_pct: parseFloat(p.change24h.toFixed(2)),
            volume: p.vol24h,
            ...(p.funding ? { funding_rate: parseFloat((p.funding.rate * 100).toFixed(4)), funding_apr: parseFloat(p.funding.annualized.toFixed(1)) } : {}),
          }));
          contextBlocks.push(`<PRICE_INTEL>\n${JSON.stringify(priceJson)}\n</PRICE_INTEL>`);
        }

        // Technical analysis (SMA, RSI, Bollinger, support/resistance)
        if (taData?.summary) {
          contextBlocks.push(`<TECHNICAL_ANALYSIS>\n${JSON.stringify(taData.summary)}\n</TECHNICAL_ANALYSIS>`);

          // Gemini: TA as binary multiplier for conviction
          const ta = taData.summary;
          if (ta.bollinger_squeeze && ta.macd_crossover === 'BULLISH_CROSS' && ta.price > ta.sma50) {
            contextBlocks.push(`<TA_BOOST>1.10 — Bollinger squeeze + MACD bullish cross + price above SMA50. Directional confirmation.</TA_BOOST>`);
          } else if (ta.rsi > 80 || ta.rsi < 20) {
            contextBlocks.push(`<TA_PENALTY>0.90 — RSI extreme (${ta.rsi}). Overextension risk.</TA_PENALTY>`);
          }
        }

        // Gemini: Temporal memory — inject last 5 debate summaries for coherence
        // Bobby needs to know what he said recently to avoid contradictions
        try {
          const SB_URL = import.meta.env.VITE_SUPABASE_URL;
          const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
          if (SB_URL && SB_KEY) {
            const recentRes = await fetch(
              `${SB_URL}/rest/v1/forum_threads?select=topic,symbol,direction,conviction_score,created_at,status&order=created_at.desc&limit=5`,
              { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
            );
            if (recentRes.ok) {
              const recentThreads = await recentRes.json();
              if (recentThreads.length > 0) {
                const memoryLines = recentThreads.map((t: any) => {
                  const ago = Math.round((Date.now() - new Date(t.created_at).getTime()) / 3600000);
                  return `${ago}h ago: ${t.direction?.toUpperCase() || '?'} ${t.symbol || '?'} — conviction ${(t.conviction_score * 10)?.toFixed(0) || '?'}/10 — ${t.status || 'pending'}`;
                });
                contextBlocks.push(`<RECENT_DECISIONS>\n${memoryLines.join('\n')}\n</RECENT_DECISIONS>`);
              }
            }
          }
        } catch { /* temporal memory is best-effort */ }

        if (contextBlocks.length > 0) {
          enrichedMessage = `${msg}\n\n${contextBlocks.join('\n\n')}`;
          console.log(`[Bobby] ✅ Enriched with ${contextBlocks.length} XML blocks (${enrichedMessage.length} chars)`);
        } else {
          console.warn('[Bobby] ⚠️ No XML blocks generated. fetchIntel:', fetchIntel, 'intel:', !!intel, 'briefing:', !!intel?.briefing, 'prices:', contextPrices.length, 'stocks:', stockQuotes.length);
        }
      } catch (err) { console.warn('[Bobby] ❌ context enrichment failed:', err); }

      // Episodic Memory: inject Bobby's track record from forum
      try {
        const memRes = await fetch(`${SB_URL}/rest/v1/forum_threads?resolution=neq.pending&resolution=not.is.null&select=symbol,direction,conviction_score,resolution,resolution_pnl_pct&order=resolved_at.desc&limit=5`,
          { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
        if (memRes.ok) {
          const memory = await memRes.json() as Array<{ symbol: string; direction: string; conviction_score: number; resolution: string; resolution_pnl_pct: number }>;
          if (memory.length > 0) {
            const wins = memory.filter(m => m.resolution === 'win').length;
            const total = memory.length;
            const calls = memory.map(m => `${m.direction?.toUpperCase()} ${m.symbol}: ${m.resolution?.toUpperCase()} (${m.resolution_pnl_pct > 0 ? '+' : ''}${m.resolution_pnl_pct}%, conviction was ${Math.round((m.conviction_score || 0) * 10)}/10)`).join(' | ');
            enrichedMessage += `\n\n<EPISODIC_MEMORY>\nYour last ${total} resolved trades: ${calls}\nRecent win rate: ${Math.round((wins / total) * 100)}%\n${wins / total < 0.5 ? 'WARNING: You have been WRONG more than right recently. Be humble. Red Team should challenge you harder.' : wins / total > 0.8 ? 'You are on a streak but overconfidence kills. Stay sharp.' : ''}\n</EPISODIC_MEMORY>`;
          }
        }
      } catch { /* non-critical */ }

      // Trading Room mode: inject debate instruction
      if (tradingRoom) {
        enrichedMessage += '\n\n[MANDATORY TRADING ROOM DEBATE — THIS IS NOT OPTIONAL. You MUST structure your ENTIRE response as three agents. Do NOT skip any agent. Do NOT respond as just Bobby. The format MUST be:\n\n**ALPHA HUNTER:** (she pitches the bull case aggressively — 2-3 paragraphs with specific entry/stop/target and R/R ratio)\n\n**RED TEAM:** (he directly attacks Alpha\'s thesis — quotes her words and destroys them. 2-3 paragraphs. Proposes the opposite trade.)\n\n**MY VERDICT:** (Bobby CIO scores both arguments, picks a side, gives conviction X/10 with specific play)\n\nIF YOU RESPOND WITHOUT ALL THREE SECTIONS WITH THESE EXACT BOLD HEADERS, THE RESPONSE IS INVALID. Start with **ALPHA HUNTER:** immediately.]';
      }

      console.log('[Bobby] 📤 Sending to OpenClaw:', enrichedMessage.substring(0, 300), enrichedMessage.length > 300 ? `... (${enrichedMessage.length} total chars)` : '');
      const abortCtrl = new AbortController();
      const res = await fetch('/api/openclaw-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortCtrl.signal,
        body: JSON.stringify({
          message: enrichedMessage,
          language: lang,
          history: messages.slice(-10).map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.text,
          })),
        }),
      });

      if (!res.ok) throw new Error(`OpenClaw: ${res.status}`);

      // Get price cards — from token detection OR infer from question context
      let responsePrices: PriceCard[] = [];
      try {
        if (tokens.length > 0) {
          responsePrices = await contextPricesPromise;
        } else {
          // Infer relevant tokens from the question text for price cards
          const cachedTickers = tickerCacheRef.current.length > 0
            ? tickerCacheRef.current
            : await fetchTickers().then(t => { tickerCacheRef.current = t; return t; });

          // Smart token inference: what assets is the user asking about?
          const inferredSymbols: string[] = [];
          const lm = msg.toLowerCase();
          if (/\b(oro|gold|xaut)\b/i.test(lm)) inferredSymbols.push('XAUT');
          if (/\b(plata|silver|xag)\b/i.test(lm)) inferredSymbols.push('XAG');
          if (/\b(btc|bitcoin)\b/i.test(lm)) inferredSymbols.push('BTC');
          if (/\b(eth|ethereum)\b/i.test(lm)) inferredSymbols.push('ETH');
          if (/\b(sol|solana)\b/i.test(lm)) inferredSymbols.push('SOL');
          if (/\b(okb)\b/i.test(lm)) inferredSymbols.push('OKB');

          // If we inferred specific assets, show those. Otherwise show top 3.
          const symbolsToShow = inferredSymbols.length > 0 ? inferredSymbols : ['BTC', 'ETH', 'SOL'];
          responsePrices = symbolsToShow
            .map(s => cachedTickers.find(t => t.symbol === s))
            .filter(Boolean)
            .map(t => ({
              symbol: t!.symbol, price: t!.last, change24h: t!.change24h,
              high24h: t!.high24h, low24h: t!.low24h, vol24h: t!.vol24h, funding: t!.funding,
            }));
        }

        // Add stock price cards — stocks detected in the question get visual cards too
        if (hasStocks) {
          try {
            const stockQuotesForCards = await stockPricesPromise;
            for (const sq of stockQuotesForCards) {
              responsePrices.push({
                symbol: sq.symbol,
                price: sq.price,
                change24h: sq.change24h,
                high24h: sq.dayHigh,
                low24h: sq.dayLow,
                vol24h: sq.volume,
                funding: null,
              });
            }
          } catch (err) { console.warn('[Bobby] stock cards failed:', err); }
        }
      } catch (err) { console.warn('[Bobby] price cards failed:', err); }

      // Try to parse SSE stream
      stopThinkingSound(); // stop hum once response arrives
      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let fullText = '';
        const replyId = uid();

        // ---- Sentence-level TTS streaming ----
        // Extract sentences as they complete in the stream.
        // Fire each to ElevenLabs immediately → Bobby speaks first sentence
        // while the rest of the response is still generating.
        // Cuts perceived latency from ~12s to ~2s.
        let sentenceBuffer = '';
        const sentenceSplitter = /(?<=[.!?])\s+|(?<=\n\n)/;

        // Detect which agent is speaking based on section headers (not inline mentions)
        // Only match markers that appear as headers: after newline or at start, with ** bold **
        let currentVoice: string = 'cio';
        const detectAgent = (text: string) => {
          // Match ONLY section headers like "**ALPHA HUNTER:**" — not inline mentions like "Red Team's concerns"
          const headerPattern = /\*\*\s*(ALPHA\s*HUNTER|RED\s*TEAM|MY\s*VERDICT|MI\s*VEREDICTO)\s*:?\s*\*\*/gi;
          let lastIdx = -1;
          let lastAgent: 'alpha' | 'redteam' | 'cio' = 'cio';
          let match: RegExpExecArray | null;
          headerPattern.lastIndex = 0;
          while ((match = headerPattern.exec(text)) !== null) {
            if (match.index > lastIdx) {
              lastIdx = match.index;
              const label = match[1].toLowerCase().replace(/\s+/g, '');
              if (label.includes('alpha')) lastAgent = 'alpha';
              else if (label.includes('red')) lastAgent = 'redteam';
              else lastAgent = 'cio';
            }
          }
          if (lastIdx >= 0 && lastAgent !== currentVoice) {
            currentVoice = lastAgent;
            setActiveAgent(lastAgent);
          }
        };

        const feedSentenceStream = (delta: string) => {
          if (!voiceEnabled) return;
          sentenceBuffer += delta;
          // Extract complete sentences
          const parts = sentenceBuffer.split(sentenceSplitter);
          if (parts.length > 1) {
            // All but last are complete sentences
            for (let i = 0; i < parts.length - 1; i++) {
              const sentence = parts[i].trim();
              if (sentence.length >= 8) {
                // Pass current agent voice to TTS — each sentence uses the right voice
                queueSentence(sentence, currentVoice, lang);
              }
            }
            sentenceBuffer = parts[parts.length - 1];
          }
        };

        // Add empty advisor message — price cards will appear mid-speech
        setMessages(prev => [...prev, {
          id: replyId, role: 'advisor', timestamp: Date.now(),
          text: '', isLive: false,
        }]);

        // Scroll to top so user sees Bobby's response from the start
        // Multiple attempts to ensure it sticks after React re-renders
        const scrollToStage = () => { if (scrollRef.current) scrollRef.current.scrollTop = 0; };
        requestAnimationFrame(scrollToStage);
        setTimeout(scrollToStage, 100);
        setTimeout(scrollToStage, 300);

        // Price cards + TA chart appear 1.5s later — WHILE Bobby is speaking
        if (responsePrices.length > 0 || taData) {
          setTimeout(() => {
            setMessages(prev => prev.map(m =>
              m.id === replyId ? {
                ...m,
                ...(responsePrices.length > 0 ? { prices: responsePrices } : {}),
                ...(taData ? { technicalAnalysis: taData } : {}),
              } : m
            ));
          }, 1500);
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });

          // Parse SSE data lines
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullText += delta;
                // Detect agent voice transitions in real-time
                detectAgent(fullText);
                setMessages(prev => prev.map(m =>
                  m.id === replyId ? { ...m, text: fullText } : m
                ));
                // Keep scroll at top for the first 3 seconds of streaming
                // After that, user controls scroll
                if (scrollRef.current && fullText.length < 500) {
                  scrollRef.current.scrollTop = 0;
                }
                // Sentence-level voice: fire each sentence to TTS as it completes
                feedSentenceStream(delta);
                // Keyword-to-UI: scan as text flows in
                scanAndHighlight(delta);
              }
            } catch { /* skip non-JSON SSE lines (e.g. empty lines, comments) */ }
          }
        }

        // Flush remaining sentence buffer to voice
        if (voiceEnabled && sentenceBuffer.trim().length >= 8) {
          queueSentence(sentenceBuffer.trim(), currentVoice, lang);
        }
        flushQueue();
        // Reset agent mood after response completes
        setTimeout(() => setActiveAgent(null), 2000);

        // Auto-publish debate to forum (if Trading Room mode + debate markers present)
        if (tradingRoom && fullText.includes('**ALPHA HUNTER:**') && fullText.includes('**RED TEAM:**')) {
          try {
            // Parse sections
            const sectionRx = /\*\*\s*(ALPHA\s*HUNTER|RED\s*TEAM|MY\s*VERDICT|MI\s*VEREDICTO)\s*:?\s*\*\*:?\s*/gi;
            const sectionMatches: Array<{ idx: number; end: number; agent: string }> = [];
            let sm: RegExpExecArray | null;
            sectionRx.lastIndex = 0;
            while ((sm = sectionRx.exec(fullText)) !== null) {
              const label = sm[1].toLowerCase().replace(/\s+/g, '');
              sectionMatches.push({ idx: sm.index, end: sm.index + sm[0].length, agent: label.includes('alpha') ? 'alpha' : label.includes('red') ? 'redteam' : 'cio' });
            }
            if (sectionMatches.length >= 2) {
              const posts: Array<{ agent: string; content: string }> = [];
              for (let si = 0; si < sectionMatches.length; si++) {
                const start = sectionMatches[si].end;
                const end = si + 1 < sectionMatches.length ? sectionMatches[si + 1].idx : fullText.length;
                posts.push({ agent: sectionMatches[si].agent, content: fullText.slice(start, end).trim() });
              }
              // Extract topic from user message
              const topic = msg.length > 60 ? msg.slice(0, 60) + '...' : msg;
              // Conviction from CIO post
              const cioContent = posts.find(p => p.agent === 'cio')?.content || '';
              const convM = cioContent.match(/(\d+)\s*\/\s*10/);
              const convScore = convM ? parseInt(convM[1]) / 10 : null;

              // Extract trading parameters from Bobby's CIO text
              const entryMatch = cioContent.match(/(?:entry|entr[ao]|buy(?:ing)?|short(?:ear)?|comprar?)\s+(?:\w+\s+)*?(?:en|at|a)\s*\$?([\d,]+(?:\.\d+)?)/i)
                || cioContent.match(/(?:en|at)\s*\$?([\d,]+(?:\.\d+)?)\s*[-–]\s*\$?([\d,]+)/i);
              const stopMatch = cioContent.match(/stop\s*(?:loss)?\s*(?:\w+\s+)*?(?:en|at|a|in)?\s*\$?([\d,]+(?:\.\d+)?)/i);
              const targetMatch = cioContent.match(/target\s*(?:\w+\s+)*?(?:en|at|a|in)?\s*\$?([\d,]+(?:\.\d+)?)/i)
                || cioContent.match(/(?:objetivo|soporte\s+real)\s*(?:\w+\s+)*?(?:en|at|a|in)?\s*\$?([\d,]+(?:\.\d+)?)/i);
              const dirMatch = cioContent.match(/\b(long|short(?:ear)?|comprar?|vender?)\b/i);
              const symMatch = msg.match(/\b(BTC|ETH|SOL|HYPE|XRP|UNI|MATIC|DOGE|AVAX|LINK|DOT|ADA|ATOM|ARB|OP)\b/i)
                || cioContent.match(/\b(BTC|ETH|SOL|HYPE|XRP)\b/);

              const entryPrice = entryMatch ? parseFloat((entryMatch[2] || entryMatch[1]).replace(/,/g, '')) : null;
              const stopPrice = stopMatch ? parseFloat(stopMatch[1].replace(/,/g, '')) : null;
              const targetPrice = targetMatch ? parseFloat(targetMatch[1].replace(/,/g, '')) : null;
              const direction = dirMatch ? (/short|vender/i.test(dirMatch[1]) ? 'short' : 'long') : null;
              const symbol = symMatch ? symMatch[1].toUpperCase() : null;

              // Codex P1: FAIL-CLOSED — only persist if ALL structured fields are present
              // Malformed or creative LLM responses should NOT poison forum history
              if (!convScore || !symbol || !entryPrice || !direction) {
                console.warn('[Bobby] ⚠️ Debate not published — missing structured fields:', {
                  convScore, symbol, entryPrice, direction,
                });
              } else {
              const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

              const threadRes = await fetch(`${SB_URL}/rest/v1/forum_threads`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'return=representation' },
                body: JSON.stringify({
                  topic, trigger_reason: 'User debate in Bobby Chat', language: lang,
                  conviction_score: convScore, price_at_creation: {},
                  symbol, direction, entry_price: entryPrice, stop_price: stopPrice,
                  target_price: targetPrice, expires_at: expiresAt,
                }),
              });
              if (threadRes.ok) {
                const threadData = await threadRes.json();
                const threadId = threadData[0]?.id;
                if (threadId) {
                  // Insert posts
                  for (const post of posts) {
                    await fetch(`${SB_URL}/rest/v1/forum_posts`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
                      body: JSON.stringify({ thread_id: threadId, agent: post.agent, content: post.content, data_snapshot: {} }),
                    });
                  }
                  console.log('[Bobby] ✅ Debate published to forum:', threadId);
                }
              }
              } // end of fail-closed else block
            }
          } catch (forumErr) { console.warn('[Bobby] Forum publish failed:', forumErr); }
        }

        // ── AUTO-EXECUTE: If mode is 'auto' and Bobby recommended a trade with conviction >= 5/10 ──
        console.log(`[Bobby] Auto-execute check: tradingMode=${tradingMode}, tradingRoom=${tradingRoom}, hasText=${!!fullText}, textLen=${fullText.length}`);
        if (tradingMode === 'auto' && tradingRoom && fullText) {
          try {
            const convMatch = fullText.match(/(\d+)\s*\/\s*10/);
            const conv = convMatch ? parseInt(convMatch[1]) : 0;
            const symMatch = fullText.match(/\b(BTC|ETH|SOL|OKB|XRP|AVAX|LINK|DOGE)\b/i);
            const dirMatch = fullText.match(/\b(long|short|comprar?|vender?)\b/i);
            // Check if user specified leverage/amount in their message
            const leverageMatch = msg.match(/(\d+)\s*[xX]/);
            const amountMatch = msg.match(/(\d+)\s*(?:usdt|usd|dólares|dollars)/i);

            console.log(`[Bobby] Auto-execute parse: conv=${conv}, symbol=${symMatch?.[1]}, direction=${dirMatch?.[1]}, leverage=${leverageMatch?.[1]}, amount=${amountMatch?.[1]}`);
            if (conv >= 5 && symMatch && dirMatch) {
              const symbol = symMatch[1].toUpperCase();
              const direction = /short|vender/i.test(dirMatch[1]) ? 'short' : 'long';
              const leverage = leverageMatch ? parseInt(leverageMatch[1]) : (conv >= 8 ? 10 : conv >= 6 ? 5 : 3);
              const amount = amountMatch ? parseFloat(amountMatch[1]) : (leverage >= 10 ? 3 : leverage >= 5 ? 5 : 8);

              console.log(`[Bobby] 🤖 AUTO-EXECUTE: ${direction.toUpperCase()} ${symbol} ${leverage}x — conviction ${conv}/10`);

              // Play execution sound
              try {
                const audioCtx = new AudioContext();
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.frequency.setValueAtTime(880, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.1);
                gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.3);
              } catch {}

              // Bobby announces the execution with his voice
              const execAnnouncement = lang === 'es'
                ? `Ejecutando ${direction === 'long' ? 'Long' : 'Short'} ${symbol} ${leverage}x. Convicción ${conv} de diez.`
                : `Executing ${direction === 'long' ? 'Long' : 'Short'} ${symbol} ${leverage}x. Conviction ${conv} out of ten.`;
              queueSentence(execAnnouncement, 'cio', lang);

              setMessages(prev => [...prev, {
                id: uid(), role: 'advisor', timestamp: Date.now(),
                text: lang === 'es'
                  ? `🤖 **Ejecutando automáticamente...** ${direction.toUpperCase()} ${symbol} ${leverage}x — Convicción ${conv}/10`
                  : `🤖 **Auto-executing...** ${direction.toUpperCase()} ${symbol} ${leverage}x — Conviction ${conv}/10`,
              }]);

              const execRes = await fetch('/api/okx-perps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'open_position',
                  params: { symbol, direction, leverage, amount, mode: 'live' },
                }),
              });
              const execData = await execRes.json();

              if (execData.ok) {
                // Success sound — ascending tone
                try {
                  const audioCtx = new AudioContext();
                  const osc = audioCtx.createOscillator();
                  const gain = audioCtx.createGain();
                  osc.connect(gain);
                  gain.connect(audioCtx.destination);
                  osc.frequency.setValueAtTime(523, audioCtx.currentTime);
                  osc.frequency.exponentialRampToValueAtTime(1047, audioCtx.currentTime + 0.15);
                  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
                  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
                  osc.start();
                  osc.stop(audioCtx.currentTime + 0.4);
                } catch {}

                // Bobby confirms with voice
                const confirmText = lang === 'es'
                  ? `Operación confirmada. ${direction === 'long' ? 'Long' : 'Short'} ${symbol} ${execData.leverage} a ${execData.markPrice?.toLocaleString()} dólares. El trade está vivo.`
                  : `Trade confirmed. ${direction === 'long' ? 'Long' : 'Short'} ${symbol} ${execData.leverage} at ${execData.markPrice?.toLocaleString()} dollars. The trade is live.`;
                queueSentence(confirmText, 'cio', lang);

                setMessages(prev => [...prev, {
                  id: uid(), role: 'advisor', timestamp: Date.now(),
                  text: lang === 'es'
                    ? `✅ **Operación confirmada: ${direction.toUpperCase()} ${symbol} ${execData.leverage}**\n\n📍 Entry: $${execData.markPrice?.toLocaleString()}\n💰 Margin: ${execData.margin}\n📊 Exposición: ${execData.notional}\n📐 Tamaño: ${execData.size}\n🔗 Order: ${execData.orderId}\n\n_Registrado on-chain en X Layer_`
                    : `✅ **Trade confirmed: ${direction.toUpperCase()} ${symbol} ${execData.leverage}**\n\n📍 Entry: $${execData.markPrice?.toLocaleString()}\n💰 Margin: ${execData.margin}\n📊 Notional: ${execData.notional}\n📐 Size: ${execData.size}\n🔗 Order: ${execData.orderId}\n\n_Recorded on-chain on X Layer_`,
                }]);
              } else {
                setMessages(prev => [...prev, {
                  id: uid(), role: 'advisor', timestamp: Date.now(),
                  text: lang === 'es'
                    ? `❌ **No se pudo ejecutar:** ${execData.error}`
                    : `❌ **Execution failed:** ${execData.error}`,
                }]);
              }
            } else if (conv > 0 && conv < 5) {
              setMessages(prev => [...prev, {
                id: uid(), role: 'advisor', timestamp: Date.now(),
                text: lang === 'es'
                  ? `🛑 **No ejecuto.** Convicción ${conv}/10 — demasiado baja para auto-ejecutar. Mínimo 5/10.`
                  : `🛑 **Not executing.** Conviction ${conv}/10 — too low for auto-execution. Minimum 5/10.`,
              }]);
            }
          } catch (autoErr) { console.warn('[Bobby] Auto-execute failed:', autoErr); }
        }

        // If we got no text from stream, set a fallback
        if (!fullText) {
          setMessages(prev => prev.map(m =>
            m.id === replyId ? { ...m, text: (t('streamFallback') as (m: string) => string)(msg) } : m
          ));
        }
      } else {
        // Non-streaming fallback
        const data = await res.json();
        setMessages(prev => [...prev, {
          id: uid(), role: 'advisor', timestamp: Date.now(),
          text: data.choices?.[0]?.message?.content || (t('noData') as (m: string) => string)(msg),
          prices: responsePrices.length > 0 ? responsePrices : undefined,
        }]);
      }
    } catch (err) {
      // AbortController cancellation — component unmounted or user navigated away
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.log('[Bobby] Stream aborted (user navigated away or component unmounted)');
        stopThinkingSound();
        return;
      }
      console.error('[Bobby] chat handler error:', err);
      stopThinkingSound();
      // OpenClaw unavailable — fallback with prices if available
      let fallbackPrices: PriceCard[] = [];
      try { fallbackPrices = await contextPricesPromise; } catch { /* prices also failed */ }
      setMessages(prev => [...prev, {
        id: uid(), role: 'advisor', timestamp: Date.now(),
        text: fallbackPrices.length > 0
          ? t('fallbackWithPrices') as string
          : t('fallbackNoPrices') as string,
        prices: fallbackPrices.length > 0 ? fallbackPrices : undefined,
      }]);
    }
    setIsProcessing(false);

  }, [inputText, isProcessing, profile?.walletAddress, address, advisorName, speakIfEnabled, speakFillerLocal, scanAndHighlight, startThinkingSound, stopThinkingSound, stopVoice, typewriterText, lang, t, voiceEnabled, queueSentence, flushQueue, clearResponseAudio]);

  // Keep ref in sync for speech recognition callback
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  // ---- Share voice note ----
  const shareVoiceNote = useCallback(async () => {
    const blob = getLastResponseAudio();
    if (!blob) return;

    // Smart filename: include topic from last user message + date
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const topic = lastUserMsg?.text?.slice(0, 40).replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'market';
    const date = new Date().toISOString().slice(0, 10);
    const fileName = `bobby-${topic}-${date}.mp3`;

    const file = new File([blob], fileName, { type: 'audio/mpeg' });

    // Web Share API (native share sheet on mobile — WhatsApp, Telegram, etc.)
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          title: 'Bobby Agent Trader',
          text: lang === 'es' ? 'Escucha lo que dice Bobby sobre el mercado 🎙️' : lang === 'pt' ? 'Ouça o que Bobby diz sobre o mercado 🎙️' : "Listen to Bobby's market analysis 🎙️",
          files: [file],
        });
        return;
      } catch { /* user cancelled or share failed — fall through to download */ }
    }

    // Fallback: direct download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [getLastResponseAudio, lang, messages]);

  // ---- Orb state + multi-agent mood ----
  const [activeAgent, setActiveAgent] = useState<'alpha' | 'redteam' | 'cio' | null>(null);
  const orbState: OrbState = isListening ? 'listening' : isSpeaking ? 'speaking' : isProcessing ? 'thinking' : 'idle';
  const orbMood = activeAgent || 'confident';

  // Get the latest advisor message for the "stage" display
  const latestAdvisor = [...messages].reverse().find(m => m.role === 'advisor');
  const latestUser = [...messages].reverse().find(m => m.role === 'user');

  return (
    <div className="h-full text-white flex flex-col overflow-hidden" style={{ background: '#050505' }}>
      {/* Step 1: Trading Mode Selection (first thing user sees) */}
      {!tradingMode && <TradingModeSelector onSelect={(mode) => {
        setTradingMode(mode);
        // Skip AdvisorSetup for the demo — go straight to chat
        setShowSetup(false);
      }} language={lang} />}

      {/* Step 2: Advisor Setup (only if trading mode already selected AND needed) */}
      {tradingMode && showSetup && <AdvisorSetup onComplete={handleSetupComplete} />}

      {/* ===== CONFIRM CLEAR CHATS DIALOG ===== */}
      <AnimatePresence>
        {confirmClear && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            onClick={() => setConfirmClear(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border border-white/[0.08] p-6 max-w-sm w-full space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-2.5">
                <Trash2 className="w-4 h-4 text-red-400/80" />
                <h3 className="text-[13px] font-mono font-bold text-white/80">
                  {lang === 'es' ? 'Borrar historial de chat' : lang === 'pt' ? 'Limpar histórico de chat' : 'Clear chat history'}
                </h3>
              </div>
              <p className="text-[11px] font-mono text-white/40 leading-relaxed">
                {lang === 'es' ? 'Esto eliminará todos los mensajes de la conversación. Esta acción no se puede deshacer.'
                  : lang === 'pt' ? 'Isso excluirá todas as mensagens da conversa. Esta ação não pode ser desfeita.'
                  : 'This will delete all conversation messages. This action cannot be undone.'}
              </p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setConfirmClear(false)}
                  className="px-4 py-1.5 text-[10px] font-mono text-white/40 border border-white/[0.08] hover:text-white/60 hover:border-white/15 transition-colors">
                  {lang === 'es' ? 'CANCELAR' : lang === 'pt' ? 'CANCELAR' : 'CANCEL'}
                </button>
                <button onClick={clearChats}
                  className="px-4 py-1.5 text-[10px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors">
                  {lang === 'es' ? 'BORRAR TODO' : lang === 'pt' ? 'LIMPAR TUDO' : 'DELETE ALL'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Close menu when clicking outside */}
      {showMenu && <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />}

      {/* ===== MINIMAL HEADER BAR ===== */}
      <div className="flex-shrink-0 border-b border-white/[0.04]">
        <div className="max-w-4xl mx-auto px-2 sm:px-4 py-1.5 sm:py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/agentic-world" className="text-white/15 hover:text-white/40 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
            <span className="text-[12px] font-mono font-bold text-white/40 tracking-[1px]">{advisorName.toUpperCase()}</span>
            <span className="text-[8px] font-mono text-white/10 hidden sm:inline">×</span>
            <a href="https://www.okx.com" target="_blank" rel="noopener noreferrer"
              className="text-[8px] font-mono text-white/15 hover:text-white/40 transition-colors hidden sm:inline">
              OKX OnchainOS
            </a>
          </div>
          <div className="flex items-center gap-1">
            {/* Stop button — visible when speaking or processing */}
            {(isSpeaking || isProcessing) && (
              <button onClick={stopAll}
                className="p-1.5 text-red-400/70 hover:text-red-400 transition-colors animate-pulse"
                title="Stop">
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            )}
            <button onClick={toggleVoice}
              className={`p-1.5 transition-colors ${voiceEnabled ? 'text-green-400/70 hover:text-green-400' : 'text-white/15 hover:text-white/30'}`}
              title={voiceEnabled ? 'Voice ON' : 'Voice OFF'}>
              {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
            <button onClick={toggleTradingRoom}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-mono font-bold tracking-wider transition-all ${tradingRoom ? 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/30' : 'bg-white/5 text-white/30 border border-white/10 hover:text-white/50'}`}
              title={tradingRoom ? 'Trading Room ON' : 'Solo Trader'}>
              <Users className="w-3 h-3" />
              {tradingRoom ? (lang === 'es' ? 'SALA' : 'ROOM') : 'SOLO'}
            </button>
            {address ? (
              <button onClick={() => openWallet()} className="text-[10px] text-white/25 font-mono hover:text-white/50 transition-colors px-1">
                {address.slice(0, 4)}..{address.slice(-3)}
              </button>
            ) : (
              <button onClick={() => openWallet()} className="text-[10px] text-green-400/50 hover:text-green-400 transition-colors px-1 font-mono">
                Connect
              </button>
            )}
            {/* Menu button — always visible */}
            <div className="relative">
              <button onClick={() => setShowMenu(!showMenu)}
                className="p-2 text-white/50 hover:text-white/80 transition-colors">
                <MoreVertical className="w-4 h-4" />
              </button>

              {/* Dropdown menu */}
              <AnimatePresence>
                {showMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1 z-50 w-48 border border-white/[0.08] bg-[#111] backdrop-blur-xl shadow-2xl"
                  >
                    {/* Settings / Language */}
                    <button onClick={() => { setShowMenu(false); setShowSetup(true); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11px] font-mono text-white/50 hover:text-white/80 hover:bg-white/[0.04] transition-colors">
                      <Settings className="w-3.5 h-3.5" />
                      {lang === 'es' ? 'Configuración' : lang === 'pt' ? 'Configurações' : 'Settings'}
                    </button>
                    {/* Clear chats */}
                    <button onClick={() => { setShowMenu(false); setConfirmClear(true); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11px] font-mono text-white/50 hover:text-amber-400/80 hover:bg-white/[0.04] transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                      {lang === 'es' ? 'Borrar chats' : lang === 'pt' ? 'Limpar chats' : 'Clear chats'}
                    </button>
                    {/* Logout */}
                    {isAuthenticated && (
                      <button onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11px] font-mono text-white/50 hover:text-red-400/80 hover:bg-white/[0.04] transition-colors border-t border-white/[0.04]">
                        <LogOut className="w-3.5 h-3.5" />
                        {lang === 'es' ? 'Cerrar sesión' : lang === 'pt' ? 'Sair' : 'Sign out'}
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* ===== ORB — tap to talk, always visible ===== */}
      <div
        className="flex-shrink-0 flex flex-col items-center py-1.5 sm:py-4 border-b border-white/[0.02] cursor-pointer select-none"
        style={{ background: '#050505' }}
        onClick={() => {
          if (orbState === 'speaking') { stopVoice(); return; }
          if (orbState !== 'thinking') toggleListening();
        }}
      >
        <div className="sm:hidden"><VoiceOrb analyser={analyser} state={orbState} mood={orbMood} size={60} /></div>
        <div className="hidden sm:block"><VoiceOrb analyser={analyser} state={orbState} mood={orbMood} size={100} /></div>
        <span className={`text-[8px] sm:text-[9px] font-mono mt-1 sm:mt-1.5 tracking-[2px] ${
          activeAgent === 'alpha' ? 'text-green-400/60' : activeAgent === 'redteam' ? 'text-red-400/60' : activeAgent === 'cio' ? 'text-yellow-400/60' : 'text-green-400/40'
        }`}>
          {orbState === 'listening' ? (lang === 'es' ? 'TOCA PARA PARAR · ESCUCHANDO...' : 'TAP TO STOP · LISTENING...') : orbState === 'thinking' ? (lang === 'es' ? 'PROCESANDO...' : 'PROCESSING...') : orbState === 'speaking' ? (activeAgent === 'alpha' ? '🟢 ALPHA HUNTER' : activeAgent === 'redteam' ? '🔴 RED TEAM' : activeAgent === 'cio' ? '🟡 BOBBY CIO' : (lang === 'es' ? 'TOCA PARA INTERRUMPIR' : 'TAP TO INTERRUPT')) : (lang === 'es' ? 'TOCA PARA HABLAR' : 'TAP TO TALK')}
        </span>
        {/* Live market sentiment badges */}
        {marketBadge && orbState === 'idle' && (
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded-full border ${
              marketBadge.fgi <= 25 ? 'text-red-400/80 border-red-500/20 bg-red-500/5' :
              marketBadge.fgi >= 75 ? 'text-green-400/80 border-green-500/20 bg-green-500/5' :
              'text-amber-400/80 border-amber-500/20 bg-amber-500/5'
            }`}>
              FGI {marketBadge.fgi} · {marketBadge.fgiLabel}
            </span>
            <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded-full border ${
              marketBadge.dxy > 104 ? 'text-red-400/60 border-red-500/15 bg-red-500/5' :
              marketBadge.dxy < 100 ? 'text-green-400/60 border-green-500/15 bg-green-500/5' :
              'text-white/30 border-white/10 bg-white/[0.02]'
            }`}>
              DXY {marketBadge.dxy}
            </span>
          </div>
        )}
      </div>

      {/* ===== COMMAND CENTER: STAGE ===== */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col" ref={scrollRef}>
        <div className="max-w-4xl mx-auto w-full px-2 sm:px-4 flex flex-col items-center flex-1">

          {/* THINKING INDICATOR — conversational queries (no phases) */}
          <AnimatePresence>
            {isProcessing && analysisPhases.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="w-full max-w-md mb-3"
              >
                <div className="border border-green-500/10 bg-green-500/[0.03] backdrop-blur-sm px-4 py-3 flex items-center gap-3">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-[10px] font-mono text-green-400/60">
                    {t('thinkingLabel') as string}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ANALYSIS PHASES — full agent-run thinking state */}
          <AnimatePresence>
            {isProcessing && analysisPhases.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full max-w-md mb-4"
              >
                <div className="border border-white/[0.04] bg-white/[0.02] backdrop-blur-sm p-4 space-y-1.5">
                  {analysisPhases.map((phase, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-start gap-2 font-mono text-[10px]">
                      <span className={i === analysisPhases.length - 1 ? 'text-green-400' : 'text-white/15'}>{i === analysisPhases.length - 1 ? '>' : '+'}</span>
                      <span className={i === analysisPhases.length - 1 ? 'text-green-300/80' : 'text-white/25'}>{phase}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* THE STAGE — Bobby's latest response + data panels */}
          <div className="w-full flex-1 space-y-3 pb-4">
            {/* Latest Bobby message — the main "stage" text */}
            {latestAdvisor && (
              <motion.div
                key={latestAdvisor.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="w-full max-w-2xl mx-auto"
              >
                <div className="border border-white/[0.04] bg-white/[0.02] backdrop-blur-sm p-3 sm:p-5">
                  <div className="text-[12px] sm:text-[13px] leading-relaxed text-white/80 font-mono">
                    <DebateText text={latestAdvisor.text} />
                  </div>
                </div>

                {/* Technical Analysis Chart — appears with candles, SMA, S/R */}
                {latestAdvisor.technicalAnalysis && (
                  <div className="mt-3">
                    <TechnicalChart data={latestAdvisor.technicalAnalysis} />
                  </div>
                )}

                {/* Action buttons — appear when Bobby finishes */}
                {!isProcessing && !isSpeaking && latestAdvisor.text.length > 50 && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 flex items-center gap-2 flex-wrap"
                  >
                    {/* Deep dive — expand the argument */}
                    <button
                      onClick={() => sendMessage(lang === 'es'
                        ? 'Profundiza más en el análisis. ¿Por qué exactamente? Dame los datos específicos, los precedentes históricos, y los escenarios de riesgo que no mencionaste.'
                        : 'Deep dive. Why exactly? Give me the specific data, historical precedents, and risk scenarios you didn\'t mention.'
                      )}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono text-white/30 border border-white/[0.06] bg-white/[0.02] hover:text-yellow-400/70 hover:border-yellow-500/20 hover:bg-yellow-500/[0.05] transition-all active:scale-[0.97]"
                    >
                      🔍 {lang === 'es' ? 'Profundizar' : 'Deep Dive'}
                    </button>
                    {/* Challenge — argue against Bobby */}
                    <button
                      onClick={() => sendMessage(lang === 'es'
                        ? 'No estoy de acuerdo. Arguye en contra de tu propia posición. ¿Qué podría salir mal?'
                        : 'I disagree. Argue against your own position. What could go wrong?'
                      )}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono text-white/30 border border-white/[0.06] bg-white/[0.02] hover:text-red-400/70 hover:border-red-500/20 hover:bg-red-500/[0.05] transition-all active:scale-[0.97]"
                    >
                      ⚡ {lang === 'es' ? 'Desafiar' : 'Challenge'}
                    </button>
                    {/* Share voice note */}
                    {hasResponseAudio && (
                      <button
                        onClick={shareVoiceNote}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono text-white/30 border border-white/[0.06] bg-white/[0.02] hover:text-green-400/70 hover:border-green-500/20 hover:bg-green-500/[0.05] transition-all active:scale-[0.97]"
                      >
                        <Share2 className="w-3 h-3" />
                        {lang === 'es' ? 'Compartir' : 'Share'}
                      </button>
                    )}
                  </motion.div>
                )}

                {/* Perps Trade Card — execute leveraged perpetuals via OKX CEX */}
                {!isProcessing && latestAdvisor.text.length > 100 && (() => {
                  const text = latestAdvisor.text;
                  const convMatch = text.match(/(\d+)\s*\/\s*10/);
                  const conv = convMatch ? parseInt(convMatch[1]) / 10 : 0.5;
                  const symMatch = text.match(/\b(BTC|ETH|SOL|OKB|HYPE|XRP|UNI|MATIC|DOGE|AVAX|LINK)\b/i);
                  const dirMatch = text.match(/\b(long|short|comprar?|vender?)\b/i);
                  const entryMatch = text.match(/(?:entry|entr[ao]|comprar?)\s*(?:\w+\s+)*?(?:en|at|a)?\s*\$?([\d,]+(?:\.\d+)?)/i);
                  const targetMatch = text.match(/target\s*(?:\w+\s+)*?(?:en|at|a|in)?\s*\$?([\d,]+(?:\.\d+)?)/i);
                  const stopMatch = text.match(/stop\s*(?:loss)?\s*(?:\w+\s+)*?(?:en|at|a|in)?\s*\$?([\d,]+(?:\.\d+)?)/i);
                  if (symMatch) {
                    const dir = dirMatch ? (/short|vender/i.test(dirMatch[1]) ? 'short' : 'long') : 'long';
                    return (
                      <PerpsTradeCard
                        symbol={symMatch[1].toUpperCase()}
                        direction={dir as 'long' | 'short'}
                        conviction={conv}
                        entryPrice={entryMatch ? parseFloat(entryMatch[1].replace(/,/g, '')) : undefined}
                        targetPrice={targetMatch ? parseFloat(targetMatch[1].replace(/,/g, '')) : undefined}
                        stopPrice={stopMatch ? parseFloat(stopMatch[1].replace(/,/g, '')) : undefined}
                        language={lang}
                      />
                    );
                  }
                  return null;
                })()}

                {/* X Layer Swap — spot swap on-chain (secondary option) */}
                {!isProcessing && latestAdvisor.text.length > 100 && (() => {
                  const text = latestAdvisor.text;
                  const convMatch = text.match(/(\d+)\s*\/\s*10/);
                  const conv = convMatch ? parseInt(convMatch[1]) / 10 : 0.5;
                  const symMatch = text.match(/\b(BTC|ETH|SOL|OKB|HYPE|XRP|UNI|MATIC|DOGE|AVAX|LINK)\b/i);
                  const dirMatch = text.match(/\b(long|short|comprar?|vender?)\b/i);
                  const entryMatch = text.match(/(?:entry|entr[ao]|comprar?)\s*(?:\w+\s+)*?(?:en|at|a)?\s*\$?([\d,]+(?:\.\d+)?)/i);
                  if (symMatch) {
                    const dir = dirMatch ? (/short|vender/i.test(dirMatch[1]) ? 'short' : 'long') : 'long';
                    return (
                      <XLayerSwapCard
                        symbol={symMatch[1].toUpperCase()}
                        direction={dir}
                        conviction={conv}
                        entryPrice={entryMatch ? parseFloat(entryMatch[1].replace(/,/g, '')) : undefined}
                      />
                    );
                  }
                  return null;
                })()}

                {/* Trade execution cards */}
                {latestAdvisor.trades && latestAdvisor.trades.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {latestAdvisor.trades.map((trade, i) => (
                      <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                        <SwapConfirm trade={trade} walletAddress={address} />
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* INTELLIGENCE FEED — visible metacognition (debate Alpha vs Red Team vs Bobby CIO) */}
            {latestAdvisor?.debate && (
              <IntelligenceFeed
                debate={latestAdvisor.debate}
                metacognition={latestAdvisor.metacognition}
                topSignals={latestAdvisor.topSignals}
                polymarket={latestAdvisor.polymarket}
                isLive={latestAdvisor === messages[messages.length - 1]}
              />
            )}

            {/* DATA PANELS — price cards emerge from darkness */}
            {latestAdvisor?.prices && latestAdvisor.prices.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="w-full max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                {latestAdvisor.prices.map((p, i) => (
                  <motion.div
                    key={p.symbol}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                  >
                    <InlinePriceCard price={p} highlighted={highlightedSymbols.has(p.symbol)} labels={t('priceLabels') as { high: string; low: string; volume: string; funding: string }} />
                  </motion.div>
                ))}
              </motion.div>
            )}

            {/* CONTINUE PROMPT — block-by-block analysis */}
            <AnimatePresence>
              {awaitingContinue && pendingBlocks.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="w-full max-w-2xl mx-auto"
                >
                  <div className="border border-green-500/15 bg-green-500/[0.03] backdrop-blur-sm p-3 flex items-center justify-between gap-3">
                    <span className="text-[10px] font-mono text-green-400/50">
                      {pendingBlocks.length} {lang === 'es' ? (pendingBlocks.length === 1 ? 'bloque restante' : 'bloques restantes')
                        : lang === 'pt' ? (pendingBlocks.length === 1 ? 'bloco restante' : 'blocos restantes')
                        : (pendingBlocks.length === 1 ? 'block remaining' : 'blocks remaining')}
                    </span>
                    <button
                      onClick={() => { setAwaitingContinue(false); revealNextBlock(); }}
                      className="text-[11px] px-4 py-1.5 bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-colors font-mono tracking-wider animate-pulse">
                      {lang === 'es' ? 'CONTINUAR ▸' : lang === 'pt' ? 'CONTINUAR ▸' : 'CONTINUE ▸'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* CONVERSATION HISTORY — compact, behind the stage */}
            {messages.length > 1 && (
              <div className="w-full max-w-2xl mx-auto pt-4 border-t border-white/[0.03]">
                <div className="space-y-2">
                  {messages.slice(0, -1).map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] px-3 py-1.5 text-[11px] ${
                        msg.role === 'user'
                          ? 'bg-white/[0.06] text-white/50'
                          : 'text-white/30 font-mono'
                      }`}>
                        {msg.text.length > 200 ? msg.text.slice(0, 200) + '...' : msg.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* ===== INPUT BAR — Bottom ===== */}
      <div className="flex-shrink-0 border-t border-white/[0.04]" style={{ background: '#080808', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {isAuthenticated ? (
          <>
            <div className="max-w-4xl mx-auto px-2 sm:px-4 pt-1.5 sm:pt-2 pb-0.5 sm:pb-1">
              <div className="flex gap-1 sm:gap-2 overflow-x-auto no-scrollbar justify-start sm:justify-center sm:flex-wrap">
                {(() => {
                  const qa = t('quickActions') as { gold: string; silver: string; allPrices: string; analyze: string };
                  return [
                    { label: 'BTC', display: 'BTC', icon: '₿' },
                    { label: 'ETH', display: 'ETH', icon: 'Ξ' },
                    { label: 'Gold', display: qa.gold, icon: '◆' },
                    { label: 'Silver', display: qa.silver, icon: '◇' },
                    { label: 'All Prices', display: qa.allPrices, icon: '$' },
                    { label: 'Analyze Market', display: qa.analyze, icon: '>' },
                    { label: lang === 'es' ? '¿Cómo ves el mercado hoy? Dame el debate completo.' : "What's your read on the market right now? Give me the full debate.", display: 'Debate', icon: '⚔' },
                  ];
                })().map(a => (
                  <button key={a.label} onClick={() => sendMessage(a.label)} disabled={isProcessing}
                    className="flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[9px] sm:text-[10px] border border-white/[0.05] bg-white/[0.01] text-white/30 hover:bg-white/[0.04] hover:text-white/60 hover:border-white/10 transition-all disabled:opacity-20 font-mono whitespace-nowrap flex-shrink-0">
                    <span className="text-green-400/60">{a.icon}</span>
                    {a.display}
                  </button>
                ))}
                <Link to="/agentic-world/forum"
                  className="flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[9px] sm:text-[10px] border border-yellow-500/10 bg-yellow-500/[0.03] text-yellow-400/50 hover:bg-yellow-500/[0.08] hover:text-yellow-400/80 hover:border-yellow-500/20 transition-all font-mono whitespace-nowrap flex-shrink-0">
                  <span>⚔</span> Forum
                </Link>
                <Link to="/agentic-world/polymarket"
                  className="flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[9px] sm:text-[10px] border border-cyan-500/10 bg-cyan-500/[0.03] text-cyan-400/50 hover:bg-cyan-500/[0.08] hover:text-cyan-400/80 hover:border-cyan-500/20 transition-all font-mono whitespace-nowrap flex-shrink-0">
                  <span>◉</span> Dashboard
                </Link>
              </div>
            </div>
            <div className="max-w-4xl mx-auto px-2 sm:px-4 py-1.5 sm:py-2.5 flex items-center gap-1.5 sm:gap-2">
              <button onClick={toggleListening} disabled={isProcessing}
                className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center border transition-all active:scale-[0.95] flex-shrink-0 rounded-full ${
                  isListening
                    ? 'bg-red-500/20 border-red-500/50 text-red-400 animate-pulse'
                    : 'border-white/[0.06] text-white/20 hover:border-green-500/20 hover:text-green-400/60'
                }`}>
                {isListening ? <Mic className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <MicOff className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
              </button>
              <input type="text" value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                onFocus={() => {
                  // Mobile keyboard: scroll input into view
                  setTimeout(() => {
                    const el = document.activeElement as HTMLElement;
                    el?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                  }, 300);
                }}
                placeholder={isListening ? t('listening') as string : `${lang === 'es' ? 'Habla con' : lang === 'pt' ? 'Fale com' : 'Talk to'} ${advisorName}...`}
                className={`flex-1 bg-transparent border-0 border-b px-2 sm:px-3 py-1.5 sm:py-2 text-[12px] sm:text-[13px] text-white/90 placeholder:text-white/15 outline-none transition-colors font-mono ${
                  isListening ? 'border-red-500/20' : 'border-white/[0.06] focus:border-white/10'
                }`}
                disabled={isProcessing} />
              <button onClick={() => sendMessage()} disabled={!inputText.trim() || isProcessing}
                className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center transition-all active:scale-[0.95] rounded-full ${
                  inputText.trim() && !isProcessing ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'text-white/10 cursor-not-allowed'
                }`}>
                {isProcessing ? <Activity className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" /> : <ArrowUp className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
              </button>
            </div>
          </>
        ) : (
          /* ===== AUTH GATE — Login prompt for unauthenticated users ===== */
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="border border-amber-500/20 bg-amber-500/[0.03] backdrop-blur-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-amber-400/80 flex-shrink-0" />
                <span className="text-amber-400/80 text-[11px] font-mono">
                  {lang === 'es' ? 'Inicia sesión para hablar con Bobby' : lang === 'pt' ? 'Faça login para falar com Bobby' : 'Sign in to talk to Bobby'}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigate('/login?redirect=' + encodeURIComponent(window.location.pathname))}
                  className="text-[10px] px-4 py-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 transition-colors font-mono tracking-wider">
                  {lang === 'es' ? 'INICIAR SESIÓN' : lang === 'pt' ? 'ENTRAR' : 'SIGN IN'}
                </button>
                <button
                  onClick={() => navigate('/register?redirect=' + encodeURIComponent(window.location.pathname))}
                  className="text-[10px] px-4 py-1.5 border border-green-500/30 text-green-400/60 hover:text-green-400 hover:border-green-500/50 transition-colors font-mono tracking-wider">
                  {lang === 'es' ? 'CREAR CUENTA' : lang === 'pt' ? 'CRIAR CONTA' : 'SIGN UP'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
