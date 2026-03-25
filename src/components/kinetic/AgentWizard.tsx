// ============================================================
// AgentWizard — 6-step onboarding for Personal Agent Room
// Step 1: Risk Disclaimer
// Step 2: Name Your Agent
// Step 3: Voice Selection
// Step 4: Market Selection (with live prices)
// Step 5: Frequency + Delivery
// Step 6: Deploy Animation
// ============================================================

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ChevronLeft, Play, Check } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';

interface AgentConfig {
  agent_name: string;
  voice: 'male' | 'female';
  personality: 'direct' | 'analytical' | 'wise';
  cadence_hours: number;
  markets: string[];
  delivery: string[];
}

interface AgentWizardProps {
  onComplete: (config: AgentConfig) => void;
  onSkip: () => void;
}

const SUGGESTED_NAMES = ['ATLAS', 'NEXUS', 'CIPHER', 'STORM', 'PHANTOM', 'ORION'];

const MARKET_CATEGORIES = {
  CRYPTO: [
    { id: 'BTC', label: '$BTC', name: 'Bitcoin' },
    { id: 'ETH', label: '$ETH', name: 'Ethereum' },
    { id: 'SOL', label: '$SOL', name: 'Solana' },
    { id: 'DOGE', label: '$DOGE', name: 'Dogecoin' },
    { id: 'XRP', label: '$XRP', name: 'Ripple' },
  ],
  STOCKS: [
    { id: 'NVDA', label: '$NVDA', name: 'NVIDIA' },
    { id: 'TSLA', label: '$TSLA', name: 'Tesla' },
    { id: 'AAPL', label: '$AAPL', name: 'Apple' },
    { id: 'SPY', label: '$SPY', name: 'S&P 500' },
  ],
  MACRO: [
    { id: 'XAUT', label: 'GOLD', name: 'Gold' },
    { id: 'XAG', label: 'SILVER', name: 'Silver' },
  ],
};

const CADENCE_OPTIONS = [
  { value: 4, label: 'Every 4 hours', desc: 'Intense — 6 reports/day' },
  { value: 6, label: 'Every 6 hours', desc: 'Active — 4 reports/day' },
  { value: 12, label: 'Every 12 hours', desc: 'Moderate — 2 reports/day' },
  { value: 24, label: 'Every 24 hours', desc: 'Daily digest' },
];

const DEPLOY_STEPS = [
  'Initializing neural weights...',
  'Connecting to OKX X Layer...',
  'Scanning selected markets...',
  'Generating first strategic briefing...',
];

export default function AgentWizard({ onComplete, onSkip }: AgentWizardProps) {
  const { address, isConnected } = useAccount();
  const { open: openWallet } = useAppKit();

  const [step, setStep] = useState(0);
  const [riskAccepted, setRiskAccepted] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [voice, setVoice] = useState<'male' | 'female'>('male');
  const [personality, setPersonality] = useState<'direct' | 'analytical' | 'wise'>('analytical');
  const [markets, setMarkets] = useState<string[]>(['BTC']);
  const [marketTab, setMarketTab] = useState<'CRYPTO' | 'STOCKS' | 'MACRO'>('CRYPTO');
  const [cadence, setCadence] = useState(6);
  const [delivery, setDelivery] = useState<string[]>(['web']);
  const [language, setLanguage] = useState(navigator.language.startsWith('es') ? 'es' : navigator.language.startsWith('pt') ? 'pt' : 'en');
  const [deploying, setDeploying] = useState(false);
  const [deployStep, setDeployStep] = useState(0);
  const [prices, setPrices] = useState<Record<string, number>>({});

  // Fetch live prices for market selection
  useEffect(() => {
    fetch('/api/okx-tickers')
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          const p: Record<string, number> = {};
          for (const t of d.tickers) p[t.symbol] = t.last;
          setPrices(p);
        }
      })
      .catch(() => {});
  }, []);

  const toggleMarket = (id: string) => {
    setMarkets(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : prev.length < 5 ? [...prev, id] : prev
    );
  };

  const handleDeploy = () => {
    setDeploying(true);
    // Animate deploy steps
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDeployStep(i);
      if (i >= DEPLOY_STEPS.length) {
        clearInterval(interval);
        setTimeout(() => {
          onComplete({
            agent_name: agentName || 'BOBBY',
            voice,
            personality,
            cadence_hours: cadence,
            markets,
            delivery,
          });
        }, 1000);
      }
    }, 1500);
  };

  const canContinue = () => {
    switch (step) {
      case 0: return riskAccepted;
      case 1: return agentName.length >= 2;
      case 2: return true; // voice always selected
      case 3: return markets.length >= 1;
      case 4: return true;
      default: return true;
    }
  };

  const nextStep = () => {
    if (step < 5) setStep(step + 1);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-[#050505] flex flex-col">
      {/* Top bar with progress */}
      <div className="flex-shrink-0 border-b border-white/5">
        <div className="flex items-center justify-between px-5 h-12">
          {step > 0 && !deploying ? (
            <button onClick={() => setStep(step - 1)} className="text-white/30 hover:text-white/60 transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : <div />}
          <span className="font-mono text-[9px] text-white/25 tracking-widest">AGENT_TERMINAL // CONFIGURATION</span>
          {!deploying && (
            <button onClick={onSkip} className="font-mono text-[9px] text-white/20 hover:text-white/40 transition-colors">
              SKIP
            </button>
          )}
        </div>
        {/* Progress bar */}
        <div className="h-0.5 bg-white/[0.04]">
          <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${((step + 1) / 6) * 100}%` }} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }} className="w-full max-w-lg">

            {/* STEP 0: Risk Warning */}
            {step === 0 && (
              <div className="space-y-6 text-center">
                <div className="w-14 h-14 rounded bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-7 h-7 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight mb-2">PROTOCOL DISCLAIMER</h2>
                  <p className="text-sm text-white/40 leading-relaxed max-w-md mx-auto">
                    Bobby Agent Trader provides market intelligence — not financial advice. Your agent generates analysis and debates. You decide whether to act. You retain full control of your funds.
                  </p>
                </div>
                <label className="flex items-center gap-3 justify-center cursor-pointer group">
                  <input type="checkbox" checked={riskAccepted} onChange={e => setRiskAccepted(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-transparent accent-green-500" />
                  <span className="text-[11px] font-mono text-white/40 group-hover:text-white/60 transition-colors">
                    I understand and retain full control of my funds
                  </span>
                </label>
              </div>
            )}

            {/* STEP 1: Name Your Agent */}
            {step === 1 && (
              <div className="space-y-6 text-center">
                <div>
                  <span className="text-[9px] font-mono text-white/20 tracking-widest">STEP 1 OF 5</span>
                  <h2 className="text-xl font-black tracking-tight mt-2">NAME YOUR AGENT</h2>
                  <p className="text-[11px] font-mono text-white/30 mt-1">This will be the CIO of your personal trading room</p>
                </div>
                <input
                  type="text"
                  value={agentName}
                  onChange={e => setAgentName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 20))}
                  placeholder="ENTER DESIGNATION"
                  className="w-full bg-transparent border-b-2 border-white/10 focus:border-green-500 text-center text-3xl font-black font-mono tracking-wider py-4 outline-none transition-colors text-white placeholder:text-white/10"
                  autoFocus
                />
                <div className="flex flex-wrap gap-2 justify-center">
                  {SUGGESTED_NAMES.map(name => (
                    <button key={name} onClick={() => setAgentName(name)}
                      className={`px-3 py-1.5 text-[10px] font-mono tracking-wider border rounded transition-all ${
                        agentName === name
                          ? 'border-green-500/40 bg-green-500/10 text-green-400'
                          : 'border-white/[0.06] text-white/25 hover:text-white/50 hover:border-white/15'
                      }`}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 2: Voice */}
            {step === 2 && (
              <div className="space-y-6 text-center">
                <div>
                  <span className="text-[9px] font-mono text-white/20 tracking-widest">STEP 2 OF 5</span>
                  <h2 className="text-xl font-black tracking-tight mt-2">VOICE PROTOCOL</h2>
                  <p className="text-[11px] font-mono text-white/30 mt-1">Select voice synthesis for {agentName || 'your agent'}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {(['male', 'female'] as const).map(v => (
                    <button key={v} onClick={() => setVoice(v)}
                      className={`p-6 rounded border transition-all ${
                        voice === v
                          ? 'border-green-500/40 bg-green-500/[0.06]'
                          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                      }`}
                      style={voice === v ? { boxShadow: '0 0 15px rgba(0,255,102,0.1)' } : undefined}>
                      <div className="text-2xl mb-2">{v === 'male' ? '♂' : '♀'}</div>
                      <div className="text-sm font-bold uppercase">{v}</div>
                      <div className="flex items-center justify-center gap-1 mt-3 h-4">
                        {[3, 5, 2, 4, 6, 3, 5].map((h, i) => (
                          <div key={i} className={`w-1 rounded-full ${voice === v ? 'bg-green-500/60' : 'bg-white/10'}`}
                            style={{ height: `${h * 3}px` }} />
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 3: Markets */}
            {step === 3 && (
              <div className="space-y-5">
                <div className="text-center">
                  <span className="text-[9px] font-mono text-white/20 tracking-widest">STEP 3 OF 5</span>
                  <h2 className="text-xl font-black tracking-tight mt-2">TARGET MARKETS</h2>
                  <p className="text-[11px] font-mono text-white/30 mt-1">Select 1 to 5 markets for {agentName || 'your agent'} to analyze</p>
                </div>

                {/* Category tabs */}
                <div className="flex gap-1 justify-center">
                  {(Object.keys(MARKET_CATEGORIES) as Array<keyof typeof MARKET_CATEGORIES>).map(cat => (
                    <button key={cat} onClick={() => setMarketTab(cat)}
                      className={`px-4 py-1.5 text-[10px] font-mono tracking-wider rounded transition-all ${
                        marketTab === cat
                          ? 'bg-green-500/15 border border-green-500/30 text-green-400'
                          : 'bg-white/[0.02] border border-white/[0.04] text-white/30 hover:text-white/50'
                      }`}>
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Asset grid */}
                <div className="grid grid-cols-2 gap-2">
                  {MARKET_CATEGORIES[marketTab].map(asset => {
                    const selected = markets.includes(asset.id);
                    const price = prices[asset.id];
                    return (
                      <button key={asset.id} onClick={() => toggleMarket(asset.id)}
                        className={`flex items-center justify-between p-3 rounded border transition-all ${
                          selected
                            ? 'border-green-500/40 bg-green-500/[0.06]'
                            : markets.length >= 5
                            ? 'border-white/[0.04] bg-white/[0.01] opacity-40 cursor-not-allowed'
                            : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                        }`}>
                        <div className="text-left">
                          <div className="text-sm font-bold font-mono">{asset.label}</div>
                          <div className="text-[9px] text-white/25">{asset.name}</div>
                        </div>
                        <div className="text-right">
                          {price && <div className="text-[10px] font-mono text-white/40">${price.toLocaleString(undefined, { maximumFractionDigits: price < 1 ? 4 : 0 })}</div>}
                          {selected && <Check className="w-3.5 h-3.5 text-green-400 ml-auto mt-0.5" />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="text-center text-[10px] font-mono text-white/25">
                  {markets.length}/5 TARGETS ACQUIRED
                </div>
              </div>
            )}

            {/* STEP 4: Frequency + Delivery */}
            {step === 4 && (
              <div className="space-y-6">
                <div className="text-center">
                  <span className="text-[9px] font-mono text-white/20 tracking-widest">STEP 4 OF 5</span>
                  <h2 className="text-xl font-black tracking-tight mt-2">CADENCE & DELIVERY</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Frequency */}
                  <div>
                    <span className="text-[9px] font-mono text-white/25 tracking-widest block mb-3">ANALYSIS FREQUENCY</span>
                    <div className="space-y-2">
                      {CADENCE_OPTIONS.map(opt => (
                        <button key={opt.value} onClick={() => setCadence(opt.value)}
                          className={`w-full flex items-center justify-between p-3 rounded border transition-all text-left ${
                            cadence === opt.value
                              ? 'border-green-500/40 bg-green-500/[0.06]'
                              : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                          }`}>
                          <div>
                            <div className="text-sm font-bold">{opt.label}</div>
                            <div className="text-[9px] text-white/25 font-mono">{opt.desc}</div>
                          </div>
                          {cadence === opt.value && <Check className="w-4 h-4 text-green-400" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Language */}
                  <div>
                    <span className="text-[9px] font-mono text-white/25 tracking-widest block mb-3">AGENT LANGUAGE</span>
                    <div className="space-y-2">
                      {[
                        { code: 'es', label: 'Español', flag: '🇲🇽' },
                        { code: 'en', label: 'English', flag: '🇺🇸' },
                        { code: 'pt', label: 'Português', flag: '🇧🇷' },
                      ].map(l => (
                        <button key={l.code} onClick={() => { setLanguage(l.code); localStorage.setItem('bobby_lang', l.code); }}
                          className={`w-full flex items-center gap-3 p-3 rounded border transition-all text-left ${
                            language === l.code
                              ? 'border-green-500/40 bg-green-500/[0.06]'
                              : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                          }`}>
                          <span className="text-lg">{l.flag}</span>
                          <div className="text-sm font-bold">{l.label}</div>
                          {language === l.code && <Check className="w-4 h-4 text-green-400 ml-auto" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Delivery */}
                  <div>
                    <span className="text-[9px] font-mono text-white/25 tracking-widest block mb-3">DELIVERY CHANNELS</span>
                    <div className="space-y-2">
                      {[
                        { id: 'web', label: 'Web Terminal', desc: 'Always active', disabled: true, checked: true },
                        { id: 'telegram', label: 'Telegram', desc: 'Get reports in your chat', disabled: false, checked: delivery.includes('telegram') },
                        { id: 'email', label: 'Email', desc: 'Coming soon', disabled: true, checked: false },
                      ].map(ch => (
                        <button key={ch.id} onClick={() => {
                          if (ch.disabled) return;
                          setDelivery(prev => prev.includes(ch.id) ? prev.filter(d => d !== ch.id) : [...prev, ch.id]);
                        }}
                          className={`w-full flex items-center justify-between p-3 rounded border transition-all text-left ${
                            ch.disabled && !ch.checked ? 'border-white/[0.03] bg-white/[0.01] opacity-40' :
                            ch.checked ? 'border-green-500/30 bg-green-500/[0.04]' :
                            'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                          }`}>
                          <div>
                            <div className="text-sm font-bold">{ch.label}</div>
                            <div className="text-[9px] text-white/25 font-mono">{ch.desc}</div>
                          </div>
                          {ch.checked && <Check className="w-4 h-4 text-green-400" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: Deploy */}
            {step === 5 && (
              <div className="space-y-8 text-center">
                {!deploying ? (
                  <>
                    <div>
                      <span className="text-[9px] font-mono text-white/20 tracking-widest">STEP 5 OF 5</span>
                      <h2 className="text-xl font-black tracking-tight mt-2">READY TO LAUNCH</h2>
                    </div>

                    {/* Config summary */}
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded p-4 text-left space-y-2 font-mono text-[10px]">
                      {[
                        { label: 'AGENT:', value: agentName || 'BOBBY' },
                        { label: 'VOICE:', value: voice.toUpperCase() },
                        { label: 'MARKETS:', value: markets.join(', ') },
                        { label: 'CADENCE:', value: `Every ${cadence}h` },
                        { label: 'DELIVERY:', value: delivery.join(', ').toUpperCase() },
                        { label: 'WALLET:', value: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'NOT CONNECTED' },
                      ].map(row => (
                        <div key={row.label} className="flex justify-between">
                          <span className="text-white/30">{row.label}</span>
                          <span className="text-white/70">{row.value}</span>
                        </div>
                      ))}
                    </div>

                    <button onClick={handleDeploy}
                      className="w-full py-4 bg-green-500 text-black font-mono font-black text-sm tracking-widest hover:brightness-110 active:scale-[0.98] transition-all rounded"
                      style={{ boxShadow: '0 0 30px rgba(34,197,94,0.3)' }}>
                      DEPLOY {agentName || 'AGENT'}
                    </button>
                  </>
                ) : (
                  <div className="space-y-6">
                    <h2 className="text-xl font-black tracking-tight">DEPLOYING {agentName}...</h2>
                    <div className="space-y-3 text-left max-w-sm mx-auto">
                      {DEPLOY_STEPS.map((s, i) => (
                        <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: deployStep > i ? 1 : deployStep === i ? 0.6 : 0.2, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="flex items-center gap-3">
                          {deployStep > i ? (
                            <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                          ) : deployStep === i ? (
                            <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                          ) : (
                            <div className="w-4 h-4 border border-white/10 rounded-full flex-shrink-0" />
                          )}
                          <span className={`text-[11px] font-mono ${deployStep >= i ? 'text-green-400/80' : 'text-white/15'}`}>
                            {'> '}{s}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                    {deployStep >= DEPLOY_STEPS.length && (
                      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                        className="text-green-400 font-mono text-sm font-bold animate-pulse">
                        {agentName} IS LIVE
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom CTA (not on deploy step or when deploying) */}
      {step < 5 && (
        <div className="flex-shrink-0 p-5 border-t border-white/5">
          <button onClick={nextStep} disabled={!canContinue()}
            className={`w-full py-3 rounded font-mono text-sm font-bold tracking-wider transition-all ${
              canContinue()
                ? 'bg-green-500 text-black hover:brightness-110 active:scale-[0.98]'
                : 'bg-white/[0.04] text-white/15 cursor-not-allowed'
            }`}>
            CONTINUE
          </button>
        </div>
      )}
    </div>
  );
}
