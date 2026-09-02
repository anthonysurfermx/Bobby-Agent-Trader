// ============================================================
// TradingRoom Context — "Your Trading Room" vs "Bobby's Room"
// Single source of truth for user identity across all Bobby pages
// Uses wallet_address from wagmi as primary key
// ============================================================

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAccount } from 'wagmi';
import { useBobbySession } from '@/hooks/useBobbySession';
import { sessionFetch } from '@/lib/bobby-session';


export interface AgentProfile {
  id: string;
  wallet_address: string;
  agent_name: string;
  personality: 'analytical' | 'direct' | 'wise';
  markets: string[];
  cadence_hours: number;
  delivery: string[];
  status: string;
  last_run_at: string | null;
  next_run_at: string | null;
}

export type RoomMode = 'global' | 'personal';

export interface TradingRoomContextType {
  wallet: string | null;
  profile: AgentProfile | null;
  profileId: string | null;
  hasAgent: boolean;
  roomMode: RoomMode;
  setRoomMode: (mode: RoomMode) => void;
  loading: boolean;
  refreshProfile: () => void;
  // Personality color helpers
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  accentGlow: string;
}

const TradingRoomContext = createContext<TradingRoomContextType>({
  wallet: null,
  profile: null,
  profileId: null,
  hasAgent: false,
  roomMode: 'global',
  setRoomMode: () => {},
  loading: true,
  refreshProfile: () => {},
  accentColor: 'text-green-400',
  accentBg: 'bg-green-500/15',
  accentBorder: 'border-green-500/20',
  accentGlow: 'shadow-[0_0_15px_rgba(74,222,128,0.1)]',
});

// Personality → color mapping
const PERSONALITY_COLORS: Record<string, { color: string; bg: string; border: string; glow: string; hex: string }> = {
  analytical: {
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/15',
    border: 'border-yellow-500/20',
    glow: 'shadow-[0_0_15px_rgba(234,179,8,0.1)]',
    hex: '#EAB308',
  },
  direct: {
    color: 'text-orange-400',
    bg: 'bg-orange-500/15',
    border: 'border-orange-500/20',
    glow: 'shadow-[0_0_15px_rgba(249,115,22,0.1)]',
    hex: '#F97316',
  },
  wise: {
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/15',
    border: 'border-indigo-500/20',
    glow: 'shadow-[0_0_15px_rgba(99,102,241,0.1)]',
    hex: '#6366F1',
  },
};

const DEFAULT_COLORS = {
  color: 'text-green-400',
  bg: 'bg-green-500/15',
  border: 'border-green-500/20',
  glow: 'shadow-[0_0_15px_rgba(74,222,128,0.1)]',
  hex: '#4ADE80',
};

export function TradingRoomProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  // One signature per wallet per week proves ownership for personal data.
  const { ready: sessionReady } = useBobbySession({ auto: true });
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [roomMode, setRoomMode] = useState<RoomMode>('global');
  const [loading, setLoading] = useState(true);

  const wallet = isConnected && address ? address.toLowerCase() : null;

  const fetchProfile = useCallback(async () => {
    if (!wallet) {
      setProfile(null);
      setRoomMode('global');
      setLoading(false);
      return;
    }

    try {
      // agent_profiles is no longer readable with the anon key: the API
      // returns only the session wallet's own row.
      const res = await sessionFetch(wallet, '/api/agent-setup');
      if (!res) { setLoading(false); return; } // no session yet — retried when it arrives
      const data = await res.json();
      const rows = data && data.profile ? [data.profile] : [];
      if (Array.isArray(rows) && rows.length > 0) {
        setProfile(rows[0]);
        // Auto-switch to personal if agent exists
        setRoomMode('personal');
        // Cache name in localStorage for KineticShell header
        try {
          localStorage.setItem('bobby_agent_name', rows[0].agent_name);
          localStorage.setItem('agent_profile', JSON.stringify(rows[0]));
        } catch {}
      } else {
        setProfile(null);
        setRoomMode('global');
      }
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile, sessionReady]);

  // Reset when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      setProfile(null);
      setRoomMode('global');
    }
  }, [isConnected]);

  const hasAgent = !!profile && profile.status !== 'deploying';
  const personality = profile?.personality || 'analytical';
  const colors = roomMode === 'personal' && hasAgent
    ? (PERSONALITY_COLORS[personality] || DEFAULT_COLORS)
    : DEFAULT_COLORS;

  return (
    <TradingRoomContext.Provider
      value={{
        wallet,
        profile,
        profileId: profile?.id || null,
        hasAgent,
        roomMode,
        setRoomMode,
        loading,
        refreshProfile: fetchProfile,
        accentColor: colors.color,
        accentBg: colors.bg,
        accentBorder: colors.border,
        accentGlow: colors.glow,
      }}
    >
      {children}
    </TradingRoomContext.Provider>
  );
}

export function useTradingRoom() {
  return useContext(TradingRoomContext);
}
