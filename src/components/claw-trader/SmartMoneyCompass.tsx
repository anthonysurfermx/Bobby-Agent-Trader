import React from 'react';

interface DetectedAgentData {
  address: string;
  score: number;
  direction: 'YES' | 'NO';
  positionDelta: number;
  outcomePrice?: number;
  classification: string;
  strategy: string;
}

interface CompassData {
  longCount: number;
  shortCount: number;
  longCapital: number;
  shortCapital: number;
  pressure: number; // -100 a +100
  dominantStrategy: string;
  conviction: number; // 0-100
  totalBots: number;
  strategyBreakdown: Record<string, number>;
}

function computeCompass(agents: DetectedAgentData[]): CompassData {
  if (agents.length === 0) {
    return {
      longCount: 0, shortCount: 0, longCapital: 0, shortCapital: 0,
      pressure: 0, dominantStrategy: 'N/A', conviction: 0, totalBots: 0,
      strategyBreakdown: {},
    };
  }

  const longs = agents.filter(a => a.direction === 'YES');
  const shorts = agents.filter(a => a.direction === 'NO');

  const longCapital = longs.reduce((sum, a) => sum + a.positionDelta, 0);
  const shortCapital = shorts.reduce((sum, a) => sum + a.positionDelta, 0);

  // Ponderación logarítmica: cap el peso de un solo agente para evitar
  // que una ballena sesgue todo el compass
  const CAP = 10_000;
  const cappedWeight = (delta: number) => Math.min(delta, CAP);
  const longWeighted = longs.reduce((sum, a) => sum + cappedWeight(a.positionDelta), 0);
  const shortWeighted = shorts.reduce((sum, a) => sum + cappedWeight(a.positionDelta), 0);
  const totalWeighted = longWeighted + shortWeighted;

  // Presión capital-weighted con cap: -100 (all short) a +100 (all long)
  const pressure = totalWeighted > 0
    ? Math.round(((longWeighted - shortWeighted) / totalWeighted) * 100)
    : 0;

  // Estrategia dominante: moda
  const strategyCounts = new Map<string, number>();
  agents.forEach(a => {
    strategyCounts.set(a.strategy, (strategyCounts.get(a.strategy) || 0) + 1);
  });
  const dominantStrategy = [...strategyCounts.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  // Convicción: basada en unilateralidad + cantidad de agentes (escalada para 200-trader scan)
  const conviction = Math.min(100,
    Math.abs(pressure) +
    (agents.length >= 20 ? 30 : agents.length >= 10 ? 20 : agents.length >= 5 ? 10 : 0)
  );

  // Strategy breakdown
  const strategyBreakdown = new Map<string, number>();
  agents.forEach(a => {
    strategyBreakdown.set(a.strategy, (strategyBreakdown.get(a.strategy) || 0) + 1);
  });

  return {
    longCount: longs.length,
    shortCount: shorts.length,
    longCapital,
    shortCapital,
    pressure,
    dominantStrategy,
    conviction,
    totalBots: agents.length,
    strategyBreakdown: Object.fromEntries(strategyBreakdown),
  };
}

interface SmartMoneyCompassProps {
  agents: DetectedAgentData[];
}

const BAR_SEGMENTS = 20;

export const SmartMoneyCompass: React.FC<SmartMoneyCompassProps> = ({ agents }) => {
  const compass = computeCompass(agents);
  const hasData = agents.length > 0;

  // Calcular segmentos del pressure bar
  const center = BAR_SEGMENTS / 2;
  const fillTo = center + Math.round((compass.pressure / 100) * center);

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
          smart-money-compass --aggregate
        </span>
      </div>

      <div className="p-4">
        {!hasData ? (
          <div className="py-4 text-center">
            <div className="text-amber-400/20 text-xs">No agent data</div>
            <div className="text-amber-400/10 text-[10px] mt-1">
              Run agent detection above to populate the compass
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tug-of-war pressure bar */}
            <div>
              <div className="flex justify-between text-[8px] text-amber-400/30 uppercase mb-1.5">
                <span>Short</span>
                <span>Neutral</span>
                <span>Long</span>
              </div>
              <div className="flex gap-[2px]">
                {Array.from({ length: BAR_SEGMENTS }).map((_, i) => {
                  let isActive: boolean;
                  let color: string;

                  if (compass.pressure >= 0) {
                    isActive = i >= center && i < fillTo;
                    color = isActive ? 'bg-green-500/60' : (i >= center ? 'bg-green-500/10' : 'bg-red-500/10');
                  } else {
                    isActive = i >= fillTo && i < center;
                    color = isActive ? 'bg-red-500/60' : (i < center ? 'bg-red-500/10' : 'bg-green-500/10');
                  }

                  // Línea central
                  const isCenterLine = i === center;

                  return (
                    <div
                      key={i}
                      className={`flex-1 h-3 ${color} ${isCenterLine ? 'border-l border-amber-400/40' : ''}`}
                    />
                  );
                })}
              </div>
              {/* Bot counts debajo de la barra */}
              <div className="flex justify-between mt-1.5">
                <div className="text-[10px]">
                  <span className="text-red-400">{compass.shortCount}</span>
                  <span className="text-amber-400/30"> bots · </span>
                  <span className="text-red-400/60">${compass.shortCapital.toLocaleString()}</span>
                </div>
                <div className="text-[10px]">
                  <span className="text-green-400/60">${compass.longCapital.toLocaleString()}</span>
                  <span className="text-amber-400/30"> · </span>
                  <span className="text-green-400">{compass.longCount}</span>
                  <span className="text-amber-400/30"> bots</span>
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="border border-amber-500/15 bg-black/40 p-2">
                <div className="text-[8px] text-amber-400/40 uppercase">Pressure</div>
                <div className={`text-sm font-bold ${
                  compass.pressure > 20 ? 'text-green-400' :
                  compass.pressure < -20 ? 'text-red-400' : 'text-amber-400'
                }`}>
                  {compass.pressure > 0 ? '+' : ''}{compass.pressure}%
                </div>
              </div>
              <div className="border border-amber-500/15 bg-black/40 p-2">
                <div className="text-[8px] text-amber-400/40 uppercase">Strategy</div>
                <div className="text-amber-400 text-[10px] font-bold truncate">
                  {compass.dominantStrategy}
                </div>
              </div>
              <div className="border border-amber-500/15 bg-black/40 p-2">
                <div className="text-[8px] text-amber-400/40 uppercase">Conviction</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <div className="flex gap-[1px] flex-1">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div
                        key={i}
                        className={`flex-1 h-2 ${
                          i < Math.round(compass.conviction / 10)
                            ? compass.conviction >= 70 ? 'bg-green-500/60'
                              : compass.conviction >= 40 ? 'bg-amber-500/60'
                              : 'bg-zinc-500/40'
                            : 'bg-amber-500/10'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Strategy breakdown */}
            {Object.keys(compass.strategyBreakdown).length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {Object.entries(compass.strategyBreakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([strategy, count]) => (
                    <span key={strategy} className="text-[9px] px-1.5 py-0.5 border border-amber-500/15 bg-black/40">
                      <span className="text-amber-400/60">{strategy}</span>
                      <span className="text-amber-400/30 ml-1">×{count}</span>
                    </span>
                  ))
                }
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {hasData && (
        <div className="px-3 py-1 bg-amber-500/5 border-t border-amber-500/10">
          <span className="text-amber-400/30 text-[9px]">
            {compass.totalBots} agent{compass.totalBots !== 1 ? 's' : ''} detected
          </span>
        </div>
      )}
    </div>
  );
};
