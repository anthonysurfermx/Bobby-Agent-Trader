import { useEffect, useState } from 'react';
import { Badge as BadgeType } from '@/components/games/mercado-lp/types/game';
import { Card } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { PixelMedal } from './icons/GameIcons';

interface BadgeNotificationProps {
  badge: BadgeType | null;
  onDismiss: () => void;
}

export const BadgeNotification = ({ badge, onDismiss }: BadgeNotificationProps) => {
  const { i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'es';
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (badge) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onDismiss, 300);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [badge, onDismiss]);

  if (!badge) return null;

  return (
    <div className="fixed top-20 right-4 z-50 pointer-events-none">
      <Card
        className={`
          pixel-card p-4 bg-gradient-to-br from-accent to-primary text-white
          pointer-events-auto transition-all duration-300 shadow-xl
          ${isVisible ? 'animate-slide-up opacity-100' : 'opacity-0 translate-y-4'}
        `}
      >
        <div className="flex items-start gap-3">
          <div className="animate-bounce-slow">
            <PixelMedal size={40} className="text-amber-300" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider opacity-90">
                {language === 'en' ? 'Badge Unlocked!' : '¡Insignia Desbloqueada!'}
              </span>
            </div>
            <h3 className="font-bold text-lg mb-1">{badge.name}</h3>
            <p className="text-sm opacity-90">{badge.description}</p>
          </div>
        </div>
      </Card>
    </div>
  );
};
