import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, TrendingUp, Wallet, CheckCircle2, ArrowRight, Activity, Percent } from 'lucide-react';

interface BobbyInvestorWidgetProps {
  isPTSDemo?: boolean;
  onClose?: () => void;
}

type Step = 'ASSESSMENT' | 'LOADING' | 'RECOMMENDATION';

export default function BobbyInvestorWidget({ isPTSDemo = false, onClose }: BobbyInvestorWidgetProps) {
  const [step, setStep] = useState<Step>('ASSESSMENT');
  const [horizon, setHorizon] = useState<string | null>(null);
  const [risk, setRisk] = useState<string | null>(null);

  // Theme configuration based on PTS Demo mode
  const theme = isPTSDemo ? {
    primary: '#F5A623', // Gold
    primaryBg: 'bg-[#F5A623]',
    primaryText: 'text-[#F5A623]',
    primaryBorder: 'border-[#F5A623]',
    primaryRing: 'ring-[#F5A623]',
    title: 'DANY INVESTOR',
    intro: 'Dany te recomienda este portafolio basado en tu perfil de riesgo.',
    qHorizon: '¿Cuál es tu horizonte de inversión?',
    qRisk: '¿Cuánto riesgo puedes asumir?',
    btnSubmit: 'ANALIZAR PERFIL',
    loading: 'Analizando perfil y calculando rendimientos...',
    yieldBox: 'Tus USDC inactivos pueden generar 3.2% en Aave mientras holpeas.',
    compareTitle: 'TU PORTAFOLIO VS HOLD',
  } : {
    primary: '#4be277', // Stitch Green
    primaryBg: 'bg-[#4be277]',
    primaryText: 'text-[#4be277]',
    primaryBorder: 'border-[#4be277]',
    primaryRing: 'ring-[#4be277]',
    title: 'BOBBY INVESTOR',
    intro: 'Bobby recommends this portfolio based on your risk profile.',
    qHorizon: "What's your investment horizon?",
    qRisk: "How much risk can you handle?",
    btnSubmit: 'ANALYZE PROFILE',
    loading: 'Analyzing profile & calculating optimal yield...',
    yieldBox: 'Your idle USDC can earn 3.2% in Aave while you hold.',
    compareTitle: 'YOUR PORTFOLIO VS JUST HOLDING',
  };

  const handleAnalyze = () => {
    if (!horizon || !risk) return;
    setStep('LOADING');
    setTimeout(() => {
      setStep('RECOMMENDATION');
    }, 2500); // 2.5s simulated loading
  };

  return (
    <div className={`w-full max-w-md mx-auto bg-[#131313] border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl ${theme.primaryBorder}/20`}>
      {/* Header */}
      <div className="bg-[#201f1f] border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded flex items-center justify-center border ${theme.primaryBorder}/30 ${theme.primaryBg}/10`}>
            <Activity className={`w-3.5 h-3.5 ${theme.primaryText}`} />
          </div>
          <span className={`font-mono text-[10px] font-bold tracking-widest ${theme.primaryText}`}>
            {theme.title}
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <span className="font-mono text-xs">×</span>
          </button>
        )}
      </div>

      <div className="p-5">
        <AnimatePresence mode="wait">

          {/* STEP 1: ASSESSMENT */}
          {step === 'ASSESSMENT' && (
            <motion.div
              key="assessment"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div>
                <div className="font-mono text-[10px] text-white/40 mb-3 tracking-widest">{theme.qHorizon}</div>
                <div className="grid grid-cols-3 gap-2">
                  {['1 MONTH', '6 MONTHS', '1+ YEAR'].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setHorizon(opt)}
                      className={`font-mono text-[9px] py-2 rounded border transition-all ${
                        horizon === opt 
                          ? `${theme.primaryBg}/20 ${theme.primaryBorder} ${theme.primaryText}` 
                          : 'bg-white/[0.02] border-white/10 text-white/50 hover:bg-white/[0.05]'
                      }`}
                    >
                      {isPTSDemo && opt === '1 MONTH' ? '1 MES' : 
                       isPTSDemo && opt === '6 MONTHS' ? '6 MESES' : 
                       isPTSDemo && opt === '1+ YEAR' ? '1+ AÑO' : opt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="font-mono text-[10px] text-white/40 mb-3 tracking-widest">{theme.qRisk}</div>
                <div className="grid grid-cols-3 gap-2">
                  {['LOW', 'MED', 'HIGH'].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setRisk(opt)}
                      className={`font-mono text-[9px] py-2 rounded border transition-all ${
                        risk === opt 
                          ? `${theme.primaryBg}/20 ${theme.primaryBorder} ${theme.primaryText}` 
                          : 'bg-white/[0.02] border-white/10 text-white/50 hover:bg-white/[0.05]'
                      }`}
                    >
                      {isPTSDemo && opt === 'LOW' ? 'BAJO' : 
                       isPTSDemo && opt === 'MED' ? 'MEDIO' : 
                       isPTSDemo && opt === 'HIGH' ? 'ALTO' : opt}
                    </button>
                  ))}
                </div>
              </div>

              <button
                disabled={!horizon || !risk}
                onClick={handleAnalyze}
                className={`w-full mt-4 font-mono text-[10px] font-bold py-3 rounded tracking-widest flex items-center justify-center gap-2 transition-all ${
                  horizon && risk
                    ? `${theme.primaryBg} text-black hover:opacity-90`
                    : 'bg-white/5 text-white/20 cursor-not-allowed'
                }`}
              >
                {theme.btnSubmit}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}

          {/* STEP 2: LOADING */}
          {step === 'LOADING' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="py-12 flex flex-col items-center justify-center"
            >
              <div className="relative w-12 h-12 mb-4">
                <div className={`absolute inset-0 border-t-2 border-r-2 ${theme.primaryBorder} rounded-full animate-spin`} />
                <div className={`absolute inset-2 border-b-2 border-l-2 ${theme.primaryBorder}/40 rounded-full animate-spin-reverse`} />
                <div className={`absolute inset-0 flex items-center justify-center`}>
                  <div className={`w-1.5 h-1.5 ${theme.primaryBg} rounded-full animate-pulse`} />
                </div>
              </div>
              <div className={`font-mono text-[10px] ${theme.primaryText} animate-pulse tracking-widest text-center`}>
                {theme.loading}
              </div>
            </motion.div>
          )}

          {/* STEP 3: RECOMMENDATION */}
          {step === 'RECOMMENDATION' && (
            <motion.div
              key="recommendation"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              <div className="font-mono text-[11px] text-white/80 leading-relaxed">
                {theme.intro}
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div className="bg-[#201f1f] rounded-lg p-3 border border-white/[0.04]">
                   <div className="font-mono text-[8px] text-white/40 tracking-widest mb-1">{isPTSDemo ? 'APY ESTIMADO' : 'EXPECTED APY'}</div>
                   <div className={`font-mono text-xl font-black ${theme.primaryText}`}>18.4%</div>
                </div>
                <div className="bg-[#201f1f] rounded-lg p-3 border border-white/[0.04]">
                   <div className="font-mono text-[8px] text-white/40 tracking-widest mb-1">{isPTSDemo ? 'NIVEL DE RIESGO' : 'RISK SCORE'}</div>
                   <div className="font-mono text-xl font-black text-white/90">
                     {risk === 'LOW' ? '3' : risk === 'MED' ? '6' : '8'}<span className="text-sm text-white/30">/10</span>
                   </div>
                </div>
              </div>

              {/* Allocation Bar */}
              <div className="space-y-2">
                <div className="h-5 w-full rounded-full overflow-hidden flex">
                  <motion.div initial={{ width: 0 }} animate={{ width: '40%' }} transition={{ duration: 1, delay: 0.2 }} className="bg-[#ffb95f]" title="BTC 40%" />
                  <motion.div initial={{ width: 0 }} animate={{ width: '30%' }} transition={{ duration: 1, delay: 0.3 }} className="bg-[#00E5FF]" title="ETH 30%" />
                  <motion.div initial={{ width: 0 }} animate={{ width: '20%' }} transition={{ duration: 1, delay: 0.4 }} className="bg-[#4be277]" title="USDC 20%" />
                  <motion.div initial={{ width: 0 }} animate={{ width: '10%' }} transition={{ duration: 1, delay: 0.5 }} className="bg-[#ffb4ae]" title="SOL 10%" />
                </div>
                <div className="flex justify-between font-mono text-[8px] tracking-widest text-white/40 px-1">
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Asset List */}
              <div className="space-y-2">
                {[
                  { asset: 'BTC', pct: 40, color: 'bg-[#ffb95f]', desc: isPTSDemo ? 'Reserva de valor core' : 'Core store of value' },
                  { asset: 'ETH', pct: 30, color: 'bg-[#00E5FF]', desc: isPTSDemo ? 'Base de infraestructura' : 'Infrastructure base play' },
                  { asset: 'USDC', pct: 20, color: 'bg-[#4be277]', desc: isPTSDemo ? 'Pólvora seca + Yield' : 'Dry powder + DeFi Yield' },
                  { asset: 'SOL', pct: 10, color: 'bg-[#ffb4ae]', desc: isPTSDemo ? 'Apuesta de alto momentum' : 'High momentum bet' },
                ].map((item, i) => (
                  <motion.div 
                    key={item.asset}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + i * 0.1 }}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded bg-white/[0.02] border border-white/[0.04]"
                  >
                    <div className="flex items-center gap-3 mb-1 sm:mb-0">
                      <div className={`w-2 h-2 rounded-full ${item.color}`} />
                      <div className="font-mono text-[10px] font-bold text-white/90">{item.asset}</div>
                      <div className="font-mono text-[10px] text-white/50">{item.pct}%</div>
                    </div>
                    <div className="font-mono text-[9px] text-white/30 truncate sm:ml-4">{item.desc}</div>
                  </motion.div>
                ))}
              </div>

              {/* Yield Opportunity Block */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.2 }}
                className={`mt-4 p-4 rounded-xl border border-dashed ${theme.primaryBorder}/40 ${theme.primaryBg}/10 relative overflow-hidden`}
              >
                <div className={`absolute top-0 right-0 w-16 h-16 ${theme.primaryBg} opacity-10 rounded-bl-full`} />
                <div className="flex gap-3">
                  <div className={`w-8 h-8 rounded-full ${theme.primaryBg}/20 flex items-center justify-center flex-shrink-0`}>
                    <Percent className={`w-4 h-4 ${theme.primaryText}`} />
                  </div>
                  <div>
                    <div className={`font-mono text-[10px] font-bold ${theme.primaryText} mb-1 tracking-wide`}>YIELD OPPORTUNITY</div>
                    <p className="font-mono text-[10px] text-white/70 leading-relaxed mb-3">
                      {theme.yieldBox}
                    </p>
                    <a href="/agentic-world/defi" className={`font-mono text-[9px] bg-[#1a1a1a] px-3 py-1.5 rounded border border-white/10 hover:${theme.primaryBorder}/50 hover:${theme.primaryText} transition-colors inline-flex items-center gap-1.5`}>
                      {isPTSDemo ? 'ACTIVAR AAVE' : 'ACTIVATE AAVE YIELD'} <ArrowRight className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </motion.div>

              {/* Comparison Chart Mock */}
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}
                className="pt-4 border-t border-white/[0.06]"
              >
                <div className="font-mono text-[9px] text-white/40 tracking-widest mb-3">{theme.compareTitle}</div>
                <div className="h-24 w-full bg-[#0a0a0a] rounded-lg border border-white/[0.04] p-3 flex items-end gap-1 relative">
                  {/* Super simple pure CSS line chart via SVG */}
                  <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <path d="M0,100 L20,95 L40,85 L60,88 L80,70 L100,60" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" strokeDasharray="4 4" />
                    <path d="M0,100 L20,90 L40,75 L60,60 L80,40 L100,20" fill="none" stroke={theme.primary} strokeWidth="2" className="drop-shadow-[0_0_5px_currentColor]" />
                  </svg>
                  <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                    <div className={`font-mono text-[7px] ${theme.primaryText} flex items-center gap-1`}><span className={`w-1.5 h-1.5 rounded-full ${theme.primaryBg}`} /> {isPTSDemo ? 'ESTE PORTAFOLIO' : 'SELECTED PORTFOLIO'}</div>
                    <div className="font-mono text-[7px] text-white/30 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-white/20" /> {isPTSDemo ? 'SOLO HOLD BTC' : '100% BTC HOLD'}</div>
                  </div>
                </div>
              </motion.div>
              
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
