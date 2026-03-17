import { Card } from '@/components/ui/card';
import { useGame } from '@/components/games/mercado-lp/contexts/GameContext';
import {
  TargetIcon,
  CheckCircleIcon,
  PendingIcon,
  SwapperIcon,
  ProviderIcon,
  FarmerIcon,
  AuctioneerIcon,
} from './icons/GameIcons';
import { useTranslation } from 'react-i18next';

interface Mission {
  id: string;
  level: 1 | 2 | 3 | 4;
  title: string;
  description: string;
  help: string;
  isCompleted: boolean;
  isCurrent: boolean;
}

export const MissionsCard = () => {
  const { player, tokens, auction } = useGame();
  const { t } = useTranslation();

  // Define all missions across levels
  const missions: Mission[] = [
    {
      id: 'swap',
      level: 1,
      title: t('mercadoLP.missions.items.swap.title'),
      description: t('mercadoLP.missions.items.swap.description'),
      help: t('mercadoLP.missions.items.swap.help'),
      isCompleted: player.swapCount > 0,
      isCurrent: player.swapCount === 0,
    },
    {
      id: 'lp',
      level: 2,
      title: t('mercadoLP.missions.items.lp.title'),
      description: t('mercadoLP.missions.items.lp.description'),
      help: t('mercadoLP.missions.items.lp.help'),
      isCompleted: player.lpPositions.length > 0 || player.totalFeesEarned > 0,
      isCurrent: player.swapCount > 0 && player.lpPositions.length === 0,
    },
    {
      id: 'token',
      level: 3,
      title: t('mercadoLP.missions.items.token.title'),
      description: t('mercadoLP.missions.items.token.description'),
      help: t('mercadoLP.missions.items.token.help'),
      isCompleted: tokens.filter(t => !t.isBaseToken && !['mango', 'limon', 'sandia', 'platano'].includes(t.id)).length > 0,
      isCurrent: (player.lpPositions.length > 0 || player.totalFeesEarned > 0) &&
                 tokens.filter(t => !t.isBaseToken && !['mango', 'limon', 'sandia', 'platano'].includes(t.id)).length === 0,
    },
    {
      id: 'auction',
      level: 4,
      title: t('mercadoLP.missions.items.auction.title'),
      description: t('mercadoLP.missions.items.auction.description'),
      help: t('mercadoLP.missions.items.auction.help'),
      isCompleted: player.stats.auctionBidsPlaced > 0,
      isCurrent: tokens.filter(t => !t.isBaseToken && !['mango', 'limon', 'sandia', 'platano'].includes(t.id)).length > 0 &&
                 player.stats.auctionBidsPlaced === 0,
    },
  ];

  const currentMission =
    missions.find(m => m.isCurrent) ||
    missions.find(m => !m.isCompleted) ||
    missions[missions.length - 1];

  const getLevelIcon = (level: number, isCompleted: boolean, isCurrent: boolean) => {
    const iconClass = isCompleted
      ? 'text-emerald-500'
      : isCurrent
        ? 'text-primary'
        : 'text-muted-foreground/50';

    const size = 20;

    switch (level) {
      case 1:
        return <SwapperIcon size={size} className={iconClass} />;
      case 2:
        return <ProviderIcon size={size} className={iconClass} />;
      case 3:
        return <FarmerIcon size={size} className={iconClass} />;
      case 4:
        return <AuctioneerIcon size={size} className={iconClass} />;
      default:
        return null;
    }
  };

  return (
    <Card className="pixel-card p-4 bg-card space-y-4">
      <div className="flex items-center gap-2">
        <TargetIcon size={18} className="text-primary" />
        <h3 className="font-bold text-sm">{t('mercadoLP.missions.current')}</h3>
      </div>

      {currentMission && (
        <div
          className={`pixel-card p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
            currentMission.isCompleted
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-primary/5 border-primary/30'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              {getLevelIcon(currentMission.level, currentMission.isCompleted, currentMission.isCurrent)}
            </div>
              <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('mercadoLP.missions.levelLabel', { level: currentMission.level })}
              </p>
              <p className="font-semibold text-sm">{currentMission.title}</p>
              <p className="text-xs text-muted-foreground">{currentMission.description}</p>
              <p className="text-[11px] text-amber-600 flex items-center gap-1">
                {t('mercadoLP.missions.help', { text: currentMission.help })}
              </p>
            </div>
          </div>
          {currentMission.isCompleted ? (
            <div className="text-emerald-600 text-xs font-semibold">{t('mercadoLP.missions.status.completed')}</div>
          ) : (
            <div className="text-primary text-xs font-semibold animate-pulse">{t('mercadoLP.missions.status.inProgress')}</div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <TargetIcon size={18} className="text-primary" />
        <h3 className="font-bold text-sm">{t('mercadoLP.missions.progress')}</h3>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {missions.map((mission) => (
          <div
            key={mission.id}
            className={`pixel-card p-3 text-sm transition-all ${
              mission.isCompleted
                ? 'bg-emerald-50 border-emerald-200'
                : mission.isCurrent
                  ? 'bg-primary/5 border-primary/30 ring-1 ring-primary/20'
                  : 'bg-muted/30 border-muted'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {getLevelIcon(mission.level, mission.isCompleted, mission.isCurrent)}
                <p className={`font-semibold text-xs ${
                  mission.isCompleted
                    ? 'text-emerald-700'
                    : mission.isCurrent
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                }`}>
                  {mission.title}
                </p>
              </div>
              {mission.isCompleted ? (
                <CheckCircleIcon size={18} className="text-emerald-500 shrink-0" />
              ) : mission.isCurrent ? (
                <PendingIcon size={18} className="text-primary shrink-0 animate-pulse" />
              ) : (
                <div className="w-[18px] h-[18px] rounded-full border-2 border-muted-foreground/30" />
              )}
            </div>
            <p className={`text-[11px] mt-1.5 leading-relaxed ${
              mission.isCompleted || mission.isCurrent
                ? 'text-muted-foreground'
                : 'text-muted-foreground/60'
            }`}>
              {mission.description}
            </p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="mt-3 pt-3 border-t border-border">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>{t('mercadoLP.missions.totalProgress')}</span>
          <span className="font-semibold">
            {t('mercadoLP.missions.levelsDone', { done: missions.filter(m => m.isCompleted).length })}
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-500"
            style={{ width: `${(missions.filter(m => m.isCompleted).length / 4) * 100}%` }}
          />
        </div>
      </div>
    </Card>
  );
};
