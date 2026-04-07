// ============================================================
// PTS Onboarding — "Bienvenido a Pro Trading Skills AI Arena"
// Animated welcome sequence before entering the terminal
// Route: /demopts/onboarding
// ============================================================

import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Brain, BarChart3, Shield, MessageSquare, Zap, ArrowRight } from 'lucide-react';

const STEPS = [
  {
    icon: Brain,
    title: 'TU CIO DE INTELIGENCIA ARTIFICIAL',
    desc: 'Dany es tu analista personal. 3 agentes de IA debaten cada trade antes de darte una señal. Tú decides. Dany analiza.',
  },
  {
    icon: BarChart3,
    title: '70+ INDICADORES EN TIEMPO REAL',
    desc: 'RSI, MACD, Bollinger, SuperTrend — todos los indicadores que aprendes en PTS, ahora analizados 24/7 automáticamente.',
  },
  {
    icon: Shield,
    title: 'TRANSPARENCIA TOTAL',
    desc: 'Cada predicción queda grabada de forma permanente. No se puede borrar ni editar. El historial más honesto del mercado.',
  },
  {
    icon: MessageSquare,
    title: 'DIRECTO A TU TELEGRAM',
    desc: 'Las señales llegan al canal de Pro Trading Skills. No necesitas instalar nada extra. Si sabes usar Telegram, sabes usar Dany.',
  },
];

const TERMINAL_LINES = [
  '> INICIALIZANDO DANY AGENT TRADER...',
  '> CONECTANDO CON PRO TRADING SKILLS...',
  '> CARGANDO 70+ INDICADORES TÉCNICOS...',
  '> ACTIVANDO ALPHA HUNTER...',
  '> ACTIVANDO RED TEAM...',
  '> ACTIVANDO CIO DANY...',
  '> CONFIGURANDO MERCADOS: SPY, QQQ, NVDA, BTC, ETH, GOLD...',
  '> SINCRONIZANDO CON TELEGRAM @protradingskills...',
  '> SISTEMA LISTO. BIENVENIDO A TU AI ARENA.',
];

export default function PTSOnboardingPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'welcome' | 'features' | 'loading' | 'ready'>('welcome');
  const [featureIdx, setFeatureIdx] = useState(0);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);

  // Set DANY name immediately on onboarding entry
  useEffect(() => {
    localStorage.setItem('bobby_agent_name', 'DANY');
    localStorage.setItem('i18nextLng', 'es');
    localStorage.setItem('bobby_language', 'es');
  }, []);

  // Auto-advance welcome after 2s
  useEffect(() => {
    if (phase === 'welcome') {
      const t = setTimeout(() => setPhase('features'), 2500);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // Terminal loading animation
  useEffect(() => {
    if (phase !== 'loading') return;
    let i = 0;
    const timer = setInterval(() => {
      if (i < TERMINAL_LINES.length) {
        setTerminalLines(prev => [...prev, TERMINAL_LINES[i]]);
        i++;
      } else {
        clearInterval(timer);
        setTimeout(() => setPhase('ready'), 1000);
      }
    }, 400);
    return () => clearInterval(timer);
  }, [phase]);

  const handleNext = () => {
    if (featureIdx < STEPS.length - 1) {
      setFeatureIdx(featureIdx + 1);
    } else {
      setPhase('loading');
    }
  };

  const handleSkip = () => {
    setPhase('loading');
  };

  const handleEnter = () => {
    navigate('/demopts/terminal');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#11121e' }}>
      <Helmet><title>Bienvenido | Pro Trading Skills AI Arena</title></Helmet>

      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full opacity-8 blur-[100px]" style={{ background: '#F8CF2C' }} />
      </div>

      <div className="relative w-full max-w-lg">
        <AnimatePresence mode="wait">

          {/* PHASE 1: Welcome */}
          {phase === 'welcome' && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', bounce: 0.5, delay: 0.2 }}
                className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center"
                style={{ background: 'rgba(248,207,44,0.15)', border: '2px solid rgba(248,207,44,0.3)', boxShadow: '0 0 40px rgba(248,207,44,0.1)' }}
              >
                <span className="text-3xl font-black" style={{ color: '#F8CF2C' }}>D</span>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-2xl md:text-3xl font-black text-white/90 mb-2"
              >
                Bienvenido a tu
              </motion.h1>
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="text-2xl md:text-3xl font-black mb-4"
                style={{ color: '#F8CF2C' }}
              >
                AI Arena
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="text-sm text-white/30"
              >
                Pro Trading Skills × Dany Agent Trader
              </motion.p>
            </motion.div>
          )}

          {/* PHASE 2: Features tour */}
          {phase === 'features' && (
            <motion.div
              key={`feature-${featureIdx}`}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="text-center"
            >
              <div className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center"
                style={{ background: 'rgba(248,207,44,0.1)', border: '1px solid rgba(248,207,44,0.2)' }}>
                {(() => {
                  const Icon = STEPS[featureIdx].icon;
                  return <Icon className="w-7 h-7" style={{ color: '#F8CF2C' }} />;
                })()}
              </div>

              <h2 className="text-lg font-black tracking-wider mb-3" style={{ color: '#F8CF2C' }}>
                {STEPS[featureIdx].title}
              </h2>
              <p className="text-sm text-white/40 leading-relaxed max-w-sm mx-auto mb-8">
                {STEPS[featureIdx].desc}
              </p>

              {/* Progress dots */}
              <div className="flex items-center justify-center gap-2 mb-6">
                {STEPS.map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full transition-all" style={{ background: i === featureIdx ? '#F8CF2C' : 'rgba(255,255,255,0.1)' }} />
                ))}
              </div>

              <div className="flex items-center justify-center gap-4">
                <button onClick={handleSkip} className="text-[10px] font-mono text-white/20 tracking-widest hover:text-white/40">
                  SALTAR
                </button>
                <button
                  onClick={handleNext}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold font-mono tracking-wider flex items-center gap-2 transition-all hover:opacity-90"
                  style={{ background: '#F8CF2C', color: '#3b2f00' }}
                >
                  {featureIdx < STEPS.length - 1 ? 'SIGUIENTE' : 'ACTIVAR DANY'} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* PHASE 3: Terminal loading */}
          {phase === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full"
            >
              <div className="p-6 rounded-2xl font-mono" style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(248,207,44,0.1)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-500/60" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                  <div className="w-3 h-3 rounded-full bg-green-500/60" />
                  <span className="text-[9px] text-white/20 ml-2 tracking-widest">DANY_AGENT_TRADER — INITIALIZATION</span>
                </div>
                <div className="space-y-1 min-h-[280px]">
                  {terminalLines.map((line, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-[11px] leading-relaxed"
                      style={{ color: i === terminalLines.length - 1 && terminalLines.length === TERMINAL_LINES.length ? '#F8CF2C' : 'rgba(248,207,44,0.5)' }}
                    >
                      {line}
                    </motion.div>
                  ))}
                  {terminalLines.length < TERMINAL_LINES.length && (
                    <span className="inline-block w-2 h-4 animate-pulse" style={{ background: '#F8CF2C' }} />
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* PHASE 4: Ready */}
          {phase === 'ready' && (
            <motion.div
              key="ready"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
                style={{ background: 'rgba(248,207,44,0.15)', border: '2px solid rgba(248,207,44,0.4)', boxShadow: '0 0 60px rgba(248,207,44,0.15)' }}
              >
                <Zap className="w-8 h-8" style={{ color: '#F8CF2C' }} />
              </motion.div>

              <h2 className="text-2xl font-black text-white/90 mb-2">Tu Arena está Lista</h2>
              <p className="text-sm text-white/30 mb-8">Dany está conectado y analizando tus mercados.</p>

              <button
                onClick={handleEnter}
                className="px-8 py-3.5 rounded-xl text-sm font-bold font-mono tracking-wider flex items-center gap-2 mx-auto transition-all hover:opacity-90"
                style={{ background: '#F8CF2C', color: '#3b2f00', boxShadow: '0 0 30px rgba(248,207,44,0.2)' }}
              >
                ENTRAR A MI AI ARENA <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
