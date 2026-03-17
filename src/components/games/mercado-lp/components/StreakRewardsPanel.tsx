import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StreakState, StreakReward } from '../types/game';
import {
  streakRewards,
  getAvailableRewards,
  getNextReward,
  getDaysUntilNextReward,
  getDailyLoginBonus,
  getStreakStatus,
  formatStreak,
  getRewardTitleEn,
} from '../data/streakRewards';
import {
  PixelFlame,
  PixelGift,
  PixelCheckCircle,
  PixelLock,
  PixelSparkles,
  PixelCalendar,
  PixelStar,
  PixelTrophy,
  PixelCrown,
  PixelMedal,
  BoltIcon,
} from './icons/GameIcons';
import { cn } from '@/lib/utils';

// Map streak days to pixel icons
const getStreakRewardIcon = (days: number, size: number = 20) => {
  const iconMap: Record<number, React.ReactNode> = {
    3: <PixelFlame size={size} className="text-orange-400" />,
    7: <PixelStar size={size} className="text-amber-400" />,
    14: <BoltIcon size={size} className="text-blue-400" />,
    21: <PixelTrophy size={size} className="text-yellow-500" />,
    30: <PixelCrown size={size} className="text-amber-300" />,
    60: <PixelMedal size={size} className="text-purple-400" />,
    100: <PixelSparkles size={size} className="text-cyan-400" />,
  };
  return iconMap[days] || <PixelFlame size={size} className="text-orange-400" />;
};

interface StreakRewardsPanelProps {
  streakState: StreakState;
  onClaimReward?: (days: number) => void;
  onClaimDailyBonus?: () => void;
  compact?: boolean;
}

export function StreakRewardsPanel({
  streakState,
  onClaimReward,
  onClaimDailyBonus,
  compact = false,
}: StreakRewardsPanelProps) {
  const { i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'es';

  const status = getStreakStatus(streakState);
  const availableRewards = getAvailableRewards(streakState.currentStreak, streakState.claimedRewards);
  const nextReward = getNextReward(streakState.currentStreak, streakState.claimedRewards);
  const daysUntilNext = getDaysUntilNextReward(streakState.currentStreak, streakState.claimedRewards);
  const dailyBonus = getDailyLoginBonus(streakState.currentStreak);

  const getRewardTitle = (reward: StreakReward): string => {
    return language === 'en' ? getRewardTitleEn(reward.days) : reward.title;
  };

  const getSpecialRewardText = (reward: StreakReward): string | null => {
    if (!reward.specialReward) return null;

    switch (reward.specialReward.type) {
      case 'tokens':
        return `+${reward.specialReward.value} ${reward.specialReward.tokenId?.toUpperCase()}`;
      case 'multiplier':
        return language === 'en' ? `×${reward.specialReward.value} XP boost` : `×${reward.specialReward.value} boost XP`;
      case 'badge':
        return language === 'en' ? 'Exclusive badge' : 'Badge exclusivo';
      default:
        return null;
    }
  };

  if (compact) {
    return (
      <Card className="bg-gradient-to-br from-orange-900/40 to-red-900/40 border-orange-500/30">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PixelFlame size={20} className={cn(status.isActive ? 'text-orange-400 animate-pulse' : 'text-slate-500')} />
              <div>
                <span className="text-lg font-bold">{streakState.currentStreak}</span>
                <span className="text-xs text-muted-foreground ml-1">
                  {language === 'en' ? 'days' : 'días'}
                </span>
              </div>
            </div>
            {!streakState.todayBonusClaimed && (
              <Button size="sm" variant="ghost" className="text-orange-400" onClick={onClaimDailyBonus}>
                <PixelGift size={16} className="mr-1" />
                +{dailyBonus} XP
              </Button>
            )}
          </div>
          {nextReward && daysUntilNext > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">
                  {language === 'en' ? 'Next:' : 'Próximo:'} {getRewardTitle(nextReward)}
                </span>
                <span>{daysUntilNext} {language === 'en' ? 'days' : 'días'}</span>
              </div>
              <Progress value={status.percentToNext} className="h-1.5 bg-orange-900/50" />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-orange-900/40 to-red-900/40 border-orange-500/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <PixelFlame size={20} className={cn(status.isActive ? 'text-orange-400 animate-pulse' : 'text-slate-500')} />
            {language === 'en' ? 'Daily Streak' : 'Racha Diaria'}
          </CardTitle>
          <Badge variant="outline" className="bg-orange-500/20 border-orange-500/30">
            <PixelCalendar size={12} className="mr-1" />
            {language === 'en' ? 'Best:' : 'Mejor:'} {streakState.bestStreak}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current streak display */}
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-xl border border-orange-500/30">
          <div className="flex items-center gap-3">
            <div className="relative">
              <PixelFlame size={40} className="text-orange-400" />
              {status.isActive && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
              )}
            </div>
            <div>
              <div className="text-3xl font-bold">{streakState.currentStreak}</div>
              <div className="text-sm text-muted-foreground">
                {formatStreak(streakState.currentStreak)}
              </div>
            </div>
          </div>

          {/* Daily login bonus */}
          {!streakState.todayBonusClaimed ? (
            <Button
              className="bg-orange-500 hover:bg-orange-600"
              onClick={onClaimDailyBonus}
            >
              <PixelGift size={16} className="mr-2" />
              +{dailyBonus} XP
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-green-400">
              <PixelCheckCircle size={20} />
              <span className="text-sm">
                {language === 'en' ? 'Claimed today!' : '¡Reclamado hoy!'}
              </span>
            </div>
          )}
        </div>

        {/* Progress to next reward */}
        {nextReward && daysUntilNext > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {language === 'en' ? 'Next reward:' : 'Próxima recompensa:'}
              </span>
              <span className="font-medium">{getRewardTitle(nextReward)}</span>
            </div>
            <div className="relative">
              <Progress value={status.percentToNext} className="h-2 bg-orange-900/50" />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {daysUntilNext} {language === 'en' ? 'days left' : 'días más'}
              </div>
            </div>
          </div>
        )}

        {/* Available rewards to claim */}
        {availableRewards.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-amber-400 flex items-center">
              <PixelSparkles size={16} className="mr-1" />
              {language === 'en' ? 'Rewards to claim!' : '¡Recompensas disponibles!'}
            </div>
            {availableRewards.map(reward => (
              <div
                key={reward.days}
                className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <span className="flex-shrink-0">{getStreakRewardIcon(reward.days, 28)}</span>
                  <div>
                    <div className="font-medium">{getRewardTitle(reward)}</div>
                    <div className="text-xs text-muted-foreground">
                      +{reward.xpBonus} XP
                      {reward.specialReward && (
                        <span className="text-amber-400 ml-2">
                          + {getSpecialRewardText(reward)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-600 text-black"
                  onClick={() => onClaimReward?.(reward.days)}
                >
                  {language === 'en' ? 'Claim' : 'Reclamar'}
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming milestones */}
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            {language === 'en' ? 'Upcoming milestones' : 'Próximos hitos'}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {streakRewards.slice(0, 4).map(reward => {
              const isAchieved = streakState.currentStreak >= reward.days;
              const isClaimed = streakState.claimedRewards.includes(reward.days);

              return (
                <div
                  key={reward.days}
                  className={cn(
                    'p-2 rounded-lg text-center border transition-all',
                    isAchieved && isClaimed
                      ? 'bg-green-900/20 border-green-500/30'
                      : isAchieved
                      ? 'bg-amber-900/20 border-amber-500/30 animate-pulse'
                      : 'bg-slate-800/30 border-slate-700/30 opacity-50'
                  )}
                >
                  <div>{getStreakRewardIcon(reward.days, 24)}</div>
                  <div className="text-xs font-medium">{reward.days}d</div>
                  {isClaimed && <PixelCheckCircle size={12} className="mx-auto text-green-400" />}
                  {!isAchieved && <PixelLock size={12} className="mx-auto text-slate-500" />}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
