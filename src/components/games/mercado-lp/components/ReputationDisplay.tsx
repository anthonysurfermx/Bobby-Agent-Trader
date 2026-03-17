import { useGame } from '@/components/games/mercado-lp/contexts/GameContext';
import { Star } from 'lucide-react';

export const ReputationDisplay = () => {
  const { player } = useGame();

  const getReputationTier = (rep: number) => {
    if (rep >= 81) return { name: 'Leyenda', color: 'text-purple-400' };
    if (rep >= 61) return { name: 'Respetado', color: 'text-blue-400' };
    if (rep >= 41) return { name: 'Conocido', color: 'text-primary' };
    if (rep >= 21) return { name: 'Familiar', color: 'text-amber-400' };
    return { name: 'Nuevo', color: 'text-muted-foreground' };
  };

  const tier = getReputationTier(player.reputation);

  // Calcular el brillo de cada estrella (0-100 reputación distribuido en 5 estrellas)
  // Cada estrella representa 20 puntos
  const getStarFill = (starIndex: number) => {
    const pointsPerStar = 20;
    const starThreshold = starIndex * pointsPerStar;
    const nextThreshold = (starIndex + 1) * pointsPerStar;

    if (player.reputation >= nextThreshold) {
      return 1; // Completamente llena
    } else if (player.reputation > starThreshold) {
      // Parcialmente llena
      return (player.reputation - starThreshold) / pointsPerStar;
    }
    return 0; // Vacía
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2 text-xs">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => {
          const fill = getStarFill(i);
          return (
            <div key={i} className="relative">
              {/* Estrella base (apagada) */}
              <Star
                className="w-4 h-4 text-muted-foreground/20 transition-all duration-300"
                strokeWidth={1.5}
              />
              {/* Estrella iluminada (con clip según el fill) */}
              <div
                className="absolute inset-0 overflow-hidden transition-all duration-500"
                style={{ width: `${fill * 100}%` }}
              >
                <Star
                  className={`w-4 h-4 transition-all duration-300 ${
                    fill === 1
                      ? 'text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.6)]'
                      : 'text-amber-400/70'
                  }`}
                  fill={fill > 0 ? 'currentColor' : 'none'}
                  strokeWidth={1.5}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col">
        <p className={`font-semibold text-xs ${tier.color}`}>{tier.name}</p>
        <p className="text-muted-foreground text-[10px]">{player.reputation}/100</p>
      </div>
    </div>
  );
};
