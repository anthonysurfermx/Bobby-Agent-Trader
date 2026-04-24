// ============================================================
// Skin-in-the-Game Badge — persistent trust signal in header
// Shows win rate + total return with on-chain verification link
// ============================================================

import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';

interface PnlSummary {
  winRate: number;
  totalReturn: number;
  totalTrades: number;
}

export default function SkinInTheGameBadge() {
  const [summary, setSummary] = useState<PnlSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/bobby-pnl');
        const d = await r.json();
        if (!alive) return;
        if (d.ok && d.summary) {
          setSummary({
            winRate: d.summary.winRate ?? 0,
            totalReturn: d.summary.totalReturn ?? 0,
            totalTrades: d.summary.totalTrades ?? 0,
          });
          setError(false);
        } else {
          setError(true);
        }
      } catch {
        if (alive) setError(true);
      }
    };
    load();
    const poll = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(poll); };
  }, []);

  // Fallback (new user, zero trades, or transient error):
  // copy de expectativa (Gemini) — comunica que el track record nace con el primer trade.
  if (error || !summary || summary.totalTrades === 0) {
    return (
      <Link
        to="/agentic-world/bobby/history"
        className="hidden lg:flex items-center gap-1.5 text-[9px] font-mono text-white/30 hover:text-white/50 transition-colors"
        title="El track record verificable arranca con el primer trade"
      >
        <Shield className="w-3 h-3" />
        <span>0 TRADES · ESPERANDO PRIMER SETUP</span>
      </Link>
    );
  }

  const positive = summary.totalReturn >= 0;
  const returnColor = positive ? 'text-green-400' : 'text-red-400';
  const returnSign = positive ? '+' : '';

  return (
    <Link
      to="/agentic-world/bobby/history"
      title={`${summary.totalTrades} trades verificados on-chain (X Layer)`}
      className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-sm bg-white/[0.02] border border-white/[0.04] hover:border-white/10 transition-colors font-mono text-[10px]"
    >
      <Shield className="w-3 h-3 text-green-400" />
      <span className="text-white/70">{summary.winRate.toFixed(0)}% WIN</span>
      <span className="text-white/20">·</span>
      <span className={returnColor}>{returnSign}{summary.totalReturn.toFixed(1)}% PnL</span>
      <span className="text-white/20">·</span>
      <span className="text-white/40">VERIFICADO EN-CHAIN</span>
    </Link>
  );
}
