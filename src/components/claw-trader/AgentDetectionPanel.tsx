import React from 'react';
import { SignalPanel } from '@/components/agentic/SignalPanel';
import type { DetectedAgentFromScan } from '@/hooks/useTraderScan';

interface AgentDetectionPanelProps {
  isScanning: boolean;
  progress: { scanned: number; total: number };
  botResults: DetectedAgentFromScan[];
  allResults: Array<{ botScore: number; classification: string }>;
  marketLabel?: string;
  onAgentsDetected?: (agents: DetectedAgentFromScan[]) => void;
}

export const AgentDetectionPanel: React.FC<AgentDetectionPanelProps> = ({
  isScanning,
  progress,
  botResults,
  allResults,
  marketLabel,
}) => {
  const botCount = allResults.filter(r => r.classification === 'bot').length;
  const likelyBotCount = allResults.filter(r => r.classification === 'likely-bot').length;
  const humanCount = allResults.filter(r => r.classification === 'human').length;
  const mixedCount = allResults.filter(r => r.classification === 'mixed').length;
  const hasResults = allResults.length > 0;
  const progressPct = progress.total > 0 ? (progress.scanned / progress.total) * 100 : 0;

  return (
    <div className="border border-amber-500/20 bg-black/60 overflow-hidden font-mono">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500/60" />
          <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
          <div className="w-2 h-2 rounded-full bg-green-500/60" />
        </div>
        <span className="text-amber-400 text-[10px]">
          openclaw --scan-{progress.total}{marketLabel ? ` --market ${marketLabel}` : ''}
        </span>
        {isScanning && <div className="ml-auto w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
      </div>

      <div className="p-4 space-y-3">
        {/* Progress bar */}
        {(isScanning || hasResults) && (
          <div>
            <div className="flex gap-[2px]">
              {Array.from({ length: 20 }).map((_, i) => {
                const filled = i < Math.round(progressPct / 5);
                return (
                  <div
                    key={i}
                    className={`flex-1 h-2 transition-colors duration-200 ${
                      filled
                        ? isScanning ? 'bg-amber-500/60' : 'bg-green-500/60'
                        : 'bg-amber-500/10'
                    }`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between mt-1">
              <span className={`text-[10px] ${isScanning ? 'text-amber-400/60 animate-pulse' : 'text-green-400/60'}`}>
                {isScanning
                  ? `Scanning ${progress.scanned}/${progress.total} traders...`
                  : `${progress.scanned}/${progress.total} traders scanned`
                }
              </span>
              <span className="text-amber-400/30 text-[10px]">
                {Math.round(progressPct)}%
              </span>
            </div>
          </div>
        )}

        {/* Results breakdown */}
        {hasResults && (
          <div className="space-y-1">
            {botCount > 0 && (
              <div className="text-[10px]">
                <span className="text-amber-400/40">{'>'} </span>
                <span className="text-red-400 font-bold">{botCount} bots</span>
                <span className="text-amber-400/30"> detected (score ≥ 80)</span>
              </div>
            )}
            {likelyBotCount > 0 && (
              <div className="text-[10px]">
                <span className="text-amber-400/40">{'>'} </span>
                <span className="text-amber-400">{likelyBotCount} likely-bots</span>
                <span className="text-amber-400/30"> (60-79)</span>
              </div>
            )}
            {mixedCount > 0 && (
              <div className="text-[10px]">
                <span className="text-amber-400/40">{'>'} </span>
                <span className="text-zinc-400">{mixedCount} mixed</span>
                <span className="text-amber-400/30"> (40-59)</span>
              </div>
            )}
            {humanCount > 0 && (
              <div className="text-[10px]">
                <span className="text-amber-400/40">{'>'} </span>
                <span className="text-green-400">{humanCount} humans</span>
                <span className="text-amber-400/30"> (score {'<'} 40)</span>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!hasResults && !isScanning && (
          <div className="py-4 text-center">
            <div className="text-amber-400/20 text-xs">No scan data yet</div>
            <div className="text-amber-400/10 text-[10px] mt-1">
              Select a market above and hit SCAN to analyze 200 traders
            </div>
          </div>
        )}
      </div>

      {/* Signal Panel for detected bots */}
      {botResults.length > 0 && (
        <div className="border-t border-amber-500/10">
          <SignalPanel
            detectedAgents={botResults.map(a => ({
              address: a.address,
              score: a.score,
              direction: a.direction,
              positionDelta: a.positionDelta,
              outcomePrice: a.outcomePrice,
            }))}
            marketSlug={marketLabel || 'smart-money-scan'}
          />
        </div>
      )}
    </div>
  );
};
