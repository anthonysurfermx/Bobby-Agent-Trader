import { GameEvent } from '@/components/games/mercado-lp/types/game';
import { useEffect, useState } from 'react';

interface GameEventBannerProps {
  event: GameEvent | null;
  remainingTime: number;
}

export const GameEventBanner = ({ event, remainingTime }: GameEventBannerProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (event) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [event]);

  if (!event) return null;

  const minutes = Math.floor(remainingTime / 60);
  const seconds = remainingTime % 60;

  return (
    <div
      className={`fixed top-16 left-1/2 -translate-x-1/2 z-40 pixel-card bg-game-purple text-primary-foreground px-6 py-3 shadow-2xl transition-all duration-500 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl animate-float">{event.icon}</span>
        <div>
          <p className="text-sm font-bold">{event.name}</p>
          <p className="text-xs opacity-90">{event.description}</p>
        </div>
        <div className="ml-4 text-xs bg-black/20 px-3 py-1 rounded">
          ⏱️ {minutes}:{seconds.toString().padStart(2, '0')}
        </div>
      </div>
    </div>
  );
};
