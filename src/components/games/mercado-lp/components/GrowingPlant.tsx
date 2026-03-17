import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface GrowingPlantProps {
  emoji: string;
  stage: 'seed' | 'sprout' | 'growing' | 'mature';
  name?: string;
  symbol?: string;
  className?: string;
  showAnimation?: boolean;
}

export const GrowingPlant = ({
  emoji,
  stage,
  name,
  symbol,
  className,
  showAnimation = false,
}: GrowingPlantProps) => {
  const [currentStage, setCurrentStage] = useState<typeof stage>('seed');

  useEffect(() => {
    if (showAnimation) {
      // Animación secuencial de crecimiento
      const stages: Array<typeof stage> = ['seed', 'sprout', 'growing', 'mature'];
      const targetIndex = stages.indexOf(stage);
      let currentIndex = 0;

      const interval = setInterval(() => {
        if (currentIndex < targetIndex) {
          currentIndex++;
          setCurrentStage(stages[currentIndex]);
        } else {
          clearInterval(interval);
        }
      }, 800);

      return () => clearInterval(interval);
    } else {
      setCurrentStage(stage);
    }
  }, [stage, showAnimation]);

  const getStageVisual = () => {
    switch (currentStage) {
      case 'seed':
        return {
          icon: '🌱',
          label: 'Semilla',
          size: 'text-4xl',
          description: 'Listo para sembrar',
        };
      case 'sprout':
        return {
          icon: '🌿',
          label: 'Brote',
          size: 'text-5xl',
          description: 'Comenzando a crecer',
        };
      case 'growing':
        return {
          icon: '🌳',
          label: 'Creciendo',
          size: 'text-6xl',
          description: 'Casi listo...',
        };
      case 'mature':
        return {
          icon: emoji || '🥭',
          label: 'Maduro',
          size: 'text-7xl',
          description: '¡Listo para usar!',
        };
    }
  };

  const visual = getStageVisual();
  const isMature = currentStage === 'mature';

  return (
    <div className={cn('p-6 relative overflow-hidden bg-transparent border-none shadow-none', className)}>
      {/* Sol decorativo */}
      <div className="absolute top-2 right-2 text-2xl opacity-40">☀️</div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-[200px] space-y-4">
        {/* Planta */}
        <div className={cn(
          'transition-all duration-500',
          visual.size,
          showAnimation && 'animate-bounce-slow'
        )}>
          {visual.icon}
        </div>

        {/* Barra de progreso de crecimiento */}
        <div className="w-full max-w-xs">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-500',
                currentStage === 'seed' && 'w-1/4',
                currentStage === 'sprout' && 'w-1/2',
                currentStage === 'growing' && 'w-3/4',
                currentStage === 'mature' && 'w-full'
              )}
            />
          </div>
        </div>

        {/* Info */}
        <div className="text-center space-y-2">
          <div className="inline-block rounded-lg border border-primary/30 bg-primary/5 px-4 py-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {visual.label}
            </p>
            {isMature && name && (
              <div className="mt-1">
                <p className="font-bold text-lg">{name}</p>
                <p className="text-sm text-muted-foreground">{symbol}</p>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{visual.description}</p>
        </div>

        {/* Indicador de nuevo cultivo */}
        {isMature && showAnimation && (
          <div className="absolute -top-2 -right-2 pixel-card bg-primary text-white px-2 py-1 text-xs font-bold animate-pulse">
            ¡NUEVO!
          </div>
        )}
      </div>
    </div>
  );
};
