import { cn } from '@/lib/utils';

interface PriceImpactBarProps {
  impact: number;
  className?: string;
}

export const PriceImpactBar = ({ impact, className }: PriceImpactBarProps) => {
  const getImpactLevel = () => {
    if (impact < 2) return { label: 'Buen precio', color: 'bg-secondary', fill: impact / 2 };
    if (impact < 5) return { label: 'Se nota el cambio', color: 'bg-game-yellow', fill: 0.5 + (impact - 2) / 6 };
    if (impact < 10) return { label: '¡Aguas, está caro!', color: 'bg-accent', fill: 0.75 + (impact - 5) / 20 };
    return { label: '¡Estás moviendo todo el mercado!', color: 'bg-destructive', fill: 1 };
  };

  const level = getImpactLevel();

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex justify-between text-xs">
        <span className="font-bold">Impacto:</span>
        <span className="font-bold">{level.label}</span>
      </div>
      <div className="h-4 bg-muted border-2 border-foreground overflow-hidden">
        <div 
          className={cn("h-full transition-all duration-300", level.color)}
          style={{ width: `${Math.min(level.fill * 100, 100)}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground text-right">
        {impact.toFixed(2)}%
      </p>
    </div>
  );
};
