// ============================================================
// AdvisorSetup — Iron Man-style AI advisor onboarding
// 4 steps: Your Name → Name Your Advisor → Pick Categories → Language
// Stores the profile locally. Remote sync must go through a wallet-signed API.
// ============================================================

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import {
  Wallet, ArrowRight, Sparkles, TrendingUp, BarChart3,
  Globe, Gem, Bot, LineChart, Brain, Landmark, Layers, Languages,
} from 'lucide-react';
import { lang as interfaceLanguage, speechLocale, setLang, setLocale, t as ui, type Lang } from '@/lib/companions/i18n';
import { appLocale } from '@/lib/app-language';
import { PixelLobster } from '@/components/ui/pixel-icons';

// ---- Types ----

export interface AdvisorProfile {
  walletAddress: string;
  userName: string;
  advisorName: string;
  categories: string[];
  language: Lang;
  locale?: string;
  scanIntervalHours: number;
}

// ---- Constants ----

const ADVISOR_SUGGESTIONS = ['Bobby', 'Axe', 'Jarvis', 'Oracle', 'Satoshi', 'Alpha'];

const CATEGORIES = [
  { key: 'crypto',       label: ui('Crypto', "Cripto"),              icon: Gem },
  { key: 'defi',         label: 'DeFi',                icon: Layers },
  { key: 'stocks',       label: ui('Stocks', "Acciones"),              icon: TrendingUp },
  { key: 'forex',        label: ui('Forex', "Divisas"),               icon: Globe },
  { key: 'prediction',   label: ui('Prediction Markets', "Mercados de predicción"),  icon: BarChart3 },
  { key: 'ai_agents',    label: ui('AI Agents', "Agentes de IA"),           icon: Bot },
  { key: 'nfts',         label: 'NFTs',                icon: Sparkles },
  { key: 'macro',        label: ui('Macro', "Macro"),               icon: Landmark },
  { key: 'trading',      label: ui('Trading', "Trading"),             icon: LineChart },
];

const LS_KEY = 'agent_radar_profile';

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

// ---- Hook ----

export function useAdvisorProfile() {
  const { address, isConnected } = useAccount();
  const [profile, setProfile] = useState<AdvisorProfile | null>(loadProfile);

  // Profiles stay local until the legacy radar has a wallet-signed sync API.
  useEffect(() => {
    if (!isConnected || !address) return;

    const local = loadProfile();
    if (local && local.walletAddress === address.toLowerCase()) {
      setProfile(local);
      return;
    }
    setProfile(null);
  }, [isConnected, address]);

  const saveNewProfile = (p: AdvisorProfile) => {
    saveProfile(p);
    setProfile(p);
  };

  const needsSetup = isConnected && !profile;

  return { profile, needsSetup, loading: false, saveNewProfile, isConnected };
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
  const [language, setLanguage] = useState<Lang>(interfaceLanguage);
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
      advisorName: advisorName.trim() || 'Bobby',
      categories,
      language,
      locale: appLocale(language, speechLocale()),
      scanIntervalHours: scanInterval,
    };
    setLang(language);
    setLocale(profile.locale!);
    const url = new URL(window.location.href);
    url.searchParams.set('lang', language);
    url.searchParams.delete('locale');
    window.history.replaceState({}, '', url.toString());
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
              <h2 className="text-2xl font-bold text-white mb-2">{ui("Welcome to Agent Radar", "Bienvenido a Agent Radar")}</h2>
              <p className="text-neutral-500 text-sm">{ui("Connect your wallet to set up your AI financial advisor", "Conecta tu wallet para configurar tu analista de IA")}</p>
            </div>
            <button
              onClick={() => openWallet()}
              className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2"
            >
              <Wallet className="w-5 h-5" />
              {ui("Connect Wallet", "Conectar wallet")}</button>
          </div>
        )}

        {/* STEP 1: Your name */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">{ui("What's your name?", "¿Cómo te llamas?")}</h2>
              <p className="text-neutral-500 text-sm">{ui("Your advisor will use this to greet you every morning", "Tu analista usará tu nombre para saludarte")}</p>
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
              {ui("Continue", "Continuar")}<ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 2: Name your advisor */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">{ui("Name your AI advisor", "Nombra a tu analista de IA")}</h2>
              <p className="text-neutral-500 text-sm">
                {ui("This is your personal financial intelligence agent", "Este es tu agente personal de análisis financiero")}</p>
            </div>

            <input
              type="text"
              value={advisorName}
              onChange={e => setAdvisorName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && advisorName.trim() && setStep(3)}
              placeholder="Bobby"
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
                      {ui(`Example preview: Hello ${userName || '…'}. Ask about an asset to begin a market read.`, `Vista de ejemplo: Hola ${userName || '…'}. Pregunta por un activo para comenzar una lectura de mercado.`)}
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
              {ui("Continue", "Continuar")}<ArrowRight className="w-4 h-4" />
            </button>

            <button onClick={() => setStep(1)} className="w-full text-center text-neutral-600 text-xs hover:text-neutral-400 transition-colors">
              {ui("Back", "Volver")}</button>
          </div>
        )}

        {/* STEP 3: Categories */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">{ui("What interests you?", "¿Qué te interesa?")}</h2>
              <p className="text-neutral-500 text-sm">
                {ui(`Pick 3 categories for ${advisorName}`, `Elige 3 categorías para ${advisorName}`)}
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
              {ui("Continue", "Continuar")}<ArrowRight className="w-4 h-4" />
            </button>

            <button onClick={() => setStep(2)} className="w-full text-center text-neutral-600 text-xs hover:text-neutral-400 transition-colors">
              {ui("Back", "Volver")}</button>
          </div>
        )}

        {/* STEP 4: Language */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">{ui("Choose your language", "Elige tu idioma")}</h2>
              <p className="text-neutral-500 text-sm">
                {ui(`${advisorName} will communicate in this language`, `${advisorName} se comunicará en este idioma`)}
              </p>
            </div>

            <div className="space-y-3">
              {[
                { code: 'es', label: 'Español', flag: '🇲🇽', desc: 'Tu asesor hablará en español' },
                { code: 'en', label: 'English', flag: '🇺🇸', desc: 'Your advisor will speak English' },
                { code: 'pt', label: 'Português', flag: appLocale('pt', speechLocale()) === 'pt-BR' ? '🇧🇷' : '🇵🇹', desc: 'Seu assessor falará em português' },
                { code: 'fr', label: 'Français', flag: '🇫🇷', desc: 'Votre conseiller parlera français' },
                { code: 'it', label: 'Italiano', flag: '🇮🇹', desc: 'Il tuo consulente parlerà italiano' },
                { code: 'de', label: 'Deutsch', flag: '🇩🇪', desc: 'Dein Berater spricht Deutsch' },
              ].map(lang => (
                <button
                  key={lang.code}
                  onClick={() => setLanguage(lang.code as Lang)}
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
              {ui("Continue", "Continuar")}<ArrowRight className="w-4 h-4" />
            </button>

            <button onClick={() => setStep(3)} className="w-full text-center text-neutral-600 text-xs hover:text-neutral-400 transition-colors">
              {ui("Back", "Volver")}</button>
          </div>
        )}

        {/* STEP 5: Scan Interval */}
        {step === 5 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">{ui("Analysis frequency", "Frecuencia de análisis")}</h2>
              <p className="text-neutral-500 text-sm">
                {ui(`Preferred analysis interval for ${advisorName}`, `Intervalo de análisis preferido para ${advisorName}`)}
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
                {ui(`Preferred scan interval: ${scanInterval} h. This local preference does not schedule background work.`, `Intervalo preferido: ${scanInterval} h. Esta preferencia local no programa tareas en segundo plano.`)}
              </div>
            </div>

            <button
              onClick={handleComplete}
              className="w-full py-4 bg-green-500 text-black font-bold rounded-xl hover:bg-green-400 transition-colors flex items-center justify-center gap-2"
            >
              <Brain className="w-5 h-5" />
              {ui("Launch", "Iniciar")}{advisorName || 'Advisor'}
            </button>

            <button onClick={() => setStep(4)} className="w-full text-center text-neutral-600 text-xs hover:text-neutral-400 transition-colors">
              {ui("Back", "Volver")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
