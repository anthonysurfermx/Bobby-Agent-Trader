import { useGame } from '@/components/games/mercado-lp/contexts/GameContext';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { getPlayerLevel, getXPProgress, getXPMultiplier, getFeeDiscount } from '@/components/games/mercado-lp/data/playerLevels';
import { useTranslation } from 'react-i18next';
import { Sparkles, Percent, Clock } from 'lucide-react';
import { TokenIcon } from './icons/GameIcons';

/**
 * Cap diario de XP escalado por nivel del jugador
 * N1-N2: 400 XP, N3-N4: 600 XP, N5-N6: 800 XP
 */
const getDailyXPCap = (playerLevel: number): number => {
  if (playerLevel >= 5) return 800;
  if (playerLevel >= 3) return 600;
  return 400;
};

/**
 * Obtiene la fecha actual en UTC como string ISO (YYYY-MM-DD)
 */
const getUTCDateString = (): string => {
  const now = new Date();
  return now.toISOString().split('T')[0];
};

export const PlayerStatsPanel = () => {
  const { player, tokens } = useGame();
  const { t } = useTranslation();

  const currentLevel = getPlayerLevel(player.xp);
  const xpProgress = getXPProgress(player.xp);

  // Calculate daily XP progress (UTC-based, with dynamic cap)
  const todayUTC = getUTCDateString();
  const dailyXPCap = getDailyXPCap(currentLevel.level);
  const dailyXP = player.dailyXPDate === todayUTC ? (player.dailyXP || 0) : 0;
  const dailyXPPercent = Math.min((dailyXP / dailyXPCap) * 100, 100);
  const dailyXPRemaining = Math.max(0, dailyXPCap - dailyXP);

  return (
    <div className="space-y-4">
      {/* XP and Level Progress */}
      <Card className="pixel-card p-4 bg-gradient-to-br from-primary/10 to-purple-500/5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{currentLevel.icon}</span>
            <div>
              <h3 className="text-sm font-bold">{currentLevel.name}</h3>
              <p className="text-xs text-muted-foreground">
                {t('mercadoLP.player.level', { level: currentLevel.level })}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{t('mercadoLP.player.xpTotal')}</p>
            <p className="text-sm font-bold">{player.xp}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">{t('mercadoLP.player.progress')}</span>
            <span className="font-mono">
              {t('mercadoLP.player.xpRange', { current: xpProgress.current, max: xpProgress.max })}
            </span>
          </div>
          <Progress value={xpProgress.percentage} className="h-2" />

          {currentLevel.level < 6 && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              {t('mercadoLP.player.xpToNext', {
                remaining: (xpProgress.max - xpProgress.current).toFixed(0),
                next: getPlayerLevel(currentLevel.maxXP + 1).name,
              })}
            </p>
          )}
        </div>

        {/* Streak indicator */}
        {player.currentStreak > 0 && (
          <div className="mt-3 pt-3 border-t border-orange-200">
            <div className="flex items-center justify-between">
              <span className="text-xs flex items-center gap-1">
                {t('mercadoLP.player.streak', {
                  days: player.currentStreak,
                  s: player.currentStreak !== 1 ? 's' : '',
                })}
              </span>
              {player.bestStreak > player.currentStreak && (
                <span className="text-xs text-muted-foreground">
                  {t('mercadoLP.player.bestStreak', { best: player.bestStreak })}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Active Perks */}
        <div className="mt-3 pt-3 border-t border-primary/20">
          <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            {t('mercadoLP.player.perks.title')}
          </h4>
          <div className="flex flex-wrap gap-2">
            {(() => {
              const xpMult = getXPMultiplier(currentLevel.level);
              const feeDisc = getFeeDiscount(currentLevel.level);
              const hasPerks = xpMult > 1 || feeDisc > 0;

              if (!hasPerks) {
                return (
                  <div className="text-xs text-muted-foreground/70 italic">
                    {t('mercadoLP.player.perks.none')} —{' '}
                    {t('mercadoLP.player.perks.unlockAt', { level: 2 })}
                  </div>
                );
              }

              return (
                <>
                  {xpMult > 1 && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/15 text-amber-600 text-xs font-medium">
                      <Sparkles className="w-3 h-3" />
                      {t('mercadoLP.player.perks.xpBonus', { percent: Math.round((xpMult - 1) * 100) })}
                    </span>
                  )}
                  {feeDisc > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-600 text-xs font-medium">
                      <Percent className="w-3 h-3" />
                      {t('mercadoLP.player.perks.feeDiscount', { percent: Math.round(feeDisc * 100) })}
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Daily XP Progress */}
        <div className="mt-3 pt-3 border-t border-primary/20">
          <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {t('mercadoLP.player.dailyXP.title')}
          </h4>
          <div className="space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">
                {t('mercadoLP.player.dailyXP.progress', { current: dailyXP, max: dailyXPCap })}
              </span>
              <span className={dailyXPRemaining > 0 ? 'text-primary' : 'text-amber-600'}>
                {dailyXPRemaining > 0
                  ? t('mercadoLP.player.dailyXP.remaining', { remaining: dailyXPRemaining })
                  : t('mercadoLP.player.dailyXP.complete')}
              </span>
            </div>
            <Progress
              value={dailyXPPercent}
              className={`h-1.5 ${dailyXPPercent >= 100 ? 'bg-amber-200' : ''}`}
            />
          </div>
        </div>
      </Card>

      <Card className="pixel-card p-4" data-tutorial="inventory">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <span>🧺</span> {t('mercadoLP.player.inventory')}
        </h3>

        <ScrollArea className="h-[200px]">
          <div className="space-y-2">
            {Object.entries(player.inventory).map(([tokenId, amount]) => {
              const token = tokens.find(t => t.id === tokenId);
              if (!token || amount === 0) return null;

              return (
                <div key={tokenId} className="pixel-card bg-muted p-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TokenIcon tokenId={token.id} size={24} />
                    <span className="text-xs font-bold">{token.symbol}</span>
                  </div>
                  <span className="text-xs font-mono">{amount.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
};
