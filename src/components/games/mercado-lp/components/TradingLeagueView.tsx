import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TradingLeague } from '../types/game';
import { TradingLeaguePanel } from './TradingLeaguePanel';
import { leagueTiers, getTimeRemainingInWeek, getPlayerReward } from '../data/tradingLeagues';
import { Trophy, Target, TrendingUp, Gift, Clock, ArrowRight, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TradingLeagueViewProps {
  league: TradingLeague;
  onNavigateToSwap?: () => void;
  onNavigateToLP?: () => void;
}

export function TradingLeagueView({ league, onNavigateToSwap, onNavigateToLP }: TradingLeagueViewProps) {
  const { i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'es';

  const tier = leagueTiers[league.playerTier];
  const tierName = language === 'en' ? tier.nameEn : tier.name;
  const timeRemaining = getTimeRemainingInWeek();
  const reward = getPlayerReward(league);

  // Calculate what's needed to reach next tier
  const nextTierEntry = Object.entries(leagueTiers).find(
    ([_, t]) => t.minRank < tier.minRank
  );
  const nextTier = nextTierEntry ? { key: nextTierEntry[0] as keyof typeof leagueTiers, ...nextTierEntry[1] } : null;
  const positionsToClimb = nextTier ? league.playerRank - nextTier.minRank : 0;

  return (
    <div className="space-y-4 sm:space-y-6 p-2 sm:p-4">
      {/* Header */}
      <div className="text-center space-y-1 sm:space-y-2">
        <Badge variant="outline" className="mb-1 sm:mb-2 text-[10px] sm:text-xs">
          {language === 'en' ? 'Level 5' : 'Nivel 5'}
        </Badge>
        <h1 className="text-xl sm:text-3xl font-bold flex items-center justify-center gap-2 sm:gap-3">
          <Trophy className="w-5 h-5 sm:w-8 sm:h-8 text-amber-400 shrink-0" />
          <span className="truncate">{language === 'en' ? 'Trading Leagues' : 'Ligas de Trading'}</span>
        </h1>
        <p className="text-xs sm:text-base text-muted-foreground max-w-md mx-auto px-2">
          {language === 'en'
            ? 'Compete with other traders weekly. Climb the ranks and earn exclusive rewards!'
            : '¡Compite con otros traders semanalmente. Sube de rango y gana recompensas exclusivas!'}
        </p>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Main league panel */}
        <div className="lg:col-span-2">
          <TradingLeaguePanel league={league} showFull />
        </div>

        {/* Side info */}
        <div className="space-y-3 sm:space-y-4">
          {/* Time remaining */}
          <Card className="bg-gradient-to-br from-blue-900/40 to-indigo-900/40 border-blue-500/30">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <Clock className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400 shrink-0" />
                <div>
                  <div className="text-xs sm:text-sm text-muted-foreground">
                    {language === 'en' ? 'Week ends in' : 'La semana termina en'}
                  </div>
                  <div className="text-lg sm:text-2xl font-bold">
                    {timeRemaining.days}d {timeRemaining.hours}h
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Current reward preview */}
          {reward && (
            <Card className="bg-gradient-to-br from-amber-900/40 to-orange-900/40 border-amber-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Gift className="w-4 h-4 text-amber-400" />
                  {language === 'en' ? 'Your Current Reward' : 'Tu Recompensa Actual'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">XP</span>
                  <span className="font-bold text-amber-400">+{reward.xpReward}</span>
                </div>
                {reward.tokenReward && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{reward.tokenReward.tokenId.toUpperCase()}</span>
                    <span className="font-bold text-green-400">+{reward.tokenReward.amount}</span>
                  </div>
                )}
                {reward.badgeId && (
                  <div className="flex items-center gap-2 text-purple-400">
                    <Star className="w-4 h-4" />
                    <span className="text-sm">
                      {language === 'en' ? 'Exclusive Badge' : 'Badge Exclusivo'}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Next tier goal */}
          {nextTier && positionsToClimb > 0 && (
            <Card className="bg-gradient-to-br from-purple-900/40 to-violet-900/40 border-purple-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-400" />
                  {language === 'en' ? 'Next Tier' : 'Siguiente Tier'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{tier.icon}</div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground" />
                  <div className="text-3xl">{nextTier.icon}</div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {language === 'en'
                    ? `Climb ${positionsToClimb} positions to reach ${nextTier.nameEn}`
                    : `Sube ${positionsToClimb} posiciones para llegar a ${nextTier.name}`}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Quick actions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {language === 'en' ? 'Boost Your Rank' : 'Mejora tu Posición'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                className="w-full justify-between"
                variant="outline"
                onClick={onNavigateToSwap}
              >
                <span className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  {language === 'en' ? 'Trade More' : 'Tradear Más'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {language === 'en' ? '+Volume' : '+Volumen'}
                </span>
              </Button>
              <Button
                className="w-full justify-between"
                variant="outline"
                onClick={onNavigateToLP}
              >
                <span className="flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  {language === 'en' ? 'Provide LP' : 'Proveer LP'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {language === 'en' ? '+Fees' : '+Fees'}
                </span>
              </Button>
            </CardContent>
          </Card>

          {/* Tier descriptions */}
          <Card className="bg-slate-800/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {language === 'en' ? 'Tier Rewards' : 'Recompensas por Tier'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(leagueTiers).reverse().map(([key, t]) => (
                <div
                  key={key}
                  className={cn(
                    'flex items-center justify-between p-2 rounded-lg',
                    league.playerTier === key && 'bg-primary/20 border border-primary/30'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{t.icon}</span>
                    <span className="text-sm">{language === 'en' ? t.nameEn : t.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Top {t.minRank === 1 ? 10 : t.minRank}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
