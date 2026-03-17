import { Button } from '@/components/ui/button';
import { GameLevel } from '@/components/games/mercado-lp/types/game';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PixelStore } from './icons/GameIcons';
import { PixelChevronLeft } from '@/components/ui/pixel-icons';

interface StartScreenProps {
  onSelectRole: (level: GameLevel, avatar: string, characterName: string) => void;
}

interface CharacterCardProps {
  imageSrc: string;
  label: string;
}

const CharacterCard = ({ imageSrc, label }: CharacterCardProps) => {
  return (
    <div className="relative flex flex-col items-center gap-5">
      <div className="pixel-card bg-card/70 p-4 shadow-md">
        <img
          src={imageSrc}
          alt={label}
          className="w-48 h-48 object-contain"
        />
      </div>
      <h3 className="text-lg font-semibold text-center leading-tight">
        {label}
      </h3>
    </div>
  );
};

const roleCards: Array<{
  level: GameLevel;
  titleKey: string;
  gradient: string;
  descriptionKey: string;
  characterImage: string;
  characterLabelKey: string;
}> = [
  {
    level: 1,
    titleKey: 'mercadoLP.start.roles.swapper.name',
    gradient: 'from-emerald-500/20 via-green-500/10 to-lime-500/5',
    descriptionKey: 'mercadoLP.start.roles.swapper.description',
    characterImage: '/player.png',
    characterLabelKey: 'mercadoLP.start.roles.swapper.name',
  },
  {
    level: 2,
    titleKey: 'mercadoLP.start.roles.provider.name',
    gradient: 'from-emerald-500/20 via-green-500/10 to-lime-500/5',
    descriptionKey: 'mercadoLP.start.roles.provider.description',
    characterImage: '/player1.3.png',
    characterLabelKey: 'mercadoLP.start.roles.provider.name',
  },
  {
    level: 3,
    titleKey: 'mercadoLP.start.roles.creator.name',
    gradient: 'from-emerald-500/20 via-green-500/10 to-lime-500/5',
    descriptionKey: 'mercadoLP.start.roles.creator.description',
    characterImage: '/player1.2.png',
    characterLabelKey: 'mercadoLP.start.roles.creator.name',
  },
  {
    level: 4,
    titleKey: 'mercadoLP.start.roles.auctioneer.name',
    gradient: 'from-emerald-500/20 via-green-500/10 to-lime-500/5',
    descriptionKey: 'mercadoLP.start.roles.auctioneer.description',
    characterImage: '/player1.1.png',
    characterLabelKey: 'mercadoLP.start.roles.auctioneer.name',
  },
];

export const StartScreen = ({ onSelectRole }: StartScreenProps) => {
  const [selectedLevel, setSelectedLevel] = useState<GameLevel>(1);
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      {/* Botón sutil para regresar al home */}
      <Link
        to="/"
        className="absolute top-3 left-3 sm:top-4 sm:left-4 z-10 flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 pixel-tag text-amber-900 hover:text-amber-950 transition-all duration-200 group text-xs sm:text-sm"
      >
        <PixelChevronLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
        <span className="font-medium">DeFi México Hub</span>
      </Link>

      {/* Selector de idioma */}
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>

      {/* Gradientes decorativos - ocultos en mobile para mejor rendimiento */}
      <div className="hidden sm:block absolute inset-0 pointer-events-none opacity-30" aria-hidden>
        <div className="w-full h-full bg-[radial-gradient(circle_at_20%_20%,rgba(0,255,136,0.1)_0,rgba(0,0,0,0)_30%),radial-gradient(circle_at_80%_0%,rgba(0,212,255,0.1)_0,rgba(0,0,0,0)_25%),radial-gradient(circle_at_30%_80%,rgba(139,92,246,0.1)_0,rgba(0,0,0,0)_30%)]" />
      </div>

      <div className="relative max-w-6xl w-full px-4">
        <div className="pixel-card p-6 md:p-8 bg-card backdrop-blur">
          <div className="text-center space-y-3 mb-8">
            <div className="flex items-center justify-center gap-3 mb-2">
              <PixelStore size={40} className="text-primary" />
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t('mercadoLP.start.title')}</h1>
            </div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
              {t('mercadoLP.start.subtitle')}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {roleCards.map(({ level, titleKey, gradient, descriptionKey, characterImage, characterLabelKey }) => (
              <div
                key={level}
                onClick={() => setSelectedLevel(level)}
                className={`relative overflow-hidden pixel-card p-4 flex flex-col gap-4 cursor-pointer transition-transform duration-150 ${
                  selectedLevel === level ? 'ring-4 ring-foreground translate-y-[-4px]' : 'hover:-translate-y-1'
                }`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} aria-hidden />
                <div className="absolute inset-0 bg-card/80" aria-hidden />

                <div className="relative flex justify-center">
                  <CharacterCard imageSrc={characterImage} label={t(characterLabelKey)} />
                </div>

                <p className="relative text-sm text-foreground/90 leading-relaxed">{t(descriptionKey)}</p>

                <Button
                  onClick={() => onSelectRole(level, characterImage, t(characterLabelKey))}
                  className="relative pixel-button mt-auto"
                  variant="default"
                >
                  {t('mercadoLP.start.select')}
                </Button>
              </div>
            ))}
          </div>

          <div className="relative mt-6 text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              💡 {t('mercadoLP.start.hintChange')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('mercadoLP.start.hintXP')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
