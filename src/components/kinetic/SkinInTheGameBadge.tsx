// ============================================================
// Skin-in-the-Game Badge — persistent trust signal in header
// Shows win rate + total return from the confirmed Base receipt ledger.
// It is NOT an on-chain proof — the on-chain ledgers live on the landing
// (Base mainnet) and /agentic-world/bobby/calls (Base Sepolia canary), so
// this badge must not claim verification it cannot back (Codex review).
// ============================================================

import { Link } from 'react-router-dom';
import { useCallback, useState } from 'react';
import { Shield } from 'lucide-react';
import { useVisiblePoll } from '@/hooks/useVisiblePoll';

interface PnlSummary {
  winRate: number;
  totalReturn: number;
  totalTrades: number;
  /** Realized lots — win rate is undefined until at least one closes. */
  closedTrades: number;
}

export default function SkinInTheGameBadge() {
  const [summary, setSummary] = useState<PnlSummary | null>(null);
  const [error, setError] = useState(false);

  // Paused while the tab is hidden, refreshed on return (see useVisiblePoll).
  useVisiblePoll(useCallback(async (signal: AbortSignal) => {
    try {
      const r = await fetch('/api/bobby-pnl', { signal });
      const d = await r.json();
      if (signal.aborted) return;
      if (d.ok && d.summary) {
        setSummary({
          winRate: d.summary.winRate ?? 0,
          totalReturn: d.summary.totalReturn ?? 0,
          totalTrades: d.summary.totalTrades ?? 0,
          closedTrades: (d.summary.wins ?? 0) + (d.summary.losses ?? 0),
        });
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      if (!signal.aborted) setError(true);
    }
  }, []));

  // A failed request is not evidence of an empty ledger.
  if (error || !summary || summary.totalTrades === 0) {
    return (
      <Link
        to="/record"
        className="hidden lg:flex items-center gap-1.5 text-[9px] font-mono text-white/30 hover:text-white/50 transition-colors"
        title={error || !summary ? 'Public record is temporarily unavailable' : 'No publicly attributable protocol trades yet'}
      >
        <Shield className="w-3 h-3" />
        <span>{error || !summary ? 'PUBLIC RECORD UNAVAILABLE' : 'NO PUBLIC TRADES YET'}</span>
      </Link>
    );
  }

  const positive = summary.totalReturn >= 0;
  const returnColor = positive ? 'text-green-400' : 'text-red-400';
  const returnSign = positive ? '+' : '';

  return (
    <Link
      to="/record"
      title={`${summary.totalTrades} trades in the confirmed Base receipt ledger`}
      className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-sm bg-white/[0.02] border border-white/[0.04] hover:border-white/10 transition-colors font-mono text-[10px]"
    >
      <Shield className="w-3 h-3 text-green-400" />
      {/* No realized lot yet → "0% WIN" would read as a losing record; show the open count instead. */}
      {summary.closedTrades > 0 ? (
        <span className="text-white/70">{summary.winRate.toFixed(0)}% WIN</span>
      ) : (
        <span className="text-white/70">{summary.totalTrades} OPEN LOT{summary.totalTrades === 1 ? '' : 'S'}</span>
      )}
      <span className="text-white/20">·</span>
      <span className={returnColor}>{returnSign}{summary.totalReturn.toFixed(1)}% PnL</span>
      <span className="text-white/20">·</span>
      <span className="text-white/40">BASE RECEIPT LEDGER</span>
    </Link>
  );
}
