// ============================================================
// AdamsChat — Chat-style conversation with AI advisor
// Full-height chat, persistent messages, on-chain execution
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowUp, ArrowLeft, ChevronRight, Activity, Settings, Bot, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { AdvisorSetup, useAdvisorProfile } from './AdvisorSetup';
import type { AdvisorProfile } from './AdvisorSetup';
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

async function fetchMessages(wallet: string): Promise<DBMessage[]> {
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

// ---- Chat message type ----

interface ChatMsg {
  id: string;
  role: 'user' | 'advisor';
  text: string;
  timestamp: number;
  isLive?: boolean;
  trades?: TradeExecution[];
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-2.5 items-start"
    >
      <div className="w-7 h-7 border border-green-500/20 bg-green-500/5 flex items-center justify-center flex-shrink-0 mt-5">
        <span className="text-[10px] font-bold text-green-400">{initial}</span>
      </div>
      <div className="max-w-[85%] flex flex-col items-start">
        <span className="text-[9px] font-bold font-mono tracking-[1.5px] mb-1 px-0.5 text-white/30">
          {advisorName.toUpperCase()}
        </span>
        <div className="border border-green-500/15 bg-green-500/[0.04] px-3.5 py-2.5 font-mono text-[11px] space-y-1">
          {phases.map((phase, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-start gap-1.5"
            >
              <span className={i === phases.length - 1 ? 'text-green-400' : 'text-green-500/50'}>
                {i === phases.length - 1 ? '>' : '+'}
              </span>
              <span className={i === phases.length - 1 ? 'text-green-300' : 'text-green-400/60'}>
                {phase}
              </span>
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

// ---- Quick Action Chips ----

function QuickActions({ onAction, disabled }: { onAction: (text: string) => void; disabled: boolean }) {
  const actions = [
    { label: 'Analyze Market', icon: '>' },
    { label: 'Show Portfolio', icon: '$' },
    { label: "What's trending?", icon: '#' },
  ];

  return (
    <div className="flex gap-2 flex-wrap">
      {actions.map(a => (
        <button
          key={a.label}
          onClick={() => onAction(a.label)}
          disabled={disabled}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] border border-white/[0.08] bg-white/[0.02] text-white/50 hover:bg-white/[0.06] hover:text-white/80 hover:border-white/20 transition-all disabled:opacity-30"
        >
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

  const advisorName = profile?.advisorName || 'Adams';

  useEffect(() => {
    if (needsSetup) setShowSetup(true);
  }, [needsSetup]);

  // Load conversation history
  useEffect(() => {
    if (!profile?.walletAddress) return;
    fetchMessages(profile.walletAddress).then(dbMsgs => {
      if (dbMsgs.length === 0) {
        setMessages([{
          id: 'welcome',
          role: 'advisor',
          text: profile.language === 'es'
            ? `Hola ${profile.userName}! Soy ${advisorName}, tu advisor de trading autonomo.\n\nEscaneo OKX + Polymarket cada ${profile.scanIntervalHours || 8}h buscando oportunidades.\n\nEscribe "Analyze Market" o usa los botones de abajo para comenzar.`
            : profile.language === 'pt'
            ? `Ola ${profile.userName}! Sou ${advisorName}, seu advisor de trading autonomo.\n\nEscaneio OKX + Polymarket a cada ${profile.scanIntervalHours || 8}h buscando oportunidades.\n\nDigite "Analyze Market" ou use os botoes abaixo para comecar.`
            : `Hey ${profile.userName}! I'm ${advisorName}, your autonomous trading advisor.\n\nI scan OKX + Polymarket every ${profile.scanIntervalHours || 8}h looking for opportunities.\n\nType "Analyze Market" or use the buttons below to get started.`,
          timestamp: Date.now(),
        }]);
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

  // ---- Send message / trigger action ----
  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text || inputText).trim();
    if (!msg || isProcessing) return;
    setInputText('');

    const userMsg: ChatMsg = { id: uid(), role: 'user', text: msg, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    const lower = msg.toLowerCase();

    if (lower.includes('analyze') || lower.includes('market') || lower.includes('scan') || lower.includes('analiz')) {
      setIsProcessing(true);
      setAnalysisPhases([]);
      phaseTimerRef.current.forEach(clearTimeout);
      phaseTimerRef.current = [];

      const phases = [
        { text: 'Connecting to OKX OnchainOS...', delay: 0 },
        { text: 'Scanning ETH, SOL, Base whale signals...', delay: 800 },
        { text: 'Filtering signals (score > 20)...', delay: 2200 },
        { text: 'Fetching Polymarket leaderboard (top 15)...', delay: 3500 },
        { text: 'Self-optimizing prompt from last 10 cycles...', delay: 5000 },
        { text: 'Alpha Hunter analyzing opportunities...', delay: 6500 },
        { text: 'Red Team finding attack vectors...', delay: 8500 },
        { text: 'Judge agent making final verdict...', delay: 10500 },
        { text: 'Kelly Criterion sizing positions...', delay: 12000 },
        { text: 'Generating personalized report...', delay: 13000 },
      ];
      phases.forEach(p => {
        const t = setTimeout(() => setAnalysisPhases(prev => [...prev, p.text]), p.delay);
        phaseTimerRef.current.push(t);
      });

      try {
        const walletParam = address ? `&wallet=${address}` : '';
        const res = await fetch(`/api/agent-run?manual=true${walletParam}`);
        const data = await res.json();

        phaseTimerRef.current.forEach(clearTimeout);
        phaseTimerRef.current = [];
        setAnalysisPhases([]);

        if (data.ok) {
          // Extract trades with execution data
          const trades: TradeExecution[] = (data.trades || [])
            .filter((t: any) => t.execution)
            .map((t: any) => ({
              tokenSymbol: t.tokenSymbol,
              amountUsd: t.amountUsd,
              confidence: t.confidence || 0,
              sizingMethod: t.sizingMethod || 'half-kelly',
              chain: t.chain || '196',
              execution: t.execution,
            }));

          // Refetch messages from DB
          if (profile?.walletAddress) {
            const dbMsgs = await fetchMessages(profile.walletAddress);
            if (dbMsgs.length > 0) {
              const latest = dbMsgs[dbMsgs.length - 1];
              setMessages(prev => [...prev, {
                id: latest.id,
                role: 'advisor',
                text: latest.message.replace(/\*/g, '').replace(/_/g, ''),
                timestamp: new Date(latest.created_at).getTime(),
                isLive: true,
                trades: trades.length > 0 ? trades : undefined,
              }]);
            }
          }
        } else {
          setMessages(prev => [...prev, {
            id: uid(),
            role: 'advisor',
            text: 'Analysis cycle completed but no new data was generated. I\'ll try again next cycle.',
            timestamp: Date.now(),
          }]);
        }
      } catch (err) {
        phaseTimerRef.current.forEach(clearTimeout);
        setAnalysisPhases([]);
        setMessages(prev => [...prev, {
          id: uid(),
          role: 'advisor',
          text: `Error during analysis: ${err instanceof Error ? err.message : 'Unknown error'}. I'll retry next cycle.`,
          timestamp: Date.now(),
        }]);
      }
      setIsProcessing(false);

    } else if (lower.includes('portfolio') || lower.includes('position')) {
      setMessages(prev => [...prev, {
        id: uid(),
        role: 'advisor',
        text: 'Portfolio tracking is coming soon. For now, use "Analyze Market" to see the latest signals and recommendations.',
        timestamp: Date.now(),
      }]);

    } else if (lower.includes('trending') || lower.includes('trend')) {
      setMessages(prev => [...prev, {
        id: uid(),
        role: 'advisor',
        text: 'Check the Polymarket Agent Radar for trending smart money signals. You can find it in the Agentic World menu.',
        timestamp: Date.now(),
      }]);

    } else {
      setMessages(prev => [...prev, {
        id: uid(),
        role: 'advisor',
        text: `I understand you said "${msg}". Try:\n- "Analyze Market" — full OKX + Polymarket scan with multi-agent debate\n- "What's trending?" — smart money trends\n- "Show Portfolio" — open positions`,
        timestamp: Date.now(),
      }]);
    }
  }, [inputText, isProcessing, profile?.walletAddress, address]);

  return (
    <div className="h-[calc(100vh-4rem)] bg-black text-white flex flex-col">
      {showSetup && <AdvisorSetup onComplete={handleSetupComplete} />}

      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/[0.06] bg-black">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/agentic-world" className="text-white/20 hover:text-white/50 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="w-8 h-8 border border-green-500/20 bg-green-500/5 flex items-center justify-center">
              <span className="text-[11px] font-bold text-green-400">{advisorName.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <h1 className="text-[14px] font-semibold text-white/90">{advisorName}</h1>
              <p className="text-[10px] text-white/30 font-mono">
                {isProcessing ? 'Analyzing...' : 'Online'} · Every {profile?.scanIntervalHours || 8}h
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Wallet connect / address */}
            {address ? (
              <button
                onClick={() => openWallet()}
                className="flex items-center gap-1.5 text-[11px] text-green-400/70 border border-green-500/20 px-2.5 py-1.5 hover:bg-green-500/10 transition-colors font-mono"
              >
                <Wallet className="w-3 h-3" />
                {address.slice(0, 6)}...{address.slice(-4)}
              </button>
            ) : (
              <button
                onClick={() => openWallet()}
                className="flex items-center gap-1.5 text-[11px] text-green-400 border border-green-500/30 px-2.5 py-1.5 hover:bg-green-500/10 transition-colors"
              >
                <Wallet className="w-3 h-3" />
                Connect
              </button>
            )}
            {isConnected && profile && (
              <button
                onClick={() => setShowSetup(true)}
                className="p-2 border border-white/[0.06] hover:border-white/20 transition-colors"
              >
                <Settings className="w-3.5 h-3.5 text-white/30" />
              </button>
            )}
            {isConnected && !profile && (
              <button
                onClick={() => setShowSetup(true)}
                className="text-[11px] text-green-400/60 border border-green-500/20 px-3 py-1.5 hover:bg-green-500/10 transition-colors"
              >
                Setup Advisor
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
          {messages.map((msg, i) => (
            <ChatBubble
              key={msg.id}
              msg={msg}
              advisorName={advisorName}
              isLatest={i === messages.length - 1 && msg.role === 'advisor'}
              walletAddress={address}
            />
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
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={`Ask ${advisorName}...`}
            className="flex-1 bg-transparent border border-white/[0.08] px-4 py-2.5 text-[14px] text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-colors"
            disabled={isProcessing}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!inputText.trim() || isProcessing}
            className={`w-10 h-10 flex items-center justify-center border transition-all active:scale-[0.95] ${
              inputText.trim() && !isProcessing
                ? 'bg-white border-white text-black'
                : 'border-white/[0.08] text-white/20 cursor-not-allowed'
            }`}
          >
            {isProcessing ? (
              <Activity className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
