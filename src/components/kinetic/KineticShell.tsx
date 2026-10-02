import { t, speechLocale } from '@/lib/companions/i18n';
// ============================================================
// KineticShell — Shared layout wrapper for Stitch "Agent Terminal"
// Provides: top nav, sidebar (desktop), mobile bottom nav, ticker tape, scanline
// Used by all Bobby pages for consistent design system
// ============================================================

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ReactNode, useCallback, useState } from 'react';
import { TradingRoomProvider, useTradingRoom } from '@/hooks/useTradingRoom';
import { Lock } from 'lucide-react';
import SkinInTheGameBadge from './SkinInTheGameBadge';
import NucleoTopBar from '@/components/protocol/NucleoTopBar';
import { useNucleoPages } from '@/hooks/useNucleoPages';
import { MIN_POLL_MS, useVisiblePoll } from '@/hooks/useVisiblePoll';

// V3 IA: 4 páginas core (Gemini). Rutas legacy quedan alcanzables por deep-link.
const NAV_ITEMS = [
  { id: 'terminal', label: t("WAR ROOM", "ANÁLISIS"), path: '/desk' },
  { id: 'history', label: t("PERFORMANCE", "RENDIMIENTO"), path: '/record' },
  { id: 'analytics', label: t("INTEL", "INFORMACIÓN"), path: '/agentic-world/bobby/analytics' },
  { id: 'console', label: t("CONSOLE", "CONSOLA"), path: '/agentic-world/bobby/console' },
] as const;

type NavItemId = (typeof NAV_ITEMS)[number]['id'] | 'agents' | 'metacognition' | 'docs' | 'marketplace' | 'harness' | 'challenge' | 'signals' | 'sandbox' | 'playbooks';

interface KineticShellProps {
  children: ReactNode;
  activeTab?: NavItemId;
  showSidebar?: boolean;
  /** Protocol pages: hide the app tab nav + workspace toggle for a clean, focused frame. */
  minimalNav?: boolean;
  showTicker?: boolean;
  showStatus?: boolean;
  /** Protocol and documentation pages: the Núcleo frame (the home's top bar, no ticker, no bottom nav). */
  nucleo?: boolean;
}

// Shared ticker tape data — fetched on mount, then refreshed while mounted and visible.
// The stats endpoint returns the feed under `market.prices`; reading a
// top-level `prices` left the tape stuck on LOADING forever.
const TICKER_LIMIT = 20;
const TICKER_REFRESH_MS = MIN_POLL_MS;

const formatTickerPrice = (value: number) =>
  value >= 1000 ? value.toLocaleString(speechLocale(), { maximumFractionDigits: 0 })
    : value >= 1 ? value.toLocaleString(speechLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : value.toLocaleString(speechLocale(), { minimumFractionDigits: 4, maximumFractionDigits: 4 });

function TickerTape() {
  const [tickers, setTickers] = useState<Array<{ symbol: string; change24h: number; last: number }>>([]);

  // Paused while the tab is hidden; the stats route is CDN-cached for 60 s (see useVisiblePoll).
  useVisiblePoll(useCallback((signal: AbortSignal) => {
    fetch('/api/bobby-protocol-stats', { cache: 'no-store', signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => {
        const feed = d?.market?.prices ?? d?.prices;
        const prices = Array.isArray(feed) ? feed : [];
        const next = prices
          .map((price: { symbol?: string; price?: number; change24h?: number }) => ({
            symbol: String(price.symbol || ''),
            last: Number(price.price || 0),
            change24h: Number(price.change24h || 0),
          }))
          .filter((price: { symbol: string; last: number }) => price.symbol && Number.isFinite(price.last))
          .slice(0, TICKER_LIMIT);
        if (!signal.aborted && next.length > 0) setTickers(next);
      })
      .catch(() => { /* the tape keeps its last good values */ });
  }, []), TICKER_REFRESH_MS);

  const items = tickers.length > 0
    ? tickers.map(t => `$${t.symbol} ${formatTickerPrice(t.last)} ${t.change24h >= 0 ? '+' : ''}${t.change24h}%`)
    : ['$BTC --', '$ETH --', '$SOL --', t("LOADING...", "CARGANDO…")];

  // Duplicate for seamless loop
  const doubled = [...items, ...items];

  return (
    <div className="w-full overflow-hidden bg-white/[0.015] h-7 flex items-center border-b border-white/5">
      <div className="flex whitespace-nowrap gap-8 text-[10px] font-mono text-white/40 uppercase animate-marquee">
        {doubled.map((item, i) => (
          <span key={i}>{item}</span>
        ))}
      </div>
    </div>
  );
}

export default function KineticShell({ children, activeTab, showSidebar = false, minimalNav = false, showTicker = true, showStatus = true, nucleo = false }: KineticShellProps) {
  return (
    <TradingRoomProvider>
      {nucleo ? (
        <NucleoShell>{children}</NucleoShell>
      ) : (
        <KineticShellInner activeTab={activeTab} showSidebar={showSidebar} minimalNav={minimalNav} showTicker={showTicker} showStatus={showStatus}>
          {children}
        </KineticShellInner>
      )}
    </TradingRoomProvider>
  );
}

// The Núcleo frame: styles come from body.nucleo-pages (src/styles/nucleo-pages.css).
function NucleoShell({ children }: { children: ReactNode }) {
  useNucleoPages();
  return (
    <div className="min-h-screen">
      <NucleoTopBar />
      <main className="min-w-0">{children}</main>
    </div>
  );
}

function KineticShellInner({ children, activeTab, showSidebar = false, minimalNav = false, showTicker = true, showStatus = true }: KineticShellProps) {
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
  const navAccent = roomMode === 'personal' && hasAgent ? accentColor : 'text-[#7da6ff]';
  const navGlow = roomMode === 'personal' && hasAgent
    ? 'shadow-[0_0_15px_rgba(234,179,8,0.08)]'
    : 'shadow-[0_0_15px_rgba(0,82,255,0.18)]';

  return (
    <div className="min-h-screen bg-[#050505] text-[#e5e2e1] font-['Inter'] selection:bg-[#0052ff] selection:text-white">
      {/* === Top Nav === */}
      <nav className={`sticky top-0 w-full flex justify-between items-center px-4 md:px-6 h-14 bg-[#131313]/80 backdrop-blur-md z-50 ${navGlow} border-b border-white/5`}>
        <Link to="/protocol" className={`text-lg font-black tracking-tighter ${navAccent} font-mono hover:opacity-80 transition-opacity`}>
          {roomMode === 'personal' && hasAgent
            ? t(`${agentName} TRADING ROOM`, `SALA DE TRADING DE ${agentName}`)
            : `BOBBY PROTOCOL`}
        </Link>

        {/* Workspace Toggle */}
        <div className={`${minimalNav ? 'hidden' : 'hidden md:flex'} items-center gap-1 font-mono text-[9px] bg-white/[0.03] border border-white/[0.06] rounded-sm overflow-hidden`}>
          <button
            onClick={() => setRoomMode('global')}
            className={`px-3 py-1.5 transition-all ${
              roomMode === 'global'
                ? 'bg-[#0052ff]/20 text-[#7da6ff]'
                : 'text-white/30 hover:text-white/50'
            }`}
          >
            {t("PUBLIC NETWORK", "RED PÚBLICA")}</button>
          {hasAgent ? (
            <button
              onClick={() => setRoomMode('personal')}
              className={`px-3 py-1.5 transition-all ${
                roomMode === 'personal'
                  ? `${profile?.personality === 'direct' ? 'bg-orange-500/15 text-orange-400' : profile?.personality === 'wise' ? 'bg-indigo-500/15 text-indigo-400' : 'bg-yellow-500/15 text-yellow-400'}`
                  : 'text-white/30 hover:text-white/50'
              }`}
            >
              {t('MY AGENT', 'MI AGENTE')}: {agentName}
            </button>
          ) : (
            <button
              onClick={() => navigate('/agentic-world/deploy')}
              className="px-3 py-1.5 text-white/20 hover:text-white/40 transition-all flex items-center gap-1"
            >
              <Lock className="w-2.5 h-2.5" /> {t("MY AGENT", "MI AGENTE")}</button>
          )}
        </div>

        <div className={`${minimalNav ? 'hidden' : 'hidden md:flex'} gap-4 lg:gap-6 items-center font-mono uppercase tracking-widest text-[10px]`}>
          {NAV_ITEMS.map(item => (
            <Link key={item.id} to={item.path}
              className={currentTab === item.id
                ? `${navAccent} border-b-2 ${roomMode === 'personal' && hasAgent ? 'border-current' : 'border-[#0052ff]'} pb-1 font-bold`
                : 'text-gray-500 hover:text-gray-300 transition-colors'
              }>
              {item.label}
            </Link>
          ))}
        </div>
        {showStatus && (<div className="flex items-center gap-3">
          <SkinInTheGameBadge />
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full animate-pulse ${roomMode === 'personal' && hasAgent ? 'bg-current ' + navAccent : 'bg-[#0052ff]'}`} />
            <span className={`text-[9px] font-mono tracking-wider hidden sm:inline ${navAccent}`}>
              {roomMode === 'personal' ? t("PERSONAL", "PERSONAL") : t("ONLINE", "EN LÍNEA")}
            </span>
          </div>
        </div>
        )}
      </nav>

      {/* === Ticker Tape === */}
      {showTicker && <TickerTape />}

      {/* === Content with optional sidebar === */}
      <div className="flex">
        {/* Main content */}
        <main className="min-w-0 flex-1"
          style={{ background: 'linear-gradient(to bottom, transparent 50%, rgba(34,197,94,0.006) 50%)', backgroundSize: '100% 4px' }}>
          {children}
        </main>
      </div>

      {/* === Mobile Bottom Nav === */}
      {!minimalNav && (
      <nav className="md:hidden fixed bottom-0 w-full h-14 bg-[#131313]/90 backdrop-blur-xl border-t border-white/5 flex items-center justify-around px-4 z-50">
        {[
          { id: 'terminal', icon: '⌘', label: t("WAR ROOM", "ANÁLISIS"), path: '/desk' },
          { id: 'history', icon: '◎', label: t("PERFORMANCE", "RENDIMIENTO"), path: '/record' },
          { id: 'analytics', icon: '◈', label: t("INTEL", "INFORMACIÓN"), path: '/agentic-world/bobby/analytics' },
          { id: 'console', icon: '△', label: t("CONSOLE", "CONSOLA"), path: '/agentic-world/bobby/console' },
        ].map(item => (
          <Link key={item.id} to={item.path}
            className={`flex flex-col items-center gap-0.5 ${
              currentTab === item.id ? 'text-[#7da6ff]' : 'text-white/25'
            }`}>
            <span className="text-base">{item.icon}</span>
            <span className="text-[7px] font-mono">{item.label}</span>
          </Link>
        ))}
      </nav>
      )}
    </div>
  );
}
