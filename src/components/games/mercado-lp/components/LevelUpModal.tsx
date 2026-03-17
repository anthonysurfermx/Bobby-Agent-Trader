import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PlayerLevel } from '@/components/games/mercado-lp/types/game';
import { ConfettiBurst } from './ConfettiBurst';
import { useTranslation } from 'react-i18next';
import {
  SproutIcon,
  PixelStore,
  PixelStar,
  PixelCrown,
  PixelTrophy,
  PixelGift,
  PixelCheck,
  PixelParty,
} from './icons/GameIcons';
import { ArrowRightLeft, Briefcase } from 'lucide-react';

interface LevelUpModalProps {
  newLevel: PlayerLevel | null;
  onClose: () => void;
}

// Map level numbers to pixel icons
const getLevelIcon = (level: number, size: number = 64) => {
  switch (level) {
    case 1:
      return <SproutIcon size={size} className="text-emerald-500" />;
    case 2:
      return <ArrowRightLeft size={size} className="text-blue-500" />;
    case 3:
      return <PixelStore size={size} className="text-amber-500" />;
    case 4:
      return <Briefcase size={size} className="text-purple-500" />;
    case 5:
      return <PixelStar size={size} className="text-yellow-500" />;
    case 6:
      return <PixelCrown size={size} className="text-amber-400" />;
    default:
      return <PixelTrophy size={size} className="text-primary" />;
  }
};

// Get level name translations
const getLevelName = (level: number, language: string): string => {
  const names: Record<number, { es: string; en: string }> = {
    1: { es: 'Aprendiz', en: 'Apprentice' },
    2: { es: 'Marchante', en: 'Trader' },
    3: { es: 'Puestero', en: 'Vendor' },
    4: { es: 'Comerciante', en: 'Merchant' },
    5: { es: 'Maestro', en: 'Master' },
    6: { es: 'Leyenda', en: 'Legend' },
  };
  return names[level]?.[language as 'es' | 'en'] || names[level]?.es || 'Unknown';
};

// Get perks translations
const getPerksTranslated = (level: number, language: string): string[] => {
  const perks: Record<number, { es: string[]; en: string[] }> = {
    1: {
      es: ['Acceso a Nivel 1: Marchante'],
      en: ['Access to Level 1: Trader'],
    },
    2: {
      es: ['Acceso a Nivel 2: Puestero', 'Descuento 5% en fees'],
      en: ['Access to Level 2: Vendor', '5% fee discount'],
    },
    3: {
      es: ['Acceso a Nivel 3: Agricultor', 'Bonus XP +20%'],
      en: ['Access to Level 3: Farmer', '+20% XP bonus'],
    },
    4: {
      es: ['Acceso a Nivel 4: Subastero', 'Badge especial', 'Título personalizado'],
      en: ['Access to Level 4: Auctioneer', 'Special badge', 'Custom title'],
    },
    5: {
      es: ['Acceso a Nivel 5: Ligas de Trading', 'Bonus XP +50%', 'Descuento 15% en fees', 'Competencia semanal'],
      en: ['Access to Level 5: Trading Leagues', '+50% XP bonus', '15% fee discount', 'Weekly competition'],
    },
    6: {
      es: ['Acceso a Nivel 6: Market Maker', 'Bonus XP +100%', 'Hooks avanzados', 'Hall of Fame'],
      en: ['Access to Level 6: Market Maker', '+100% XP bonus', 'Advanced hooks', 'Hall of Fame'],
    },
  };
  return perks[level]?.[language as 'es' | 'en'] || perks[level]?.es || [];
};

// Get motivational messages
const getMotivationalMessage = (level: number, language: string): string => {
  const messages: Record<number, { es: string; en: string }> = {
    2: {
      es: '¡Ahora puedes proveer liquidez y ganar fees!',
      en: 'Now you can provide liquidity and earn fees!',
    },
    3: {
      es: '¡Crea tus propios tokens y abre tu huerto!',
      en: 'Create your own tokens and open your orchard!',
    },
    4: {
      es: '¡Descubre las subastas de clearing continuo!',
      en: 'Discover continuous clearing auctions!',
    },
    5: {
      es: '¡Eres un maestro del DeFi!',
      en: 'You are a DeFi master!',
    },
    6: {
      es: '¡Leyenda del Mercado LP! Has alcanzado el nivel máximo.',
      en: 'Mercado LP Legend! You have reached the maximum level.',
    },
  };
  return messages[level]?.[language as 'es' | 'en'] || '';
};

export const LevelUpModal = ({ newLevel, onClose }: LevelUpModalProps) => {
  const { i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'es';
  const [confettiKey, setConfettiKey] = useState(0);

  useEffect(() => {
    if (newLevel) {
      setConfettiKey(prev => prev + 1);
    }
  }, [newLevel]);

  if (!newLevel) return null;

  return (
    <>
      <ConfettiBurst trigger={confettiKey} />
      <Dialog open={!!newLevel} onOpenChange={onClose}>
        <DialogContent className="pixel-card max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl mb-4">
              {language === 'en' ? 'Level Reached!' : '¡Nivel Alcanzado!'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Level icon and name */}
            <div className="flex flex-col items-center space-y-3">
              <div className="animate-bounce">
                {getLevelIcon(newLevel.level, 80)}
              </div>
              <div className="text-center">
                <h3 className="text-3xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                  {getLevelName(newLevel.level, language)}
                </h3>
                <p className="text-lg text-muted-foreground">
                  {language === 'en' ? 'Level' : 'Nivel'} {newLevel.level}
                </p>
              </div>
            </div>

            {/* Perks unlocked */}
            <div className="pixel-card bg-gradient-to-br from-primary/10 to-purple-500/5 p-4 space-y-2">
              <h4 className="font-bold text-sm flex items-center gap-2">
                <PixelGift size={18} className="text-amber-500" />
                {language === 'en' ? 'Perks Unlocked' : 'Ventajas desbloqueadas'}
              </h4>
              <ul className="space-y-1">
                {getPerksTranslated(newLevel.level, language).map((perk, index) => (
                  <li key={index} className="text-sm flex items-start gap-2">
                    <PixelCheck size={14} className="text-green-600 flex-shrink-0 mt-0.5" />
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Motivational message */}
            {getMotivationalMessage(newLevel.level, language) && (
              <div className="text-center text-sm text-muted-foreground italic">
                {getMotivationalMessage(newLevel.level, language)}
              </div>
            )}

            {/* Close button */}
            <Button
              onClick={onClose}
              className="w-full pixel-button bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
              size="lg"
            >
              <span className="flex items-center gap-2">
                {language === 'en' ? 'Continue!' : '¡Continuar!'}
                <PixelParty size={18} />
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
