import React, { useState, useEffect } from 'react';
import { ScrambleText } from '@/components/agentic/ScrambleText';
import { PriceTicker } from './PriceTicker';

interface ConnectionStatus {
  connected: boolean;
  reason?: string;
  tradingEnabled: boolean;
  maxPositionUsdc: string;
  minDivergence: string;
  maxLeverage?: string;
}

interface ClawTraderHeroProps {
  onPricesUpdate?: (prices: Record<string, number>) => void;
  onStatusUpdate?: (status: ConnectionStatus) => void;
  onGetStarted?: () => void;
}

export const ClawTraderHero: React.FC<ClawTraderHeroProps> = ({
  onPricesUpdate,
  onStatusUpdate,
  onGetStarted,
}) => {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch('/api/onchainos-status');
        if (res.ok) {
          const data: ConnectionStatus = await res.json();
          setStatus(data);
          onStatusUpdate?.(data);
        }
      } catch {
        setStatus({ connected: false, reason: 'fetch_failed', tradingEnabled: false, maxPositionUsdc: '100', minDivergence: '3' });
      } finally {
        setStatusLoading(false);
      }
    }
    fetchStatus();
  }, [onStatusUpdate]);

  return (
    <div className="border border-green-500/20 bg-black/60 overflow-hidden font-mono">
      {/* Terminal header with inline status badges */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border-b border-green-500/20">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500/60" />
          <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
          <div className="w-2 h-2 rounded-full bg-green-500/60" />
        </div>
        <span className="text-green-400 text-[10px]">
          openclaw --claw-trader
        </span>
        <div className="ml-auto flex items-center gap-3">
          {statusLoading ? (
            <span className="text-cyan-400/30 text-[9px] animate-pulse">checking...</span>
          ) : status ? (
            <>
              <span className="flex items-center gap-1 text-[9px]">
                <span className={`w-1.5 h-1.5 rounded-full ${status.connected ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
                <span className={status.connected ? 'text-green-400' : 'text-amber-400'}>
                  {status.connected ? 'OKX' : 'PRICE-ONLY'}
                </span>
              </span>
              <span className={`px-1 py-0.5 border text-[8px] ${
                status.tradingEnabled
                  ? 'border-red-500/40 text-red-400 bg-red-500/10'
                  : 'border-cyan-500/30 text-cyan-400/60 bg-cyan-500/5'
              }`}>
                {status.tradingEnabled ? 'LIVE' : 'SIM'}
              </span>
              <span className="text-green-400/30 text-[8px]">${status.maxPositionUsdc}</span>
              <span className="text-green-400/30 text-[8px]">{status.minDivergence}%</span>
              <span className="text-green-400/30 text-[8px]">{status.maxLeverage || '5'}x</span>
            </>
          ) : null}
        </div>
      </div>

      {/* Hero content — compact */}
      <div className="px-6 py-4">
        <h1 className="text-2xl md:text-3xl font-bold text-green-300 mb-1">
          <ScrambleText text="Claw Trader" speed={20} iterations={12} />
        </h1>
        <p className="text-green-400/40 text-xs mb-3">
          Scan 200 traders {'\u2192'} Detect bots {'\u2192'} Follow smart money
        </p>

        {/* CTA + cross-link */}
        <div className="flex items-center gap-4">
          <button
            onClick={onGetStarted}
            className="px-4 py-1.5 text-[10px] border border-green-500/30 text-green-400 hover:bg-green-500/10 transition-colors"
          >
            GET STARTED {'\u2193'}
          </button>
          <a
            href="https://betwhisper.ai/predict"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-cyan-400/40 hover:text-cyan-400/60 transition-colors"
          >
            Want a simpler experience? {'\u2192'} BetWhisper Chat
          </a>
        </div>

        {/* Price ticker */}
        <div className="mt-3 pt-3 border-t border-green-500/10">
          <PriceTicker onPricesUpdate={onPricesUpdate} />
        </div>
      </div>
    </div>
  );
};
