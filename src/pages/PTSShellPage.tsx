// ============================================================
// PTS Shell — White-label wrapper for ALL Bobby pages
// Replaces KineticShell with PTS-branded chrome (gold/navy)
// Every Bobby page can be mounted inside this shell
// Route: /demopts/*
// ============================================================

import { useState, useEffect, type ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { WhiteLabelProvider, PTS_THEME } from '@/contexts/WhiteLabelContext';

const NAV_ITEMS = [
  { id: 'terminal', label: 'MI ARENA', path: '/demopts/terminal' },
  { id: 'challenge', label: 'DESAFÍO', path: '/demopts/challenge' },
  { id: 'history', label: 'HISTORIAL', path: '/demopts/history' },
  { id: 'agents', label: 'AGENTES', path: '/demopts/agents' },
  { id: 'analytics', label: 'RENDIMIENTO', path: '/demopts/analytics' },
  { id: 'meta', label: 'META', path: '/demopts/meta' },
  { id: 'signals', label: 'SEÑALES', path: '/demopts/signals' },
  { id: 'defi', label: 'DEFI', path: '/demopts/defi' },
  { id: 'forum', label: 'DEBATES', path: '/demopts/forum' },
  { id: 'telegram', label: 'TELEGRAM', path: '/demopts/telegram' },
];

const TICKER_ASSETS = [
  { symbol: 'SPY', change: -1.79 },
  { symbol: 'QQQ', change: -2.31 },
  { symbol: 'NVDA', change: -4.16 },
  { symbol: 'AAPL', change: +0.11 },
  { symbol: 'TSLA', change: -3.59 },
  { symbol: 'META', change: -7.96 },
  { symbol: 'BTC', change: -3.47 },
  { symbol: 'ETH', change: -4.96 },
  { symbol: 'EUR/USD', change: -0.12 },
  { symbol: 'GOLD', change: +0.85 },
];

export default function PTSShellPage() {
  const location = useLocation();

  useEffect(() => {
    const prevName = localStorage.getItem('bobby_agent_name');
    const prevLang = localStorage.getItem('i18nextLng');
    localStorage.setItem('bobby_agent_name', 'DANY');
    localStorage.setItem('i18nextLng', 'es');
    // Also set the language cookie/key used by AdamsChat
    localStorage.setItem('bobby_language', 'es');
    return () => {
      if (prevName) localStorage.setItem('bobby_agent_name', prevName);
      else localStorage.removeItem('bobby_agent_name');
      if (prevLang) localStorage.setItem('i18nextLng', prevLang);
    };
  }, []);

  const doubled = [...TICKER_ASSETS, ...TICKER_ASSETS];
  const isTerminal = location.pathname === '/demopts/terminal';

  return (
    <WhiteLabelProvider theme={PTS_THEME}>
      <Helmet>
        <title>Dany Agent Trader | Pro Trading Skills — Global Investor</title>
      </Helmet>

      {/* Global CSS override: green → gold for all child Bobby pages */}
      <style>{`
        .pts-shell .text-green-400, .pts-shell .text-green-500 { color: #F8CF2C !important; }
        .pts-shell .bg-green-400, .pts-shell .bg-green-500 { background-color: #F8CF2C !important; }
        .pts-shell .bg-green-500\\/10, .pts-shell .bg-green-500\\/15, .pts-shell .bg-green-500\\/20 { background-color: rgba(248,207,44,0.1) !important; }
        .pts-shell .bg-green-400\\/10, .pts-shell .bg-green-400\\/20 { background-color: rgba(248,207,44,0.1) !important; }
        .pts-shell .border-green-400, .pts-shell .border-green-500 { border-color: #F8CF2C !important; }
        .pts-shell .border-green-500\\/20, .pts-shell .border-green-500\\/30, .pts-shell .border-green-500\\/40 { border-color: rgba(248,207,44,0.2) !important; }
        .pts-shell .hover\\:text-green-300:hover, .pts-shell .hover\\:text-green-400:hover { color: #ffeebe !important; }
        .pts-shell .hover\\:bg-green-500:hover { background-color: #F8CF2C !important; }
        .pts-shell .hover\\:bg-green-500\\/10:hover, .pts-shell .hover\\:bg-green-500\\/15:hover, .pts-shell .hover\\:bg-green-500\\/30:hover { background-color: rgba(248,207,44,0.15) !important; }
        .pts-shell .hover\\:border-green-500\\/20:hover, .pts-shell .hover\\:border-green-500\\/30:hover, .pts-shell .hover\\:border-green-500\\/40:hover { border-color: rgba(248,207,44,0.3) !important; }
        .pts-shell .text-green-400\\/50, .pts-shell .text-green-400\\/60, .pts-shell .text-green-400\\/70 { color: rgba(248,207,44,0.6) !important; }
        .pts-shell .from-green-500, .pts-shell .via-green-500, .pts-shell .to-green-500 { --tw-gradient-stops: #F8CF2C !important; }
        .pts-shell .shadow-\\[0_0_15px_rgba\\(34\\,197\\,94\\,0\\.05\\)\\] { box-shadow: 0 0 15px rgba(248,207,44,0.05) !important; }
        .pts-shell .shadow-\\[0_0_20px_rgba\\(34\\,197\\,94\\,0\\.3\\)\\] { box-shadow: 0 0 20px rgba(248,207,44,0.3) !important; }
        .pts-shell [style*="background: #050505"], .pts-shell [style*="background:#050505"] { background: #11121e !important; }

        /* Hide KineticShell's own chrome — PTS shell provides its own */
        .pts-shell [data-kinetic-shell] > nav.sticky { display: none !important; }
        .pts-shell [data-kinetic-shell] > div.h-7 { display: none !important; }
        .pts-shell [data-kinetic-shell] > nav.fixed { display: none !important; }
        /* Hide Forum + Dashboard link buttons in AdamsChat (they point to Bobby routes) */
        .pts-shell a[href="/agentic-world/forum"],
        .pts-shell a[href="/agentic-world/polymarket"] { display: none !important; }
      `}</style>

      <div className={`pts-shell ${isTerminal ? 'fixed inset-0 z-[100]' : 'min-h-screen'} flex flex-col overflow-hidden`} style={{ background: '#11121e' }}>

        {/* TOP NAV */}
        <nav className="flex-shrink-0 flex justify-between items-center px-4 md:px-6 h-12 z-50"
          style={{ background: 'rgba(30,31,43,0.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(248,207,44,0.1)' }}>
          <div className="flex items-center gap-6">
            <Link to="/demopts" className="text-base font-black tracking-tighter font-mono" style={{ color: '#F8CF2C' }}>
              DANY AGENT TRADER
            </Link>
            <div className="hidden md:flex gap-4 items-center font-mono uppercase tracking-widest text-[9px]">
              {NAV_ITEMS.map(item => (
                <Link key={item.id} to={item.path}
                  className={`transition-colors pb-0.5 ${
                    location.pathname === item.path
                      ? 'font-bold'
                      : 'text-gray-500 hover:opacity-80'
                  }`}
                  style={location.pathname === item.path ? { color: '#F8CF2C', borderBottom: '1px solid #F8CF2C' } : {}}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <span className="font-mono text-[8px] px-2 py-0.5 rounded" style={{ background: 'rgba(248,207,44,0.1)', color: '#F8CF2C', border: '1px solid rgba(248,207,44,0.2)' }}>
              GLOBAL INVESTOR
            </span>
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="font-mono text-[8px] text-green-400">ONLINE</span>
          </div>
        </nav>

        {/* TICKER TAPE */}
        <div className="flex-shrink-0 h-7 flex items-center overflow-hidden" style={{ background: '#1a1b27', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
          <div className="flex whitespace-nowrap gap-8 text-[9px] font-mono tracking-wider animate-marquee" style={{ color: 'rgba(248,207,44,0.5)' }}>
            {doubled.map((t, i) => (
              <span key={i}>
                <span style={{ color: 'rgba(248,207,44,0.7)' }}>${t.symbol}</span>
                <span className={t.change >= 0 ? 'text-green-400' : 'text-red-400'}> {t.change >= 0 ? '+' : ''}{t.change}%</span>
              </span>
            ))}
          </div>
        </div>

        {/* MAIN CONTENT — renders child route */}
        <div className={`flex-1 ${isTerminal ? 'min-h-0 overflow-hidden' : 'overflow-y-auto'}`}>
          <Outlet />
        </div>

        {/* MOBILE BOTTOM NAV */}
        <nav className="md:hidden fixed bottom-0 w-full h-14 flex items-center justify-around px-2 z-[101]"
          style={{ background: 'rgba(30,31,43,0.95)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(248,207,44,0.1)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {NAV_ITEMS.slice(0, 5).map(item => (
            <Link key={item.id} to={item.path}
              className="flex flex-col items-center gap-0.5"
              style={{ color: location.pathname === item.path ? '#F8CF2C' : 'rgba(255,255,255,0.25)' }}>
              <span className="text-[7px] font-mono tracking-[0.5px]">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </WhiteLabelProvider>
  );
}
