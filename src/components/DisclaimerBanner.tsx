import { useState } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

const STORAGE_KEY = 'bobby_disclaimer_accepted';

export function DisclaimerBanner() {
  const [accepted, setAccepted] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });
  const [checked, setChecked] = useState(false);

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
            <p className="text-[11px] text-amber-400/80 font-mono">EXPERIMENTAL PROTOTYPE</p>
          </div>
        </div>

        {/* Warning content */}
        <div className="space-y-3 text-[13px] text-neutral-300 leading-relaxed">
          <div className="flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p>
              <span className="text-white font-semibold">No operes con grandes cantidades de dinero.</span>{' '}
              Este es un experimento de inteligencia artificial construido para el OKX Hackathon.
            </p>
          </div>

          <div className="border-l-2 border-amber-500/30 pl-3 text-[12px] text-neutral-400 space-y-2">
            <p>Bobby es un agente de trading con metacognicion — escanea ballenas en OKX, cruza datos con Polymarket, y debate consigo mismo antes de recomendar.</p>
            <p>Pero sigue siendo un prototipo. Las decisiones de trading son generadas por IA y pueden ser incorrectas. El mercado crypto es volatil e impredecible.</p>
          </div>

          <div className="bg-red-950/40 border border-red-500/20 p-3 text-[12px] text-red-300/90">
            <span className="font-bold text-red-400">RIESGO REAL:</span> Si ejecutas swaps, usaras fondos reales en X Layer. No inviertas lo que no puedas perder.
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
            Entiendo que Bobby Agent Trader es un experimento. No operare con cantidades que no pueda permitirme perder. Acepto el riesgo.
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
          {checked ? 'ENTENDIDO — ENTRAR' : 'MARCA LA CASILLA PARA CONTINUAR'}
        </button>

        <p className="text-[9px] text-neutral-600 text-center font-mono">
          OKX X LAYER AI HACKATHON 2026 — NOT FINANCIAL ADVICE
        </p>
      </div>
    </div>
  );
}
