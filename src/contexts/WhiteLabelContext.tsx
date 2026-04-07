// ============================================================
// White Label Context — Allows full Bobby experience with custom branding
// Used by PTS demo and future white-label clients
// ============================================================

import { createContext, useContext, type ReactNode } from 'react';

export interface WhiteLabelTheme {
  agentName: string;           // "DANY" or "BOBBY"
  brandName: string;           // "Pro Trading Skills" or "DeFi México"
  primaryColor: string;        // "#F8CF2C" or "#22C55E"
  primaryColorRgb: string;     // "248,207,44" or "34,197,94"
  bgColor: string;             // "#11121e" or "#050505"
  surfaceColor: string;        // "#1e1f2b" or "#131313"
  accentText: string;          // "text-amber-400" or "text-green-400"
  accentBg: string;            // "bg-amber-500" or "bg-green-500"
  accentBorder: string;        // "border-amber-500" or "border-green-500"
  accentGlow: string;          // "rgba(248,207,44,0.1)" or "rgba(34,197,94,0.1)"
  markets: string[];           // ["SPY", "QQQ", "NVDA", ...] or ["BTC", "ETH", ...]
  telegramChannel: string;     // "@protradingskills" or "@bobbyagentraderbot"
  language: string;            // "es" or "en"
  logoText: string;            // "DANY AGENT TRADER" or "BOBBY AGENT TRADER"
  isWhiteLabel: boolean;
}

const DEFAULT_THEME: WhiteLabelTheme = {
  agentName: 'BOBBY',
  brandName: 'DeFi México',
  primaryColor: '#22C55E',
  primaryColorRgb: '34,197,94',
  bgColor: '#050505',
  surfaceColor: '#131313',
  accentText: 'text-green-400',
  accentBg: 'bg-green-500',
  accentBorder: 'border-green-500',
  accentGlow: 'rgba(34,197,94,0.1)',
  markets: ['BTC', 'ETH', 'SOL', 'NVDA', 'AAPL', 'TSLA'],
  telegramChannel: '@bobbyagentraderbot',
  language: 'es',
  logoText: 'BOBBY AGENT TRADER',
  isWhiteLabel: false,
};

export const PTS_THEME: WhiteLabelTheme = {
  agentName: 'DANY',
  brandName: 'Pro Trading Skills',
  primaryColor: '#F8CF2C',
  primaryColorRgb: '248,207,44',
  bgColor: '#11121e',
  surfaceColor: '#1e1f2b',
  accentText: 'text-amber-400',
  accentBg: 'bg-amber-500',
  accentBorder: 'border-amber-500',
  accentGlow: 'rgba(248,207,44,0.1)',
  markets: ['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA', 'META', 'BTC', 'ETH', 'EUR/USD', 'GOLD'],
  telegramChannel: '@protradingskills',
  language: 'es',
  logoText: 'DANY AGENT TRADER',
  isWhiteLabel: true,
};

const WhiteLabelContext = createContext<WhiteLabelTheme>(DEFAULT_THEME);

export function WhiteLabelProvider({ theme, children }: { theme: WhiteLabelTheme; children: ReactNode }) {
  return (
    <WhiteLabelContext.Provider value={theme}>
      {children}
    </WhiteLabelContext.Provider>
  );
}

export function useWhiteLabel(): WhiteLabelTheme {
  return useContext(WhiteLabelContext);
}
