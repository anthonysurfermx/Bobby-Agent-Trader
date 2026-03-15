// ============================================================
// AdvisorSetup — Iron Man-style AI advisor onboarding
// 4 steps: Your Name → Name Your Advisor → Pick Categories → Language
// Stores profile in Supabase + localStorage
// ============================================================

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import {
  Wallet, ArrowRight, Sparkles, TrendingUp, BarChart3,
  Globe, Gem, Bot, LineChart, Brain, Landmark, Layers, Languages,
} from 'lucide-react';
import { PixelLobster } from '@/components/ui/pixel-icons';

// ---- Types ----

export interface AdvisorProfile {
  walletAddress: string;
  userName: string;
  advisorName: string;
  categories: string[];
  language: string;
  scanIntervalHours: number;
}

// ---- Constants ----

const ADVISOR_SUGGESTIONS = ['Adams', 'Jarvis', 'Friday', 'Oracle', 'Satoshi', 'Alpha'];

const CATEGORIES = [
  { key: 'crypto',       label: 'Crypto',              icon: Gem },
  { key: 'defi',         label: 'DeFi',                icon: Layers },
  { key: 'stocks',       label: 'Stocks',              icon: TrendingUp },
  { key: 'forex',        label: 'Forex',               icon: Globe },
  { key: 'prediction',   label: 'Prediction Markets',  icon: BarChart3 },
  { key: 'ai_agents',    label: 'AI Agents',           icon: Bot },
  { key: 'nfts',         label: 'NFTs',                icon: Sparkles },
  { key: 'macro',        label: 'Macro',               icon: Landmark },
  { key: 'trading',      label: 'Trading',             icon: LineChart },
];

const LS_KEY = 'agent_radar_profile';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';

// ---- Helpers ----

function loadProfile(): AdvisorProfile | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveProfile(profile: AdvisorProfile) {
  localStorage.setItem(LS_KEY, JSON.stringify(profile));
}

async function upsertProfileToSupabase(profile: AdvisorProfile) {
  try {
    // Try update first
    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/agent_profiles?wallet_address=eq.${profile.walletAddress}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          user_name: profile.userName,
          advisor_name: profile.advisorName,
          categories: profile.categories,
          language: profile.language,
          scan_interval_hours: profile.scanIntervalHours,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    // If no rows updated, insert
    if (updateRes.status === 200) {
      // Check if any rows were actually updated by trying a count
      const checkRes = await fetch(
        `${SUPABASE_URL}/rest/v1/agent_profiles?wallet_address=eq.${profile.walletAddress}&select=id`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const rows = await checkRes.json();
      if (Array.isArray(rows) && rows.length === 0) {
        // Insert new
        await fetch(`${SUPABASE_URL}/rest/v1/agent_profiles`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            wallet_address: profile.walletAddress,
            user_name: profile.userName,
            advisor_name: profile.advisorName,
            categories: profile.categories,
            language: profile.language,
            scan_interval_hours: profile.scanIntervalHours,
          }),
        });
      }
    }
  } catch (err) {
    console.warn('[AdvisorSetup] Supabase save failed:', err);
  }
}

async function fetchProfileFromSupabase(wallet: string): Promise<AdvisorProfile | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/agent_profiles?wallet_address=eq.${wallet}&select=*&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const r = rows[0];
    return {
      walletAddress: r.wallet_address,
      userName: r.user_name,
      advisorName: r.advisor_name,
      categories: r.categories,
      language: r.language,
      scanIntervalHours: r.scan_interval_hours || 8,
    };
  } catch { return null; }
}

// ---- Hook ----

export function useAdvisorProfile() {
  const { address, isConnected } = useAccount();
  const [profile, setProfile] = useState<AdvisorProfile | null>(loadProfile);
  const [loading, setLoading] = useState(false);

  // Sync from Supabase when wallet connects
  useEffect(() => {
    if (!isConnected || !address) return;

    const local = loadProfile();
    if (local && local.walletAddress === address.toLowerCase()) {
      setProfile(local);
      return;
    }

    // Try Supabase
    setLoading(true);
    fetchProfileFromSupabase(address.toLowerCase())
      .then(p => {
        if (p) {
          saveProfile(p);
          setProfile(p);
        }
      })
      .finally(() => setLoading(false));
  }, [isConnected, address]);

  const saveNewProfile = (p: AdvisorProfile) => {
    saveProfile(p);
    setProfile(p);
    upsertProfileToSupabase(p);
  };

  const needsSetup = isConnected && !profile;

  return { profile, needsSetup, loading, saveNewProfile, isConnected };
}

// ---- Component ----

interface Props {
  onComplete: (profile: AdvisorProfile) => void;
}

export function AdvisorSetup({ onComplete }: Props) {
  const { address, isConnected } = useAccount();
  const { open: openWallet } = useAppKit();

  const [step, setStep] = useState(0); // 0=connect, 1=your name, 2=advisor name, 3=categories, 4=language, 5=interval
  const [userName, setUserName] = useState('');
  const [advisorName, setAdvisorName] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [language, setLanguage] = useState('es');
  const [scanInterval, setScanInterval] = useState(8);

  // Auto-advance to step 1 when wallet connects
  useEffect(() => {
    if (isConnected && step === 0) setStep(1);
  }, [isConnected, step]);

  const toggleCategory = (key: string) => {
    setCategories(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : prev.length < 3 ? [...prev, key] : prev
    );
  };

  const handleComplete = () => {
    if (!address) return;
    const profile: AdvisorProfile = {
      walletAddress: address.toLowerCase(),
      userName: userName.trim() || 'Anon',
      advisorName: advisorName.trim() || 'Adams',
      categories,
      language,
      scanIntervalHours: scanInterval,
    };
    onComplete(profile);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
            <PixelLobster size={22} className="text-white" />
          </div>
          <span className="text-neutral-400 text-sm font-medium">Agent Radar</span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4, 5].map(s => (
            <div
              key={s}
              className={`h-1 rounded-full transition-all duration-300 ${
                s <= step
                  ? 'w-8 bg-green-400'
                  : 'w-4 bg-neutral-800'
              }`}
            />
          ))}
        </div>

        {/* STEP 0: Connect wallet */}
        {step === 0 && (
          <div className="space-y-6 text-center">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Welcome to Agent Radar</h2>
              <p className="text-neutral-500 text-sm">Connect your wallet to set up your AI financial advisor</p>
            </div>
            <button
              onClick={() => openWallet()}
              className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2"
            >
              <Wallet className="w-5 h-5" />
              Connect Wallet
            </button>
          </div>
        )}

        {/* STEP 1: Your name */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">What's your name?</h2>
              <p className="text-neutral-500 text-sm">Your advisor will use this to greet you every morning</p>
            </div>

            <input
              type="text"
              value={userName}
              onChange={e => setUserName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && userName.trim() && setStep(2)}
              placeholder="Anthony"
              autoFocus
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-4 text-lg text-white placeholder-neutral-600 outline-none focus:border-green-500/40 transition-colors text-center"
            />

            <button
              onClick={() => setStep(2)}
              disabled={!userName.trim()}
              className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-colors disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 2: Name your advisor */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">Name your AI advisor</h2>
              <p className="text-neutral-500 text-sm">
                This is your personal financial intelligence agent
              </p>
            </div>

            <input
              type="text"
              value={advisorName}
              onChange={e => setAdvisorName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && advisorName.trim() && setStep(3)}
              placeholder="Adams"
              autoFocus
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-4 text-lg text-white placeholder-neutral-600 outline-none focus:border-green-500/40 transition-colors text-center"
            />

            {/* Suggestions */}
            <div className="flex flex-wrap justify-center gap-2">
              {ADVISOR_SUGGESTIONS.map(name => (
                <button
                  key={name}
                  onClick={() => setAdvisorName(name)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    advisorName === name
                      ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                      : 'bg-neutral-900 text-neutral-500 border border-neutral-800 hover:text-neutral-300 hover:border-neutral-700'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>

            {/* Preview */}
            {advisorName.trim() && (
              <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-500/15 border border-green-500/30 flex items-center justify-center shrink-0">
                    <span className="text-green-400 text-sm font-bold">
                      {advisorName.trim()[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="text-[11px] text-green-400/60 mb-0.5">{advisorName.trim()}</div>
                    <div className="text-sm text-neutral-300">
                      Buenos días {userName || 'there'}! The market is showing interesting signals today.
                      I detected 3 whale movements on Solana worth $45K...
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => setStep(3)}
              disabled={!advisorName.trim()}
              className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-colors disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>

            <button onClick={() => setStep(1)} className="w-full text-center text-neutral-600 text-xs hover:text-neutral-400 transition-colors">
              Back
            </button>
          </div>
        )}

        {/* STEP 3: Categories */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">What interests you?</h2>
              <p className="text-neutral-500 text-sm">
                Pick 3 categories — {advisorName} will focus on these
              </p>
              <div className={`mt-2 text-sm font-medium ${categories.length === 3 ? 'text-green-400' : 'text-neutral-600'}`}>
                {categories.length} / 3
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map(cat => {
                const selected = categories.includes(cat.key);
                const disabled = !selected && categories.length >= 3;
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.key}
                    onClick={() => toggleCategory(cat.key)}
                    disabled={disabled}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border transition-all ${
                      selected
                        ? 'bg-white text-black border-white'
                        : disabled
                        ? 'bg-neutral-900/40 text-neutral-700 border-neutral-800/50 cursor-not-allowed'
                        : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:border-neutral-600 hover:text-neutral-200'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[10px] font-medium leading-tight text-center">{cat.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setStep(4)}
              disabled={categories.length !== 3}
              className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-colors disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>

            <button onClick={() => setStep(2)} className="w-full text-center text-neutral-600 text-xs hover:text-neutral-400 transition-colors">
              Back
            </button>
          </div>
        )}

        {/* STEP 4: Language */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">Choose your language</h2>
              <p className="text-neutral-500 text-sm">
                {advisorName} will communicate in this language
              </p>
            </div>

            <div className="space-y-3">
              {[
                { code: 'es', label: 'Español', flag: '🇲🇽', desc: 'Tu asesor hablará en español' },
                { code: 'en', label: 'English', flag: '🇺🇸', desc: 'Your advisor will speak English' },
                { code: 'pt', label: 'Português', flag: '🇧🇷', desc: 'Seu assessor falará em português' },
              ].map(lang => (
                <button
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    language === lang.code
                      ? 'bg-white text-black border-white'
                      : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:border-neutral-600 hover:text-neutral-200'
                  }`}
                >
                  <span className="text-2xl">{lang.flag}</span>
                  <div className="text-left">
                    <div className="font-medium">{lang.label}</div>
                    <div className={`text-xs ${language === lang.code ? 'text-neutral-500' : 'text-neutral-600'}`}>
                      {lang.desc}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setStep(5)}
              className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>

            <button onClick={() => setStep(3)} className="w-full text-center text-neutral-600 text-xs hover:text-neutral-400 transition-colors">
              Back
            </button>
          </div>
        )}

        {/* STEP 5: Scan Interval */}
        {step === 5 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">Analysis frequency</h2>
              <p className="text-neutral-500 text-sm">
                How often should {advisorName} scan the market?
              </p>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {[4, 8, 12, 16, 20].map(hours => (
                <button
                  key={hours}
                  onClick={() => setScanInterval(hours)}
                  className={`flex flex-col items-center gap-1 py-4 rounded-xl border transition-all ${
                    scanInterval === hours
                      ? 'bg-white text-black border-white'
                      : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:border-neutral-600 hover:text-neutral-200'
                  }`}
                >
                  <span className="text-lg font-bold">{hours}h</span>
                  <span className={`text-[9px] ${scanInterval === hours ? 'text-neutral-500' : 'text-neutral-600'}`}>
                    {hours === 4 ? 'Aggressive' : hours === 8 ? 'Standard' : hours === 12 ? 'Balanced' : hours === 16 ? 'Relaxed' : 'Passive'}
                  </span>
                </button>
              ))}
            </div>

            {/* Preview */}
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
              <div className="text-xs text-neutral-400 text-center">
                {advisorName} {language === 'es' ? 'analizará el mercado' : language === 'pt' ? 'analisará o mercado' : 'will analyze the market'}{' '}
                <span className="text-green-400 font-bold">{Math.floor(24 / scanInterval)}x</span>{' '}
                {language === 'es' ? 'al día' : language === 'pt' ? 'por dia' : 'per day'}
                {scanInterval === 4 && (
                  <span className="block mt-1 text-amber-400/60 text-[10px]">
                    {language === 'es' ? 'Más análisis = más oportunidades detectadas' : language === 'pt' ? 'Mais análises = mais oportunidades detectadas' : 'More scans = more opportunities detected'}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={handleComplete}
              className="w-full py-4 bg-green-500 text-black font-bold rounded-xl hover:bg-green-400 transition-colors flex items-center justify-center gap-2"
            >
              <Brain className="w-5 h-5" />
              Launch {advisorName || 'Advisor'}
            </button>

            <button onClick={() => setStep(4)} className="w-full text-center text-neutral-600 text-xs hover:text-neutral-400 transition-colors">
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
