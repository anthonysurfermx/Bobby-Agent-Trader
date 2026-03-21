import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type TradingMode = 'paper' | 'confirm' | 'auto';

interface TradingModeSelectorProps {
  onSelect: (mode: TradingMode) => void;
  language?: string;
}

const MODES = [
  {
    id: 'paper' as TradingMode,
    icon: '📄',
    titleEs: 'Paper Trading',
    titleEn: 'Paper Trading',
    descEs: 'Bobby analiza y recomienda trades simulados. Sin riesgo real.',
    descEn: 'Bobby analyzes and recommends simulated trades. No real risk.',
    color: '#3b82f6',
    tag: 'SAFE',
  },
  {
    id: 'confirm' as TradingMode,
    icon: '⚖️',
    titleEs: 'Decisión Humana',
    titleEn: 'Human Confirms',
    descEs: 'Bobby debate y recomienda. Tú confirmas antes de ejecutar.',
    descEn: 'Bobby debates. You confirm every trade before execution.',
    color: '#eab308',
    tag: 'BALANCED',
  },
  {
    id: 'auto' as TradingMode,
    icon: '🤖',
    titleEs: 'Ejecución AI',
    titleEn: 'AI Execution',
    descEs: 'Bobby decide y ejecuta automáticamente. Modo autónomo.',
    descEn: 'Bobby debates, decides and executes automatically.',
    color: '#22c55e',
    tag: 'AUTONOMOUS',
  },
];

export default function TradingModeSelector({ onSelect, language = 'es' }: TradingModeSelectorProps) {
  const [selected, setSelected] = useState<TradingMode | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [showSelector, setShowSelector] = useState(true);
  const [lang, setLang] = useState(language);
  const isEs = lang === 'es';

  useEffect(() => {
    const saved = localStorage.getItem('bobby_trading_mode');
    const hasAgreed = localStorage.getItem('bobby_disclaimer_accepted');
    if (saved && hasAgreed === 'true') {
      onSelect(saved as TradingMode);
      setShowSelector(false);
    }
  }, [onSelect]);

  const handleEnter = () => {
    if (!selected || !agreed) return;
    localStorage.setItem('bobby_trading_mode', selected);
    localStorage.setItem('bobby_lang', lang);
    localStorage.setItem('bobby_disclaimer_accepted', 'true');
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
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-md p-4"
        style={{ fontFamily: 'monospace' }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="max-w-[460px] w-full border border-white/[0.08] bg-neutral-950/80 backdrop-blur-xl p-6 rounded-2xl shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 border border-green-500/30 bg-green-500/10 flex items-center justify-center rounded-lg text-lg">
                🧠
              </div>
              <div>
                <h2 className="text-[15px] font-bold text-white mb-0.5">Bobby Agent Trader</h2>
                <span className="text-[9px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded tracking-widest">PROTOTIPO EXPERIMENTAL</span>
              </div>
            </div>
            <button
              onClick={() => setLang(isEs ? 'en' : 'es')}
              className="px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.05] text-white/50 text-[9px] hover:text-white/80 transition-colors"
            >
              {isEs ? '🇲🇽 ES' : '🇺🇸 EN'}
            </button>
          </div>

          <p className="text-[12px] text-white/50 mb-6 leading-relaxed">
            {isEs 
              ? 'Bobby es un agente autónomo de trading con metacognición. ¿Cómo quieres operar hoy?'
              : 'Bobby is an autonomous trading agent with metacognition. How do you want to trade today?'}
          </p>

          {/* Mode cards */}
          <div className="flex flex-col gap-2.5 mb-6">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setSelected(mode.id)}
                className={`flex items-start gap-3.5 p-3.5 rounded-xl text-left transition-all duration-300 border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.03]`}
                style={{
                  borderColor: selected === mode.id ? mode.color : undefined,
                  backgroundColor: selected === mode.id ? `${mode.color}15` : undefined,
                  boxShadow: selected === mode.id ? `0 0 15px ${mode.color}20` : undefined,
                }}
              >
                <div className="text-xl mt-0.5">{mode.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white text-[13px] font-bold">{isEs ? mode.titleEs : mode.titleEn}</span>
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: `${mode.color}20`, color: mode.color }}>
                      {mode.tag}
                    </span>
                  </div>
                  <span className="text-white/40 text-[10px] leading-snug">{isEs ? mode.descEs : mode.descEn}</span>
                </div>
                {selected === mode.id && (
                  <div className="w-4 h-4 rounded-full flex items-center justify-center text-black font-bold text-[8px]" style={{ backgroundColor: mode.color }}>
                    ✓
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Checkbox & Warning */}
          <div className="mb-6 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                className="mt-0.5 w-[14px] h-[14px] accent-amber-500 cursor-pointer"
              />
              <span className="text-[11px] text-amber-500/80 group-hover:text-amber-400 transition-colors leading-relaxed">
                {isEs 
                  ? 'Entiendo que Bobby es un experimento IA. No operaré con fondos que no pueda permitirme perder. Acepto el riesgo.' 
                  : 'I understand Bobby is an AI experiment. I will not trade with funds I cannot afford to lose. I accept the risk.'}
              </span>
            </label>
          </div>

          {/* Enter Button */}
          <button
            onClick={handleEnter}
            disabled={!selected || !agreed}
            className={`w-full py-3.5 rounded-xl font-bold tracking-wider text-[12px] transition-all duration-300 ${
              selected && agreed
                ? 'bg-amber-500 text-black hover:bg-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                : 'bg-white/5 border border-white/5 text-white/20 cursor-not-allowed'
            }`}
          >
            {isEs ? 'ENTRAR A LA SALA' : 'ENTER TRADING ROOM'}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
