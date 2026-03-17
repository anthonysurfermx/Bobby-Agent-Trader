import React from 'react';

interface DivergenceGaugeProps {
  divergence: number;
  threshold: number;
}

export const DivergenceGauge: React.FC<DivergenceGaugeProps> = ({
  divergence,
  threshold,
}) => {
  const maxDisplay = Math.max(threshold * 3, 15);
  const filled = Math.min(Math.round((divergence / maxDisplay) * 20), 20);
  const thresholdMark = Math.round((threshold / maxDisplay) * 20);

  const getBarColor = (index: number): string => {
    if (index >= filled) return 'bg-green-500/10';
    if (divergence < threshold) return 'bg-red-500/60';
    if (divergence < threshold * 1.5) return 'bg-amber-500/60';
    return 'bg-green-500/60';
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex gap-[2px] flex-1">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-3 ${getBarColor(i)} transition-colors duration-300 ${
                i === thresholdMark ? 'border-l border-amber-400/60' : ''
              }`}
            />
          ))}
        </div>
        <span className={`text-sm font-bold font-mono w-16 text-right ${
          divergence < threshold ? 'text-red-400' :
          divergence < threshold * 1.5 ? 'text-amber-400' : 'text-green-400'
        }`}>
          {divergence.toFixed(2)}%
        </span>
      </div>
      <div className="flex items-center justify-between text-[8px] text-cyan-400/30 font-mono">
        <span>0%</span>
        <span className="text-amber-400/40">threshold: {threshold}%</span>
        <span>{maxDisplay.toFixed(0)}%</span>
      </div>
    </div>
  );
};
