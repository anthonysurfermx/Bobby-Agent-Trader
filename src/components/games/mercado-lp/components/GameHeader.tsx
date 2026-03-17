import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useGame } from '@/components/games/mercado-lp/contexts/GameContext';
import {
  PixelMap,
  PixelTrophy,
  PixelBook,
  PixelAward,
  PixelStar,
} from './icons/GameIcons';
import { Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { EducationModal } from './EducationModal';
import { ReputationDisplay } from './ReputationDisplay';
import { GameEventBanner } from './GameEventBanner';
import { Leaderboard } from './Leaderboard';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { getPlayerLevel } from '@/components/games/mercado-lp/data/playerLevels';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface GameHeaderProps {
  onOpenMap: () => void;
  onLoginPrompt?: (reason: 'leaderboard') => void;
  onOpenNFTModal?: () => void;
}

export const GameHeader = ({ onOpenMap, onLoginPrompt, onOpenNFTModal }: GameHeaderProps) => {
  const { currentLevel, setCurrentLevel, player, currentEvent, eventTimeRemaining } = useGame();

  // NFT eligibility: Level 4+ and 1000+ XP
  const canClaimNFT = player.level >= 4 && player.xp >= 1000;
  const [showEducation, setShowEducation] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [xpPulse, setXpPulse] = useState(false);
  const prevXP = useRef(player.xp);
  const { t } = useTranslation();

  useEffect(() => {
    if (player.xp > prevXP.current) {
      const gained = player.xp - prevXP.current;
      setXpPulse(true);
      toast.success(t('mercadoLP.header.toastXp', { gained }), { duration: 1800 });
      const timer = setTimeout(() => setXpPulse(false), 1200);
      prevXP.current = player.xp;
      return () => clearTimeout(timer);
    }
    prevXP.current = player.xp;
  }, [player.xp]);

  const levelInfo = getPlayerLevel(player.xp);
  const nextXp = levelInfo.maxXP || levelInfo.minXP + 100;
  const progress =
    nextXp > levelInfo.minXP
      ? Math.min(100, ((player.xp - levelInfo.minXP) / (nextXp - levelInfo.minXP)) * 100)
      : 0;

  const handleLeaderboardClick = () => {
    setShowLeaderboard(true);
    // Trigger login prompt for leaderboard view (only if not hidden)
    const hidden = localStorage.getItem('mercado_lp_hide_login_prompt_leaderboard');
    if (onLoginPrompt && !hidden) {
      setTimeout(() => onLoginPrompt('leaderboard'), 2000);
    }
  };

  return (
    <>
      <GameEventBanner event={currentEvent} remainingTime={eventTimeRemaining} />
      
      <header className="bg-gradient-to-r from-primary/20 via-purple-500/10 to-pink-500/10 border-b border-primary/20 p-3 mb-4">
        <div className="container mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold tracking-wider">{t('mercadoLP.header.title')}</h1>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full overflow-hidden border border-primary/40 bg-card shadow-sm flex items-center justify-center">
                  <img
                    src={player.avatar || '/player.png'}
                    alt="Tu personaje"
                    className="w-full h-full object-contain"
                  />
                </div>
                {player.characterName && (
                  <span className="hidden sm:block text-xs font-medium text-white/90 max-w-[120px] truncate">
                    {player.characterName}
                  </span>
                )}
              </div>
              <ReputationDisplay />
              <div className="hidden sm:flex flex-col gap-1 w-[170px] rounded-xl bg-white/8 border border-white/15 px-3 py-2 text-xs text-white shadow-lg backdrop-blur">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <PixelStar size={14} className="text-amber-400" />
                    <span className="font-semibold">{player.xp} XP</span>
                  </div>
                  <span className="text-[10px] text-white/80">
                    {t('mercadoLP.header.level', { level: levelInfo.level })}
                  </span>
                </div>
                <div className="relative">
                  <Progress value={progress} className="h-2 bg-white/10" />
                  {xpPulse && (
                    <div className="absolute inset-0 border border-amber-300/60 rounded-full animate-pulse" />
                  )}
                </div>
                <div className="flex justify-between text-[10px] text-white/70">
                  <span>{levelInfo.minXP}</span>
                  <span>{nextXp} XP</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => setCurrentLevel(1)}
                  variant="outline"
                  size="sm"
                  className={cn(
                    "rounded-full h-9 sm:h-10 px-3 sm:px-4 text-[11px] sm:text-xs font-semibold leading-tight gap-1",
                    currentLevel === 1
                      ? "bg-white/15 border-white/30 text-white shadow-lg"
                      : "bg-white/6 border-white/15 text-white/90 hover:bg-white/12"
                  )}
                >
                  <span className="font-bold tracking-tight">N1</span>
                  <span className="hidden xs:inline sm:inline uppercase">
                    {t('mercadoLP.header.levels.n1')}
                  </span>
                </Button>
                <Button
                  onClick={() => setCurrentLevel(2)}
                  variant="outline"
                  size="sm"
                  className={cn(
                    "rounded-full h-9 sm:h-10 px-3 sm:px-4 text-[11px] sm:text-xs font-semibold leading-tight gap-1",
                    currentLevel === 2
                      ? "bg-white/15 border-white/30 text-white shadow-lg"
                      : "bg-white/6 border-white/15 text-white/90 hover:bg-white/12"
                  )}
                >
                  <span className="font-bold tracking-tight">N2</span>
                  <span className="hidden xs:inline sm:inline uppercase">
                    {t('mercadoLP.header.levels.n2')}
                  </span>
                </Button>
                <Button
                  onClick={() => setCurrentLevel(3)}
                  variant="outline"
                  size="sm"
                  className={cn(
                    "rounded-full h-9 sm:h-10 px-3 sm:px-4 text-[11px] sm:text-xs font-semibold leading-tight gap-1",
                    currentLevel === 3
                      ? "bg-white/15 border-white/30 text-white shadow-lg"
                      : "bg-white/6 border-white/15 text-white/90 hover:bg-white/12"
                  )}
                >
                  <span className="font-bold tracking-tight">N3</span>
                  <span className="hidden xs:inline sm:inline uppercase">
                    {t('mercadoLP.header.levels.n3')}
                  </span>
                </Button>
                <Button
                  onClick={() => setCurrentLevel(4)}
                  variant="outline"
                  size="sm"
                  className={cn(
                    "rounded-full h-9 sm:h-10 px-3 sm:px-4 text-[11px] sm:text-xs font-semibold leading-tight gap-1",
                    currentLevel === 4
                      ? "bg-white/15 border-white/30 text-white shadow-lg"
                      : "bg-white/6 border-white/15 text-white/90 hover:bg-white/12"
                  )}
                >
                  <span className="font-bold tracking-tight">N4</span>
                  <span className="hidden xs:inline sm:inline uppercase">
                    {t('mercadoLP.header.levels.n4')}
                  </span>
                </Button>
              </div>
              <Button
                onClick={onOpenMap}
                variant="outline"
                size="sm"
                className="rounded-full px-2 sm:px-3 h-9 bg-white/6 border-white/15 text-white/90 hover:bg-white/12"
              >
                <PixelMap size={16} />
                <span className="hidden sm:inline ml-1">{t('mercadoLP.header.map')}</span>
              </Button>
              <Button
                onClick={handleLeaderboardClick}
                variant="outline"
                size="sm"
                className="rounded-full px-2 h-9 bg-white/6 border-white/15 text-white/90 hover:bg-white/12"
                title={t('mercadoLP.header.leaderboard')}
              >
                <PixelTrophy size={16} />
              </Button>
              <Button
                onClick={() => setShowEducation(true)}
                variant="outline"
                size="sm"
                className="rounded-full px-2 h-9 bg-white/6 border-white/15 text-white/90 hover:bg-white/12"
              >
                <PixelBook size={16} />
                <span className="hidden sm:inline ml-1">{t('mercadoLP.header.education')}</span>
              </Button>
              {/* NFT Gallery link */}
              <Link to="/nft-gallery">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full px-2 h-9 bg-white/6 border-white/15 text-white/90 hover:bg-white/12"
                  title="Galería NFT"
                >
                  <Users size={16} />
                </Button>
              </Link>
              {/* Mintear NFT button - visible when eligible */}
              {canClaimNFT && onOpenNFTModal && (
                <Button
                  onClick={onOpenNFTModal}
                  size="sm"
                  className="rounded-full px-3 h-9 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-0 shadow-lg animate-pulse"
                  title="¡Reclama tu NFT!"
                >
                  <PixelAward size={16} />
                  <span className="ml-1 font-semibold">Mintear NFT</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <EducationModal open={showEducation} onClose={() => setShowEducation(false)} />

      {/* Leaderboard Modal */}
      <Dialog open={showLeaderboard} onOpenChange={setShowLeaderboard}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <PixelTrophy size={20} className="text-yellow-500" />
              {t('mercadoLP.header.leaderboard')}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 pt-2">
            <Leaderboard />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
