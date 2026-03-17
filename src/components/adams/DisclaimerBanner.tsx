import { useState, useMemo } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

const STORAGE_KEY = 'bobby_disclaimer_accepted';

const COPY = {
  es: {
    subtitle: 'PROTOTIPO EXPERIMENTAL',
    warning: 'No operes con grandes cantidades de dinero.',
    warningDetail: 'Este es un experimento de inteligencia artificial construido para el OKX Hackathon.',
    desc1: 'Bobby es un agente de trading con metacognición — escanea ballenas en OKX, cruza datos con Polymarket, y debate consigo mismo antes de recomendar.',
    desc2: 'Pero sigue siendo un prototipo. Las decisiones de trading son generadas por IA y pueden ser incorrectas. El mercado crypto es volátil e impredecible.',
    risk: 'RIESGO REAL:',
    riskDetail: 'Si ejecutas swaps, usarás fondos reales en X Layer. No inviertas lo que no puedas perder.',
    checkbox: 'Entiendo que Bobby Agent Trader es un experimento. No operaré con cantidades que no pueda permitirme perder. Acepto el riesgo.',
    btnReady: 'ENTENDIDO — ENTRAR',
    btnWait: 'MARCA LA CASILLA PARA CONTINUAR',
  },
  en: {
    subtitle: 'EXPERIMENTAL PROTOTYPE',
    warning: 'Do not trade with large amounts of money.',
    warningDetail: 'This is an AI experiment built for the OKX Hackathon.',
    desc1: 'Bobby is a trading agent with metacognition — he scans OKX whale flows, cross-references Polymarket smart money, and debates himself before making a call.',
    desc2: 'But he\'s still a prototype. Trading decisions are AI-generated and can be wrong. The crypto market is volatile and unpredictable.',
    risk: 'REAL RISK:',
    riskDetail: 'If you execute swaps, you\'ll use real funds on X Layer. Don\'t invest what you can\'t afford to lose.',
    checkbox: 'I understand Bobby Agent Trader is an experiment. I won\'t trade with money I can\'t afford to lose. I accept the risk.',
    btnReady: 'UNDERSTOOD — ENTER',
    btnWait: 'CHECK THE BOX TO CONTINUE',
  },
};

function detectLang(): 'es' | 'en' {
  try {
    const lang = navigator.language || navigator.languages?.[0] || 'en';
    return lang.startsWith('es') ? 'es' : 'en';
  } catch { return 'en'; }
}

export function DisclaimerBanner() {
  const [accepted, setAccepted] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });
  const [checked, setChecked] = useState(false);
  const t = useMemo(() => COPY[detectLang()], []);

  if (accepted) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-md w-full border border-amber-500/30 bg-neutral-950 p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 border border-amber-500/40 bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-white">Bobby Agent Trader</h2>
            <p className="text-[11px] text-amber-400/80 font-mono">{t.subtitle}</p>
          </div>
        </div>

        {/* Warning content */}
        <div className="space-y-3 text-[13px] text-neutral-300 leading-relaxed">
          <div className="flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p>
              <span className="text-white font-semibold">{t.warning}</span>{' '}
              {t.warningDetail}
            </p>
          </div>

          <div className="border-l-2 border-amber-500/30 pl-3 text-[12px] text-neutral-400 space-y-2">
            <p>{t.desc1}</p>
            <p>{t.desc2}</p>
          </div>

          <div className="bg-red-950/40 border border-red-500/20 p-3 text-[12px] text-red-300/90">
            <span className="font-bold text-red-400">{t.risk}</span> {t.riskDetail}
          </div>
        </div>

        {/* Checkbox */}
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={checked}
            onChange={e => setChecked(e.target.checked)}
            className="mt-1 w-4 h-4 accent-amber-500 cursor-pointer"
          />
          <span className="text-[12px] text-neutral-400 group-hover:text-neutral-300 transition-colors">
            {t.checkbox}
          </span>
        </label>

        {/* Button */}
        <button
          onClick={() => {
            if (!checked) return;
            setAccepted(true);
            try { localStorage.setItem(STORAGE_KEY, 'true'); } catch {}
          }}
          disabled={!checked}
          className={`w-full py-3 text-[13px] font-bold tracking-wide transition-all ${
            checked
              ? 'bg-amber-500 text-black hover:bg-amber-400 active:scale-[0.98]'
              : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
          }`}
        >
          {checked ? t.btnReady : t.btnWait}
        </button>

        <p className="text-[9px] text-neutral-600 text-center font-mono">
          OKX X LAYER AI HACKATHON 2026 — NOT FINANCIAL ADVICE
        </p>
      </div>
    </div>
  );
}
