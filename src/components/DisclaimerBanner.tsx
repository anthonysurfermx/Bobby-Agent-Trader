import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';

const STORAGE_KEY = 'adams_disclaimer_dismissed';

export function DisclaimerBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });

  if (dismissed) return null;

  return (
    <div className="bg-amber-950/60 border-b border-amber-500/30 px-4 py-2.5">
      <div className="max-w-2xl mx-auto flex items-center gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <p className="text-[11px] text-amber-300/90 flex-1">
          <span className="font-bold">EXPERIMENTAL</span> — Adams Agent Trader is a hackathon prototype.
          Not financial advice. Trade at your own risk. Real funds at stake when executing.
        </p>
        <button
          onClick={() => {
            setDismissed(true);
            try { localStorage.setItem(STORAGE_KEY, 'true'); } catch {}
          }}
          className="text-amber-500/50 hover:text-amber-400 transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
