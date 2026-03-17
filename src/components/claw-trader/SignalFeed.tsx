import React, { useRef, useEffect } from 'react';
import type { SignalResponse } from '@/lib/onchainos/types';

export interface SignalEntry extends SignalResponse {
  timestamp: number;
  instrument: string;
}

interface SignalFeedProps {
  signals: SignalEntry[];
  onClear: () => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
}

function getDecisionStyle(decision: string): { text: string; arrow: string } {
  switch (decision) {
    case 'EXECUTE':
      return { text: 'text-green-400', arrow: '→ EXECUTE' };
    case 'BOND_MODE':
      return { text: 'text-amber-400', arrow: '→ BOND' };
    default:
      return { text: 'text-zinc-500', arrow: '→ SKIP' };
  }
}

export const SignalFeed: React.FC<SignalFeedProps> = ({ signals, onClear }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [signals.length]);

  return (
    <div className="border border-cyan-500/20 bg-black/60 overflow-hidden font-mono">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border-b border-cyan-500/20">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500/60" />
          <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
          <div className="w-2 h-2 rounded-full bg-green-500/60" />
        </div>
        <span className="text-cyan-400 text-[10px]">
          signal-feed --tail -f
        </span>
        <span className="text-cyan-400/30 text-[10px] ml-auto">
          {signals.length} signal{signals.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Feed */}
      <div ref={scrollRef} className="max-h-64 overflow-y-auto">
        {signals.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="text-cyan-400/20 text-xs">No signals yet</div>
            <div className="text-cyan-400/10 text-[10px] mt-1">
              Use the scanner above to generate signals
            </div>
          </div>
        ) : (
          signals.map((signal, idx) => {
            const style = getDecisionStyle(signal.decision);
            return (
              <div
                key={`${signal.timestamp}-${idx}`}
                className={`px-3 py-2 border-b border-cyan-500/5 ${
                  idx === 0 ? 'bg-cyan-500/5' : ''
                }`}
              >
                {/* Main line */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-cyan-400/40 text-[10px]">
                    {formatTime(signal.timestamp)}
                  </span>
                  <span className="text-foreground text-[11px] font-bold">
                    {signal.instrument}
                  </span>
                  {signal.divergence > 0 && (
                    <span className={`text-[10px] ${
                      signal.divergence >= 3 ? 'text-green-400' :
                      signal.divergence >= 1 ? 'text-amber-400' : 'text-zinc-500'
                    }`}>
                      DIV {signal.divergence.toFixed(1)}%
                    </span>
                  )}
                  {signal.consensusStrength && (
                    <span className={`text-[9px] px-1 border ${
                      signal.consensusStrength === 'STRONG'
                        ? 'border-green-500/30 text-green-400'
                        : signal.consensusStrength === 'MEDIUM'
                          ? 'border-amber-500/30 text-amber-400'
                          : 'border-zinc-500/30 text-zinc-500'
                    }`}>
                      {signal.consensusStrength}
                    </span>
                  )}
                  <span className={`text-[10px] font-bold ${style.text}`}>
                    {style.arrow}
                  </span>
                </div>

                {/* Detail line */}
                {signal.trade && signal.decision === 'EXECUTE' && (
                  <div className="flex items-center gap-2 mt-0.5 ml-16">
                    <span className={`text-[10px] ${
                      signal.trade.side === 'buy' ? 'text-green-400/60' : 'text-red-400/60'
                    }`}>
                      {signal.trade.side.toUpperCase()} {signal.trade.lever}x
                    </span>
                    <span className="text-cyan-400/30 text-[10px]">
                      ${signal.trade.size}
                    </span>
                    {signal.txHash && (
                      <span className="text-cyan-400/20 text-[9px]">
                        TX: {signal.txHash.slice(0, 16)}...
                      </span>
                    )}
                  </div>
                )}

                {/* Skip reason */}
                {signal.decision === 'SKIP' && signal.reason && (
                  <div className="ml-16 mt-0.5">
                    <span className="text-zinc-600 text-[9px]">
                      {signal.reason.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {signals.length > 0 && (
        <div className="px-3 py-1 bg-cyan-500/5 border-t border-cyan-500/10 flex items-center justify-between">
          <button
            onClick={onClear}
            className="text-cyan-400/30 text-[9px] hover:text-cyan-400/60 transition-colors"
          >
            [CLEAR LOG]
          </button>
          <span className="text-cyan-400/20 text-[9px]">
            {signals.filter(s => s.decision === 'EXECUTE').length} executed · {signals.filter(s => s.decision === 'SKIP').length} skipped
          </span>
        </div>
      )}
    </div>
  );
};
