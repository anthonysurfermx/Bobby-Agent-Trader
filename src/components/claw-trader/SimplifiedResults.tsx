import React, { useState } from 'react';
import { SignalPanel } from '@/components/agentic/SignalPanel';
import type { DetectedAgentFromScan } from '@/hooks/useTraderScan';

interface SimplifiedResultsProps {
  isScanning: boolean;
  progress: { scanned: number; total: number };
  botResults: DetectedAgentFromScan[];
  allResults: Array<{ botScore: number; classification: string; strategy?: { type: string } }>;
  marketLabel?: string;
}

const BAR_SEGMENTS = 20;

function computeVerdict(
  botResults: DetectedAgentFromScan[],
  allResults: SimplifiedResultsProps['allResults'],
) {
  if (allResults.length === 0) return null;

  const bots = allResults.filter(r => r.classification === 'bot');
  const likelyBots = allResults.filter(r => r.classification === 'likely-bot');
  const humans = allResults.filter(r => r.classification === 'human');
  const mixed = allResults.filter(r => r.classification === 'mixed');

  // Direction from bot results
  const longs = botResults.filter(a => a.direction === 'YES');
  const shorts = botResults.filter(a => a.direction === 'NO');

  const CAP = 10_000;
  const cappedWeight = (d: number) => Math.min(d, CAP);
  const longW = longs.reduce((s, a) => s + cappedWeight(a.positionDelta), 0);
  const shortW = shorts.reduce((s, a) => s + cappedWeight(a.positionDelta), 0);
  const totalW = longW + shortW;
  const pressure = totalW > 0 ? Math.round(((longW - shortW) / totalW) * 100) : 0;
  const direction = pressure > 20 ? 'YES' : pressure < -20 ? 'NO' : 'DIVIDED';
  const conviction = Math.min(100, Math.abs(pressure) + (botResults.length >= 20 ? 30 : botResults.length >= 10 ? 20 : botResults.length >= 5 ? 10 : 0));

  // Strategy breakdown
  const strategyCounts: Record<string, number> = {};
  botResults.forEach(a => {
    strategyCounts[a.strategy] = (strategyCounts[a.strategy] || 0) + 1;
  });

  // Traffic light
  let light: 'green' | 'yellow' | 'red';
  if (conviction >= 60 && direction !== 'DIVIDED') light = 'green';
  else if (conviction >= 30 || direction === 'DIVIDED') light = 'yellow';
  else light = 'red';

  return {
    direction,
    conviction,
    pressure,
    light,
    botCount: bots.length,
    likelyBotCount: likelyBots.length,
    humanCount: humans.length,
    mixedCount: mixed.length,
    strategyCounts,
    longCount: longs.length,
    shortCount: shorts.length,
    longCapital: longs.reduce((s, a) => s + a.positionDelta, 0),
    shortCapital: shorts.reduce((s, a) => s + a.positionDelta, 0),
  };
}

export const SimplifiedResults: React.FC<SimplifiedResultsProps> = ({
  isScanning,
  progress,
  botResults,
  allResults,
  marketLabel,
}) => {
  const [expanded, setExpanded] = useState(false);

  const verdict = computeVerdict(botResults, allResults);
  const hasResults = allResults.length > 0;
  const progressPct = progress.total > 0 ? (progress.scanned / progress.total) * 100 : 0;

  const lightColors = {
    green: { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-400', dot: 'bg-green-500' },
    yellow: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', dot: 'bg-amber-500' },
    red: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', dot: 'bg-red-500' },
  };

  const colors = verdict ? lightColors[verdict.light] : lightColors.yellow;

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
          scan-results{marketLabel ? ` --market ${marketLabel}` : ''}
        </span>
        {isScanning && <div className="ml-auto w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
      </div>

      {/* Progress bar - always visible during/after scan */}
      {(isScanning || hasResults) && (
        <div className="px-3 py-1.5 border-b border-amber-500/10">
          <div className="flex gap-[2px]">
            {Array.from({ length: BAR_SEGMENTS }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1 transition-colors duration-200 ${
                  i < Math.round(progressPct / 5)
                    ? isScanning ? 'bg-amber-500/60' : 'bg-green-500/60'
                    : 'bg-amber-500/10'
                }`}
              />
            ))}
          </div>
          <span className={`text-[10px] ${isScanning ? 'text-amber-400/60 animate-pulse' : 'text-green-400/60'}`}>
            {isScanning
              ? `Scanning ${progress.scanned}/${progress.total} traders...`
              : `${progress.scanned}/${progress.total} traders scanned`}
          </span>
        </div>
      )}

      {/* ONE-LINE VERDICT */}
      {verdict && !isScanning && (
        <div className={`px-4 py-3 ${colors.bg} border-b ${colors.border}`}>
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${colors.dot}`} />
            <div>
              <span className={`text-sm font-bold ${colors.text}`}>
                SMART MONEY SAYS: {verdict.direction}
              </span>
              <span className="text-amber-400/40 text-xs ml-2">
                ({verdict.conviction}% conviction)
              </span>
            </div>
          </div>
          <div className="text-[10px] text-amber-400/40 mt-1 ml-6">
            {verdict.botCount} bots found among {allResults.length} traders
            {Object.keys(verdict.strategyCounts).length > 0 && (
              <span>
                {' | '}
                {Object.entries(verdict.strategyCounts)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 3)
                  .map(([s, c]) => `${c} ${s.toLowerCase().replace('_', ' ')}s`)
                  .join(', ')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Collapsible detail section */}
      {verdict && !isScanning && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full px-4 py-1.5 text-[10px] text-amber-400/40 hover:text-amber-400/60 transition-colors text-left"
          >
            {expanded ? '\u25BE Hide detailed breakdown' : '\u25B8 Show detailed breakdown'}
          </button>

          {expanded && (
            <div className="px-4 pb-3 space-y-3">
              {/* Classification breakdown */}
              <div className="space-y-1">
                {verdict.botCount > 0 && (
                  <div className="text-[10px]">
                    <span className="text-amber-400/40">{'>'} </span>
                    <span className="text-red-400 font-bold">{verdict.botCount} bots</span>
                    <span className="text-amber-400/30"> (score \u2265 80)</span>
                  </div>
                )}
                {verdict.likelyBotCount > 0 && (
                  <div className="text-[10px]">
                    <span className="text-amber-400/40">{'>'} </span>
                    <span className="text-amber-400">{verdict.likelyBotCount} likely-bots</span>
                    <span className="text-amber-400/30"> (60-79)</span>
                  </div>
                )}
                {verdict.mixedCount > 0 && (
                  <div className="text-[10px]">
                    <span className="text-amber-400/40">{'>'} </span>
                    <span className="text-zinc-400">{verdict.mixedCount} mixed</span>
                    <span className="text-amber-400/30"> (40-59)</span>
                  </div>
                )}
                {verdict.humanCount > 0 && (
                  <div className="text-[10px]">
                    <span className="text-amber-400/40">{'>'} </span>
                    <span className="text-green-400">{verdict.humanCount} humans</span>
                    <span className="text-amber-400/30"> ({'<'} 40)</span>
                  </div>
                )}
              </div>

              {/* Pressure bar */}
              <div>
                <div className="flex justify-between text-[8px] text-amber-400/30 uppercase mb-1">
                  <span>Short</span>
                  <span>Neutral</span>
                  <span>Long</span>
                </div>
                <div className="flex gap-[2px]">
                  {Array.from({ length: BAR_SEGMENTS }).map((_, i) => {
                    const center = BAR_SEGMENTS / 2;
                    const fillTo = center + Math.round((verdict.pressure / 100) * center);
                    let isActive: boolean;
                    let color: string;

                    if (verdict.pressure >= 0) {
                      isActive = i >= center && i < fillTo;
                      color = isActive ? 'bg-green-500/60' : (i >= center ? 'bg-green-500/10' : 'bg-red-500/10');
                    } else {
                      isActive = i >= fillTo && i < center;
                      color = isActive ? 'bg-red-500/60' : (i < center ? 'bg-red-500/10' : 'bg-green-500/10');
                    }

                    return (
                      <div
                        key={i}
                        className={`flex-1 h-3 ${color} ${i === center ? 'border-l border-amber-400/40' : ''}`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px]">
                    <span className="text-red-400">{verdict.shortCount}</span>
                    <span className="text-amber-400/30"> bots</span>
                  </span>
                  <span className={`text-[10px] font-bold ${
                    verdict.pressure > 0 ? 'text-green-400' : verdict.pressure < 0 ? 'text-red-400' : 'text-amber-400'
                  }`}>
                    {verdict.pressure > 0 ? '+' : ''}{verdict.pressure}% PRESSURE
                  </span>
                  <span className="text-[10px]">
                    <span className="text-green-400">{verdict.longCount}</span>
                    <span className="text-amber-400/30"> bots</span>
                  </span>
                </div>
              </div>

              {/* Strategy tags */}
              {Object.keys(verdict.strategyCounts).length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[9px] text-amber-400/30">Strategies:</span>
                  {Object.entries(verdict.strategyCounts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([strategy, count]) => (
                      <span key={strategy} className="text-[9px] px-1.5 py-0.5 border border-amber-500/15 bg-black/40">
                        <span className="text-amber-400/60">{strategy}</span>
                        <span className="text-amber-400/30 ml-1">{'\u00D7'}{count}</span>
                      </span>
                    ))}
                </div>
              )}

              {/* Signal Panel for detected bots */}
              {botResults.length > 0 && (
                <div className="border-t border-amber-500/10 pt-2">
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
          )}
        </div>
      )}

      {/* Empty state */}
      {!hasResults && !isScanning && (
        <div className="py-6 text-center">
          <div className="text-amber-400/20 text-xs">No scan data yet</div>
          <div className="text-amber-400/10 text-[10px] mt-1">
            Select a market above and hit SCAN to analyze 200 traders
          </div>
        </div>
      )}
    </div>
  );
};
