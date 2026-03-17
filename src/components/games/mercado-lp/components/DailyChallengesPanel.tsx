import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DailyChallenge, DailyChallengesState } from '../types/game';
import { getTranslatedChallenge, ALL_COMPLETED_BONUS_XP } from '../data/dailyChallenges';
import {
  PixelTrophy,
  PixelClock,
  PixelCheckCircle,
  PixelSparkles,
  PixelGift,
  SwapperIcon,
  PixelStar,
  ChartIcon,
  DropIcon,
  TargetIcon,
  PixelCoins,
  PixelTrendingUp,
  AuctioneerIcon,
} from './icons/GameIcons';
import { cn } from '@/lib/utils';

// Map challenge types to pixel icons
const getChallengeIcon = (type: DailyChallenge['type'], size: number = 20) => {
  const iconMap: Record<DailyChallenge['type'], React.ReactNode> = {
    swap_count: <SwapperIcon size={size} className="text-blue-400" />,
    reputation: <PixelStar size={size} className="text-amber-400" />,
    swap_volume: <ChartIcon size={size} className="text-purple-400" />,
    add_liquidity: <DropIcon size={size} className="text-cyan-400" />,
    low_slippage: <TargetIcon size={size} className="text-green-400" />,
    diverse_trades: <PixelSparkles size={size} className="text-pink-400" />,
    earn_fees: <PixelCoins size={size} className="text-yellow-400" />,
    profit_trade: <PixelTrendingUp size={size} className="text-emerald-400" />,
    create_token: <PixelSparkles size={size} className="text-violet-400" />,
    auction_bid: <AuctioneerIcon size={size} className="text-orange-400" />,
  };
  return iconMap[type] || <PixelTrophy size={size} className="text-primary" />;
};

interface DailyChallengesPanelProps {
  challengesState: DailyChallengesState;
  onClaimAllBonus?: () => void;
  compact?: boolean;
}

export function DailyChallengesPanel({
  challengesState,
  onClaimAllBonus,
  compact = false,
}: DailyChallengesPanelProps) {
  const { i18n, t } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'es';

  const allCompleted = challengesState.completedToday === 3;
  const canClaimBonus = allCompleted && !challengesState.allCompletedBonus;

  // Get time until reset (UTC midnight)
  const getTimeUntilReset = (): string => {
    const now = new Date();
    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const diff = tomorrow.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const getDifficultyColor = (difficulty: DailyChallenge['difficulty']) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'hard':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
    }
  };

  const getDifficultyLabel = (difficulty: DailyChallenge['difficulty']) => {
    const labels = {
      easy: { es: 'Fácil', en: 'Easy' },
      medium: { es: 'Medio', en: 'Medium' },
      hard: { es: 'Difícil', en: 'Hard' },
    };
    return labels[difficulty][language];
  };

  if (compact) {
    return (
      <Card className="bg-gradient-to-br from-purple-900/40 to-indigo-900/40 border-purple-500/30">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <PixelTrophy size={16} className="text-purple-400" />
              <span className="text-sm font-medium text-purple-200">
                {language === 'en' ? 'Daily Challenges' : 'Retos Diarios'}
              </span>
            </div>
            <Badge variant="outline" className="text-xs">
              {challengesState.completedToday}/3
            </Badge>
          </div>
          <Progress
            value={(challengesState.completedToday / 3) * 100}
            className="h-2 bg-purple-900/50"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-purple-900/40 to-indigo-900/40 border-purple-500/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <PixelTrophy size={20} className="text-purple-400" />
            {language === 'en' ? 'Daily Challenges' : 'Retos Diarios'}
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <PixelClock size={12} />
            {language === 'en' ? 'Resets in' : 'Reinicia en'} {getTimeUntilReset()}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {challengesState.challenges.map((challenge) => {
          const { title, description } = getTranslatedChallenge(challenge, language);
          const progress = Math.min((challenge.progress / challenge.target) * 100, 100);

          return (
            <div
              key={challenge.id}
              className={cn(
                'p-3 rounded-lg border transition-all',
                challenge.completed
                  ? 'bg-green-900/20 border-green-500/30'
                  : 'bg-slate-800/50 border-slate-700/50'
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="flex-shrink-0">{getChallengeIcon(challenge.type, 24)}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{title}</span>
                      <Badge
                        variant="outline"
                        className={cn('text-[10px] px-1.5 py-0', getDifficultyColor(challenge.difficulty))}
                      >
                        {getDifficultyLabel(challenge.difficulty)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                </div>
                {challenge.completed ? (
                  <PixelCheckCircle size={20} className="text-green-400 flex-shrink-0" />
                ) : (
                  <span className="text-xs text-purple-400 font-medium">
                    +{challenge.xpReward} XP
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Progress value={progress} className="h-1.5 flex-1 bg-slate-700" />
                <span className="text-xs text-muted-foreground min-w-[40px] text-right">
                  {challenge.progress}/{challenge.target}
                </span>
              </div>

              {challenge.bonusReward && !challenge.completed && (
                <div className="mt-2 flex items-center gap-1 text-xs text-amber-400">
                  <PixelGift size={12} />
                  <span>
                    {challenge.bonusReward.type === 'tokens'
                      ? `+${challenge.bonusReward.value} ${challenge.bonusReward.tokenId?.toUpperCase()}`
                      : `×${challenge.bonusReward.value} XP boost`}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* All completed bonus */}
        <div
          className={cn(
            'p-3 rounded-lg border-2 border-dashed transition-all',
            allCompleted
              ? 'bg-gradient-to-r from-amber-900/30 to-orange-900/30 border-amber-500/50'
              : 'bg-slate-800/30 border-slate-600/30'
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PixelSparkles size={20} className={cn(allCompleted ? 'text-amber-400' : 'text-slate-500')} />
              <div>
                <span className="text-sm font-medium">
                  {language === 'en' ? 'Complete All 3' : 'Completa los 3'}
                </span>
                <p className="text-xs text-muted-foreground">
                  {language === 'en' ? 'Bonus reward!' : '¡Recompensa extra!'}
                </p>
              </div>
            </div>
            {canClaimBonus ? (
              <Button
                size="sm"
                className="bg-amber-500 hover:bg-amber-600 text-black"
                onClick={onClaimAllBonus}
              >
                +{ALL_COMPLETED_BONUS_XP} XP
              </Button>
            ) : challengesState.allCompletedBonus ? (
              <PixelCheckCircle size={20} className="text-amber-400" />
            ) : (
              <span className="text-xs text-muted-foreground">
                +{ALL_COMPLETED_BONUS_XP} XP
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
