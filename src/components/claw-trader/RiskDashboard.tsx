import React from 'react';
import type { SignalEntry } from './SignalFeed';

interface RiskDashboardProps {
  signals: SignalEntry[];
  maxPositionUsdc: string;
  minDivergence: string;
  maxLeverage: string;
  tradingEnabled: boolean;
}

export const RiskDashboard: React.FC<RiskDashboardProps> = ({
  signals,
  maxPositionUsdc,
  minDivergence,
  maxLeverage,
  tradingEnabled,
}) => {
  const executedTrades = signals.filter(s => s.decision === 'EXECUTE' && s.trade);
  const tradesThisHour = executedTrades.filter(
    s => Date.now() - s.timestamp < 60 * 60 * 1000
  ).length;

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
          risk-manager --status
        </span>
      </div>

      <div className="p-4">
        {/* Circuit breakers grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <div className="border border-cyan-500/15 bg-black/40 p-2.5">
            <div className="text-[8px] text-cyan-400/40 uppercase">Max Position</div>
            <div className="text-cyan-400 text-sm font-bold">${maxPositionUsdc}</div>
          </div>
          <div className="border border-cyan-500/15 bg-black/40 p-2.5">
            <div className="text-[8px] text-cyan-400/40 uppercase">Leverage Cap</div>
            <div className="text-cyan-400 text-sm font-bold">{maxLeverage}x</div>
          </div>
          <div className="border border-cyan-500/15 bg-black/40 p-2.5">
            <div className="text-[8px] text-cyan-400/40 uppercase">Min Divergence</div>
            <div className="text-cyan-400 text-sm font-bold">{minDivergence}%</div>
          </div>
          <div className="border border-cyan-500/15 bg-black/40 p-2.5">
            <div className="text-[8px] text-cyan-400/40 uppercase">Rate Limit</div>
            <div className="flex items-center gap-1">
              <span className={`text-sm font-bold ${tradesThisHour >= 5 ? 'text-red-400' : 'text-cyan-400'}`}>
                {tradesThisHour}/5
              </span>
              <span className="text-cyan-400/30 text-[8px]">per hr</span>
            </div>
          </div>
        </div>

        {/* Rate limit bar */}
        <div className="mb-4">
          <div className="flex gap-[2px]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1.5 ${
                  i < tradesThisHour
                    ? tradesThisHour >= 4 ? 'bg-red-500/60' : 'bg-cyan-500/60'
                    : 'bg-cyan-500/10'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Trading mode indicator */}
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-cyan-500/10">
          <span className="text-[9px] text-cyan-400/40">Trading Mode:</span>
          <span className={`px-2 py-0.5 border text-[9px] ${
            tradingEnabled
              ? 'border-red-500/40 text-red-400 bg-red-500/10'
              : 'border-green-500/30 text-green-400 bg-green-500/5'
          }`}>
            {tradingEnabled ? 'LIVE — real money at risk' : 'SIMULATION — no real trades'}
          </span>
        </div>

        {/* Trade history */}
        <div>
          <div className="text-[9px] text-cyan-400/40 uppercase mb-2">
            Trade History ({executedTrades.length} this session)
          </div>
          {executedTrades.length === 0 ? (
            <div className="text-cyan-400/15 text-[10px] py-2">No trades executed yet</div>
          ) : (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {executedTrades.map((trade, idx) => (
                <div
                  key={`${trade.timestamp}-${idx}`}
                  className="flex items-center gap-2 text-[10px] py-1 border-b border-cyan-500/5"
                >
                  <span className="text-cyan-400/30 w-5">{idx + 1}.</span>
                  <span className={trade.trade?.side === 'buy' ? 'text-green-400' : 'text-red-400'}>
                    {trade.trade?.side?.toUpperCase()}
                  </span>
                  <span className="text-foreground">{trade.instrument}</span>
                  <span className="text-cyan-400/40">{trade.trade?.lever}x</span>
                  <span className="text-cyan-400/40">${trade.trade?.size}</span>
                  <span className="text-cyan-400/20 ml-auto text-[9px]">
                    {trade.txHash?.startsWith('SIM') ? 'SIM' : 'LIVE'}
                  </span>
                  <span className="text-cyan-400/20 text-[9px]">
                    {new Date(trade.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
