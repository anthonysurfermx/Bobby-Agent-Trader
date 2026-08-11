// ============================================================
// TradingModeSelector — "Welcome to the Kinetic Terminal"
// Stitch design: glass modal, risk disclaimer, mode cards
// ============================================================

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type TradingMode = 'paper' | 'confirm' | 'auto';

interface TradingModeSelectorProps {
  onSelect: (mode: TradingMode) => void;
  language?: string;
  onInitVoice?: () => void; // Warm up audio context on "INITIALIZE AGENT"
}

const MODES = [
  {
    id: 'paper' as TradingMode,
    titleEs: 'Paper Trading',
    titleEn: 'Paper Trading',
    descEs: 'Entorno simulado para probar estrategias. Cero riesgo.',
    descEn: 'Simulated environment for strategy testing. Zero risk.',
    tag: 'SAFE',
    tagColor: '#7da6ff',
  },
  {
    id: 'confirm' as TradingMode,
    titleEs: 'Decisión Humana',
    titleEn: 'Human Confirms',
    descEs: 'Bobby identifica señales; tú autorizas cada ejecución.',
    descEn: 'Bobby identifies signals; you authorize each execution.',
    tag: 'BALANCED',
    tagColor: '#7da6ff',
  },
  {
    id: 'auto' as TradingMode,
    titleEs: 'Ejecución AI',
    titleEn: 'AI Execution',
    descEs: 'Autonomía total. Bobby ejecuta 24/7 basado en lógica neural.',
    descEn: 'Full autonomy. Bobby executes 24/7 based on neural logic.',
    tag: 'AUTONOMOUS',
    tagColor: '#7da6ff',
  },
];

export default function TradingModeSelector({ onSelect, language = 'es', onInitVoice }: TradingModeSelectorProps) {
  const [selected, setSelected] = useState<TradingMode | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [showSelector, setShowSelector] = useState(true);
  const [lang, setLang] = useState(language);
  const isEs = lang === 'es';

  useEffect(() => {
    const saved = localStorage.getItem('bobby_trading_mode');
    if (saved === 'paper' || saved === 'confirm' || saved === 'auto') {
      onSelect(saved);
      setShowSelector(false);
    }
  }, [onSelect]);

  const handleInitialize = () => {
    if (!selected || !accepted) return;
    onInitVoice?.(); // Warm up audio on this user gesture
    localStorage.setItem('bobby_trading_mode', selected);
    localStorage.setItem('bobby_lang', lang);
    onSelect(selected);
    setShowSelector(false);
  };

  if (!showSelector) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-[#050505] px-4 py-6 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_25%,rgba(0,82,255,.22),transparent_35%),linear-gradient(rgba(0,82,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(0,82,255,.12)_1px,transparent_1px)] before:[background-size:auto,42px_42px,42px_42px]"
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ delay: 0.15, type: 'spring', damping: 25 }}
          className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-[#0052ff]/25 bg-[#090b14]/95 shadow-[0_30px_120px_rgba(0,0,0,.65),0_0_90px_rgba(0,82,255,.12)] backdrop-blur-xl"
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#0052ff] text-sm font-black shadow-[0_0_24px_rgba(0,82,255,.65)]">B
                </div>
                <div>
                  <h1 className="text-white font-extrabold text-base tracking-[-.04em]">Bobby</h1>
                  <span className="text-[9px] font-mono text-[#7da6ff] tracking-[.18em]">VOICE DECISION ROOM</span>
                </div>
              </div>
              <button onClick={() => setLang(l => l === 'es' ? 'en' : 'es')}
                className="text-[9px] font-mono text-white/30 border border-white/10 px-2 py-0.5 hover:text-white/60 transition-colors">
                {isEs ? 'EN' : 'ES'}
              </button>
            </div>

            <h2 className="text-white text-xl font-bold mt-5 mb-1">
              {isEs ? 'Habla antes de actuar.' : 'Talk before you act.'}
            </h2>
            <p className="text-white/40 text-xs leading-relaxed">
              {isEs
                ? 'Bobby escucha tu tesis, la presiona contra datos y riesgo, y responde con una decisión explicable. Elige el nivel de control que quieres conservar.'
                : 'Bobby hears your thesis, pressure-tests it against data and risk, then returns an explainable decision. Choose how much control you retain.'}
            </p>
          </div>

          {/* Risk Disclaimer */}
          <div className="mx-6 mb-4 rounded-xl border border-[#0052ff]/20 bg-[#0052ff]/[.055] p-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-[#7da6ff] text-sm">◌</span>
              <div>
                  <span className="text-[#7da6ff] text-[10px] font-mono font-bold tracking-wider">HUMAN CONTROL</span>
                <p className="text-white/45 text-[9px] mt-1 leading-relaxed font-mono">
                  {isEs
                    ? 'TRADING INVOLUCRA RIESGO SIGNIFICATIVO. PARÁMETROS DEL SISTEMA PUEDEN RESULTAR EN PÉRDIDA TOTAL DE CAPITAL. BOBBY ES UN SISTEMA AGÉNTICO; LA RESPONSABILIDAD DE EJECUCIÓN PERMANECE CON EL OPERADOR.'
                    : 'TRADING INVOLVES SIGNIFICANT RISK. SYSTEM PARAMETERS MAY RESULT IN TOTAL CAPITAL DEPLETION. BOBBY IS AN AGENTIC SYSTEM; FINAL EXECUTION RESPONSIBILITY REMAINS WITH THE OPERATOR.'}
                </p>
              </div>
            </div>
          </div>

          {/* Mode Selection */}
          <div className="px-6 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-white/50 text-[10px] font-mono tracking-[2px]">SELECT TRADING MODE</span>
              <span className="text-white/20 text-[9px] font-mono">
                {selected ? `${isEs ? 'MODO' : 'MODE'}: ${selected.toUpperCase()}` : `${isEs ? 'PENDIENTE' : 'PENDING'}...`}
              </span>
            </div>

            <div className="space-y-2">
              {MODES.map((mode, i) => (
                <motion.button
                  key={mode.id}
                  initial={{ x: -10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.3 + i * 0.08 }}
                  onClick={() => setSelected(mode.id)}
                  className={`w-full flex items-center justify-between p-3 rounded transition-all text-left ${
                    selected === mode.id
                      ? 'border border-[#0052ff]/55 bg-[#0052ff]/[.12] shadow-[0_0_26px_rgba(0,82,255,.12)]'
                      : 'border border-white/[0.08] bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-semibold">{isEs ? mode.titleEs : mode.titleEn}</span>
                      <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded tracking-wider"
                        style={{ background: `${mode.tagColor}22`, color: mode.tagColor }}>
                        {mode.tag}
                      </span>
                    </div>
                    <p className="text-white/30 text-[10px] mt-1">{isEs ? mode.descEs : mode.descEn}</p>
                  </div>
                  {selected === mode.id && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                      className="ml-3 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#0052ff]">
                      <span className="text-white text-[10px] font-bold">✓</span>
                    </motion.div>
                  )}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Footer: Accept + Initialize */}
          <div className="px-6 pb-6 pt-2 border-t border-white/[0.04]">
            <label className="flex items-center gap-2 cursor-pointer mb-4">
              <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-white/20 bg-transparent accent-[#0052ff]" />
              <span className="text-white/40 text-[10px] font-mono">
                {isEs ? 'ASUMO_RIESGO' : 'READ_RISK'}
              </span>
            </label>

            <div className="flex items-center gap-3">
              <button onClick={() => { setShowSelector(false); onSelect('paper'); localStorage.setItem('bobby_trading_mode', 'paper'); }}
                className="text-white/30 text-[10px] font-mono hover:text-white/60 transition-colors">
                CANCEL
              </button>
              <button
                onClick={handleInitialize}
                disabled={!selected || !accepted}
                className={`flex-1 py-2.5 rounded text-sm font-bold font-mono tracking-wider transition-all ${
                  selected && accepted
                    ? 'bg-[#0052ff] text-white shadow-[0_0_28px_rgba(0,82,255,.45)] hover:bg-[#1c6cff] active:scale-[0.98]'
                    : 'bg-white/[0.04] text-white/15 cursor-not-allowed'
                }`}
              >
                {isEs ? 'INICIALIZAR AGENTE ›' : 'INITIALIZE AGENT ›'}
              </button>
            </div>

            {/* System status footer */}
            <div className="mt-4 flex items-center gap-4 text-[8px] font-mono text-white/15">
              <span>VOICE_READY: TRUE</span>
              <span>HUMAN_IN_LOOP</span>
              <span>AGENTS: {selected ? '3' : '0'}</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
