// ============================================================
// KineticShell — Shared layout wrapper for Stitch "Agent Terminal"
// Provides: top nav, sidebar (desktop), mobile bottom nav, ticker tape, scanline
// Used by all Bobby pages for consistent design system
// ============================================================

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ReactNode, useEffect, useState } from 'react';
import { TradingRoomProvider, useTradingRoom } from '@/hooks/useTradingRoom';
import { Lock } from 'lucide-react';

interface KineticShellProps {
  children: ReactNode;
  activeTab?: 'terminal' | 'challenge' | 'history' | 'agents' | 'analytics' | 'metacognition' | 'signals';
  showSidebar?: boolean;
}

// Shared ticker tape data — fetched once, used everywhere
function TickerTape() {
  const [tickers, setTickers] = useState<Array<{ symbol: string; change24h: number; last: number }>>([]);

  useEffect(() => {
    fetch('/api/okx-tickers')
      .then(r => r.json())
      .then(d => { if (d.ok) setTickers(d.tickers.slice(0, 8)); })
      .catch(() => {});
  }, []);

  const items = tickers.length > 0
    ? tickers.map(t => `$${t.symbol} ${t.change24h >= 0 ? '+' : ''}${t.change24h}%`)
    : ['$BTC --', '$ETH --', '$SOL --', 'LOADING...'];

  // Duplicate for seamless loop
  const doubled = [...items, ...items];

  return (
    <div className="w-full overflow-hidden bg-white/[0.015] h-7 flex items-center border-b border-white/5">
      <div className="flex whitespace-nowrap gap-8 text-[10px] font-mono text-green-400/50 uppercase animate-marquee">
        {doubled.map((item, i) => (
          <span key={i}>{item}</span>
        ))}
      </div>
    </div>
  );
}

const NAV_ITEMS = [
  { id: 'terminal', label: 'TERMINAL', path: '/agentic-world/bobby' },
  { id: 'challenge', label: 'CHALLENGE', path: '/agentic-world/bobby/challenge' },
  { id: 'history', label: 'HISTORY', path: '/agentic-world/bobby/history' },
  { id: 'agents', label: 'AGENTS', path: '/agentic-world/bobby/agents' },
  { id: 'analytics', label: 'ANALYTICS', path: '/agentic-world/bobby/analytics' },
  { id: 'metacognition', label: 'META', path: '/agentic-world/bobby/metacognition' },
  { id: 'signals', label: 'SIGNALS', path: '/agentic-world/bobby/signals' },
  { id: 'docs', label: 'AI DOCS', path: '/agentic-world/bobby/docs' },
  { id: 'marketplace', label: 'AGENT COMMERCE', path: '/agentic-world/bobby/marketplace' },
  { id: 'harness', label: 'HARNESS', path: '/protocol/harness' },
] as const;

const SIDE_ITEMS = [
  { icon: '⌘', label: 'Command', path: '/agentic-world/bobby/challenge' },
  { icon: '◈', label: 'Intel', path: '/agentic-world/bobby/analytics' },
  { icon: '◎', label: 'History', path: '/agentic-world/bobby/history' },
  { icon: '△', label: 'Agents', path: '/agentic-world/bobby/agents' },
  { icon: '◇', label: 'Debates', path: '/agentic-world/forum' },
  { icon: '◉', label: 'Meta', path: '/agentic-world/bobby/metacognition' },
  { icon: '⚡', label: 'Signals', path: '/agentic-world/bobby/signals' },
];

export default function KineticShell({ children, activeTab, showSidebar = false }: KineticShellProps) {
  return (
    <TradingRoomProvider>
      <KineticShellInner activeTab={activeTab} showSidebar={showSidebar}>
        {children}
      </KineticShellInner>
    </TradingRoomProvider>
  );
}

function KineticShellInner({ children, activeTab, showSidebar = false }: KineticShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentTab = activeTab || NAV_ITEMS.find(n => location.pathname === n.path)?.id || 'terminal';
  const { profile, hasAgent, roomMode, setRoomMode, accentColor } = useTradingRoom();

  // Agent name: from context (real DB) → localStorage fallback → default
  const agentName = profile?.agent_name || (() => {
    try {
      const saved = localStorage.getItem('bobby_agent_name');
      if (saved && saved.length >= 2) return saved;
    } catch {}
    return 'BOBBY';
  })();

  // Dynamic accent color for nav based on room mode
  const navAccent = roomMode === 'personal' && hasAgent ? accentColor : 'text-green-500';
  const navGlow = roomMode === 'personal' && hasAgent
    ? 'shadow-[0_0_15px_rgba(234,179,8,0.08)]'
    : 'shadow-[0_0_15px_rgba(34,197,94,0.08)]';

  return (
    <div className="min-h-screen bg-[#050505] text-[#e5e2e1] font-['Inter'] selection:bg-green-500 selection:text-black">
      {/* === Top Nav === */}
      <nav className={`sticky top-0 w-full flex justify-between items-center px-4 md:px-6 h-14 bg-[#131313]/80 backdrop-blur-md z-50 ${navGlow} border-b border-white/5`}>
        <Link to="/agentic-world/bobby" className={`text-lg font-black tracking-tighter ${navAccent} font-mono hover:opacity-80 transition-opacity`}>
          {roomMode === 'personal' && hasAgent
            ? `${agentName} TRADING ROOM`
            : `${agentName} AGENT TRADER`}
        </Link>

        {/* Workspace Toggle */}
        <div className="hidden md:flex items-center gap-1 font-mono text-[9px] bg-white/[0.03] border border-white/[0.06] rounded-sm overflow-hidden">
          <button
            onClick={() => setRoomMode('global')}
            className={`px-3 py-1.5 transition-all ${
              roomMode === 'global'
                ? 'bg-green-500/15 text-green-400'
                : 'text-white/30 hover:text-white/50'
            }`}
          >
            PUBLIC NETWORK
          </button>
          {hasAgent ? (
            <button
              onClick={() => setRoomMode('personal')}
              className={`px-3 py-1.5 transition-all ${
                roomMode === 'personal'
                  ? `${profile?.personality === 'direct' ? 'bg-orange-500/15 text-orange-400' : profile?.personality === 'wise' ? 'bg-indigo-500/15 text-indigo-400' : 'bg-yellow-500/15 text-yellow-400'}`
                  : 'text-white/30 hover:text-white/50'
              }`}
            >
              MY AGENT: {agentName}
            </button>
          ) : (
            <button
              onClick={() => navigate('/agentic-world/deploy')}
              className="px-3 py-1.5 text-white/20 hover:text-white/40 transition-all flex items-center gap-1"
            >
              <Lock className="w-2.5 h-2.5" /> MY AGENT
            </button>
          )}
        </div>

        <div className="hidden md:flex gap-4 lg:gap-6 items-center font-mono uppercase tracking-widest text-[10px]">
          {NAV_ITEMS.map(item => (
            <Link key={item.id} to={item.path}
              className={currentTab === item.id
                ? `${navAccent} border-b-2 ${roomMode === 'personal' && hasAgent ? 'border-current' : 'border-green-500'} pb-1 font-bold`
                : 'text-gray-500 hover:text-gray-300 transition-colors'
              }>
              {item.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full animate-pulse ${roomMode === 'personal' && hasAgent ? 'bg-current ' + navAccent : 'bg-green-500'}`} />
          <span className={`text-[9px] font-mono tracking-wider hidden sm:inline ${navAccent}`}>
            {roomMode === 'personal' ? 'PERSONAL' : 'ONLINE'}
          </span>
        </div>
      </nav>

      {/* === Ticker Tape === */}
      <TickerTape />

      {/* === Content with optional sidebar === */}
      <div className="flex">
        {/* Main content */}
        <main className="flex-1"
          style={{ background: 'linear-gradient(to bottom, transparent 50%, rgba(34,197,94,0.006) 50%)', backgroundSize: '100% 4px' }}>
          {children}
        </main>
      </div>

      {/* === Mobile Bottom Nav === */}
      <nav className="md:hidden fixed bottom-0 w-full h-14 bg-[#131313]/90 backdrop-blur-xl border-t border-white/5 flex items-center justify-around px-4 z-50">
        {[
          { id: 'terminal', icon: '⌘', label: 'TERMINAL', path: '/agentic-world/bobby' },
          { id: 'challenge', icon: '◆', label: 'CHALLENGE', path: '/agentic-world/bobby/challenge' },
          { id: 'history', icon: '◎', label: 'HISTORY', path: '/agentic-world/bobby/history' },
          { id: 'agents', icon: '△', label: 'AGENTS', path: '/agentic-world/bobby/agents' },
          { id: 'metacognition', icon: '◉', label: 'META', path: '/agentic-world/bobby/metacognition' },
        ].map(item => (
          <Link key={item.id} to={item.path}
            className={`flex flex-col items-center gap-0.5 ${
              currentTab === item.id ? 'text-green-400' : 'text-white/25'
            }`}>
            <span className="text-base">{item.icon}</span>
            <span className="text-[7px] font-mono">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
