// ============================================================
// AgentRadarLanding — Progressive disclosure landing for Agent Radar
// With personalized AI advisor onboarding + greeting messages
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, TrendingUp, Search, Zap, Bot, ChevronRight, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PixelLobster } from '@/components/ui/pixel-icons';
import { useSmartMoneyScan } from '@/hooks/useSmartMoneyScan';
import { DiscoverPanel } from './DiscoverPanel';
import { AnalyzePanel } from './AnalyzePanel';
import { ExecutePanel } from './ExecutePanel';
import { OKXTickerStrip } from './OKXTickerStrip';
import { AgentDashboard } from './AgentDashboard';
import { AdvisorSetup, useAdvisorProfile } from './AdvisorSetup';
import type { AdvisorProfile } from './AdvisorSetup';

// ---- Greeting message fetcher ----

const SB_URL = import.meta.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';

interface GreetingMessage {
  id: string;
  advisor_name: string;
  message: string;
  created_at: string;
  read: boolean;
}

async function fetchGreetings(wallet: string): Promise<GreetingMessage[]> {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/agent_messages?wallet_address=eq.${wallet}&order=created_at.desc&limit=5`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---- Typewriter effect for greeting ----

function TypewriterText({ text, speed = 12, onDone }: { text: string; speed?: number; onDone?: () => void }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const indexRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastRef = useRef(0);

  // Skip animation on click
  const skip = useCallback(() => {
    if (!done) {
      setDisplayed(text);
      setDone(true);
      onDone?.();
    }
  }, [done, text, onDone]);

  useEffect(() => {
    indexRef.current = 0;
    lastRef.current = 0;
    setDisplayed('');
    setDone(false);

    const step = (ts: number) => {
      if (!lastRef.current) lastRef.current = ts;
      const elapsed = ts - lastRef.current;

      if (elapsed >= speed) {
        const charsToAdd = Math.min(Math.floor(elapsed / speed), 3); // max 3 chars per frame for smoothness
        const nextIdx = Math.min(indexRef.current + charsToAdd, text.length);
        indexRef.current = nextIdx;
        lastRef.current = ts;
        setDisplayed(text.slice(0, nextIdx));

        if (nextIdx >= text.length) {
          setDone(true);
          onDone?.();
          return;
        }
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [text, speed, onDone]);

  return (
    <div onClick={skip} className="cursor-pointer">
      <span>{displayed}</span>
      {!done && (
        <span className="inline-block w-[6px] h-[14px] bg-green-400 ml-[1px] align-middle animate-pulse" />
      )}
    </div>
  );
}

// ---- Component ----

interface Props {
  onSwitchToAdvanced: (mode?: string) => void;
}

export function AgentRadarLanding({ onSwitchToAdvanced }: Props) {
  const scan = useSmartMoneyScan({ autoStart: true, walletCount: 50 });
  const { profile, needsSetup, saveNewProfile, isConnected } = useAdvisorProfile();
  const [showSetup, setShowSetup] = useState(false);
  const [greetings, setGreetings] = useState<GreetingMessage[]>([]);
  const [expandedGreeting, setExpandedGreeting] = useState<string | null>(null);
  const [typewriterDone, setTypewriterDone] = useState(false);
  const seenGreetingRef = useRef<string | null>(null);

  // Show setup when wallet connects and no profile exists
  useEffect(() => {
    if (needsSetup) setShowSetup(true);
  }, [needsSetup]);

  // Fetch greetings when profile is loaded
  useEffect(() => {
    if (!profile?.walletAddress) return;
    fetchGreetings(profile.walletAddress).then(g => {
      setGreetings(g);
      // Reset typewriter if new greeting arrived
      if (g.length > 0 && g[0].id !== seenGreetingRef.current) {
        seenGreetingRef.current = g[0].id;
        setTypewriterDone(false);
      }
    });
  }, [profile?.walletAddress]);

  const handleSetupComplete = (p: AdvisorProfile) => {
    saveNewProfile(p);
    setShowSetup(false);
  };

  return (
    <div className="min-h-screen" style={{ background: '#0a0a0a' }}>
      {/* Onboarding overlay */}
      {showSetup && <AdvisorSetup onComplete={handleSetupComplete} />}

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Link to="/agentic-world" className="text-neutral-600 hover:text-neutral-400 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
              <PixelLobster size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-neutral-100">
                {profile ? `${profile.advisorName}` : 'Agent Radar'}
              </h1>
              <p className="text-xs text-neutral-500">
                {profile ? `AI advisor for ${profile.userName}` : 'AI-powered market intelligence'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Setup / Edit profile button */}
            {isConnected && profile && (
              <button
                onClick={() => setShowSetup(true)}
                className="text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors"
              >
                Edit
              </button>
            )}
            {isConnected && !profile && (
              <button
                onClick={() => setShowSetup(true)}
                className="flex items-center gap-1 text-xs text-green-400/60 hover:text-green-400 transition-colors bg-green-500/10 px-3 py-1.5 rounded-lg"
              >
                Setup Advisor
              </button>
            )}
            <button
              onClick={() => onSwitchToAdvanced()}
              className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              Advanced View
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* ADVISOR GREETING — Latest message from your AI advisor */}
        {profile && greetings.length > 0 && (
          <div className="mb-6">
            <div className="bg-[#131313] border border-green-500/20 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-green-500/15 border border-green-500/30 flex items-center justify-center">
                  <span className="text-green-400 text-sm font-bold">
                    {profile.advisorName[0]?.toUpperCase()}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-green-400">{profile.advisorName}</div>
                  <div className="text-[10px] text-neutral-500">{timeAgo(greetings[0].created_at)}</div>
                </div>
                {greetings.length > 1 && (
                  <div className="flex items-center gap-1 text-[10px] text-neutral-600">
                    <MessageSquare className="w-3 h-3" />
                    {greetings.length} messages
                  </div>
                )}
              </div>

              {/* Latest greeting — typewriter on first view, static after */}
              <div className="text-sm text-green-300/90 leading-relaxed whitespace-pre-line font-mono">
                {(() => {
                  const clean = greetings[0].message.replace(/\*/g, '').replace(/_/g, '');
                  const isExpanded = expandedGreeting === greetings[0].id;
                  const preview = clean.split('\n').slice(0, 6).join('\n') + (clean.split('\n').length > 6 ? '\n...' : '');
                  const content = isExpanded ? clean : preview;

                  if (typewriterDone) {
                    return (
                      <div
                        className="cursor-pointer"
                        onClick={() => setExpandedGreeting(isExpanded ? null : greetings[0].id)}
                      >
                        {content}
                        {!isExpanded && clean.split('\n').length > 6 && (
                          <span className="text-green-400/40 text-xs ml-1">[click to expand]</span>
                        )}
                      </div>
                    );
                  }

                  return (
                    <TypewriterText
                      text={preview}
                      speed={8}
                      onDone={() => setTypewriterDone(true)}
                    />
                  );
                })()}
              </div>

              {/* Older messages */}
              {greetings.length > 1 && expandedGreeting === greetings[0].id && (
                <div className="mt-4 pt-4 border-t border-neutral-800 space-y-3">
                  {greetings.slice(1, 3).map(g => (
                    <div key={g.id} className="text-xs text-neutral-500 leading-relaxed font-mono">
                      <span className="text-neutral-600">{timeAgo(g.created_at)}</span>
                      <span className="text-neutral-700 mx-1">—</span>
                      {g.message.replace(/\*/g, '').replace(/_/g, '').split('\n').slice(2, 4).join(' ')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* OKX Live Ticker Strip */}
        <div className="mb-5 -mt-2">
          <OKXTickerStrip />
        </div>

        {/* ======== AUTONOMOUS AGENT (ADAMS) — PRIMARY SECTION ======== */}
        <div className="mb-6">
          <div className="bg-[#131313] border border-green-500/20 rounded-2xl p-5">
            <AgentDashboard
              advisorName={profile?.advisorName}
              scanIntervalHours={profile?.scanIntervalHours}
              onCycleComplete={() => {
                if (profile?.walletAddress) {
                  setTypewriterDone(false);
                  fetchGreetings(profile.walletAddress).then(g => {
                    setGreetings(g);
                    if (g.length > 0) {
                      seenGreetingRef.current = g[0].id;
                    }
                  });
                }
              }}
            />
          </div>
        </div>

        {/* ======== DISCOVER — Smart Money Trends ======== */}
        <div className="mb-6">
          <div className="bg-[#131313] border border-neutral-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-green-400" />
              </div>
              <div>
                <h2 className="text-sm font-medium text-neutral-200">Discover</h2>
                <p className="text-[11px] text-neutral-500">What's trending in smart money?</p>
              </div>
              {scan.markets.length > 0 && (
                <span className="ml-auto text-[10px] text-green-400/60 bg-green-400/5 px-2 py-1 rounded-lg">
                  {scan.markets.length} markets · {scan.leaderboard.length} traders
                </span>
              )}
            </div>

            <DiscoverPanel
              markets={scan.sortedMarkets}
              whaleSignals={scan.whaleSignals}
              loading={scan.loading}
              progress={scan.progress}
              agentLog={scan.agentLog}
            />

            {!scan.loading && scan.markets.length > 0 && (
              <div className="mt-3 flex items-center justify-between">
                <button
                  onClick={() => scan.startScan()}
                  className="text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  Rescan
                </button>
                <button
                  onClick={() => onSwitchToAdvanced('smartmoney')}
                  className="text-[11px] text-green-400/50 hover:text-green-400 transition-colors"
                >
                  See all {scan.markets.length} markets →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ======== ANALYZE + EXECUTE ======== */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2 bg-[#131313] border border-neutral-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <Search className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-sm font-medium text-neutral-200">Analyze</h2>
                <p className="text-[11px] text-neutral-500">Deep dive any market</p>
              </div>
            </div>
            <AnalyzePanel onSwitchToAdvanced={() => onSwitchToAdvanced('market')} />
          </div>

          <div className="md:col-span-3 bg-[#131313] border border-neutral-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Zap className="w-4 h-4 text-green-400" />
              </div>
              <div>
                <h2 className="text-sm font-medium text-neutral-200">Execute</h2>
                <p className="text-[11px] text-neutral-500">Real on-chain swaps</p>
              </div>
            </div>
            <ExecutePanel />
          </div>
        </div>

        {/* Footer badge */}
        <div className="flex items-center justify-center flex-wrap gap-3 mt-8 text-[11px] text-neutral-600">
          <span>Powered by</span>
          <span className="font-bold text-neutral-400">OKX</span>
          <span className="text-neutral-700">·</span>
          <span>X Layer</span>
          <span className="text-neutral-700">·</span>
          <span>DEX Aggregator</span>
          <span className="text-neutral-700">·</span>
          <span>OnchainOS</span>
          <span className="text-neutral-700">·</span>
          <span>Agent Trade Kit</span>
          <span className="text-neutral-700">·</span>
          <span>Polymarket API</span>
          <span className="text-neutral-700">·</span>
          <span>Claude AI</span>
        </div>
      </div>
    </div>
  );
}
