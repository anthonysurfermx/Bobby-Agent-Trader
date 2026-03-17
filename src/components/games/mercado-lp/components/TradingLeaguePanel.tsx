import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TradingLeague, LeaguePlayer, LeagueTier } from '../types/game';
import {
  leagueTiers,
  getTopPlayers,
  getPlayersAroundRank,
  formatVolume,
  getTimeRemainingInWeek,
  getPlayerReward,
} from '../data/tradingLeagues';
import { Trophy, TrendingUp, Users, Timer, Crown, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TradingLeaguePanelProps {
  league: TradingLeague;
  showFull?: boolean;
}

const tierColors: Record<LeagueTier, string> = {
  bronze: 'from-amber-700/40 to-orange-800/40 border-amber-600/50',
  silver: 'from-slate-400/40 to-zinc-500/40 border-slate-400/50',
  gold: 'from-yellow-500/40 to-amber-500/40 border-yellow-400/50',
  platinum: 'from-cyan-400/40 to-blue-400/40 border-cyan-400/50',
  diamond: 'from-violet-500/40 to-purple-500/40 border-violet-400/50',
};

const tierBadgeColors: Record<LeagueTier, string> = {
  bronze: 'bg-amber-700/50 text-amber-200 border-amber-600',
  silver: 'bg-slate-500/50 text-slate-200 border-slate-400',
  gold: 'bg-yellow-500/50 text-yellow-100 border-yellow-400',
  platinum: 'bg-cyan-500/50 text-cyan-100 border-cyan-400',
  diamond: 'bg-violet-500/50 text-violet-100 border-violet-400',
};

function PlayerRow({ player, isCurrentPlayer, rank }: { player: LeaguePlayer; isCurrentPlayer: boolean; rank?: number }) {
  const displayRank = rank ?? player.rank;
  const tier = leagueTiers[player.tier];

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-2 rounded-lg transition-all',
        isCurrentPlayer ? 'bg-primary/20 border border-primary/30' : 'hover:bg-slate-800/50'
      )}
    >
      {/* Rank */}
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm',
        displayRank <= 3 ? 'bg-gradient-to-br' : 'bg-slate-700',
        displayRank === 1 && 'from-yellow-400 to-amber-500 text-black',
        displayRank === 2 && 'from-slate-300 to-slate-400 text-black',
        displayRank === 3 && 'from-amber-600 to-orange-700'
      )}>
        {displayRank <= 3 ? <Crown className="w-4 h-4" /> : displayRank}
      </div>

      {/* Player info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">{player.avatar}</span>
          <span className={cn('font-medium truncate', isCurrentPlayer && 'text-primary')}>
            {player.name}
          </span>
          <Badge variant="outline" className={cn('text-[10px] px-1', tierBadgeColors[player.tier])}>
            {tier.icon}
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="text-right">
        <div className="font-bold">{formatVolume(player.weeklyVolume)}</div>
        <div className={cn(
          'text-xs flex items-center justify-end gap-1',
          player.weeklyProfit >= 0 ? 'text-green-400' : 'text-red-400'
        )}>
          {player.weeklyProfit >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
          {Math.abs(player.weeklyProfit)}
        </div>
      </div>
    </div>
  );
}

export function TradingLeaguePanel({ league, showFull = false }: TradingLeaguePanelProps) {
  const { i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'es';

  const tier = leagueTiers[league.playerTier];
  const tierName = language === 'en' ? tier.nameEn : tier.name;
  const timeRemaining = getTimeRemainingInWeek();
  const reward = getPlayerReward(league);

  const topPlayers = getTopPlayers(league, showFull ? 50 : 5);
  const playersAroundMe = showFull ? [] : getPlayersAroundRank(league, 2);

  // Check if player is in top list
  const playerInTop = topPlayers.some(p => p.id === 'player');

  return (
    <Card className={cn('bg-gradient-to-br border', tierColors[league.playerTier])}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="w-5 h-5" style={{ color: tier.color }} />
            {language === 'en' ? 'Trading League' : 'Liga de Trading'}
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Timer className="w-3 h-3" />
            {timeRemaining.days}d {timeRemaining.hours}h
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Player tier and rank */}
        <div className="flex items-center justify-between p-3 bg-black/20 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="text-4xl">{tier.icon}</div>
            <div>
              <div className="text-xl font-bold" style={{ color: tier.color }}>
                {tierName}
              </div>
              <div className="text-sm text-muted-foreground">
                {language === 'en' ? 'Rank' : 'Posición'} #{league.playerRank}
              </div>
            </div>
          </div>

          {/* Potential reward */}
          {reward && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground mb-1">
                {language === 'en' ? 'Week reward' : 'Recompensa semanal'}
              </div>
              <div className="text-lg font-bold text-amber-400">+{reward.xpReward} XP</div>
              {reward.tokenReward && (
                <div className="text-xs text-green-400">
                  +{reward.tokenReward.amount} {reward.tokenReward.tokenId.toUpperCase()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Weekly stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-black/20 rounded-lg">
            <TrendingUp className="w-4 h-4 mx-auto mb-1 text-blue-400" />
            <div className="font-bold">{formatVolume(league.players.find(p => p.id === 'player')?.weeklyVolume || 0)}</div>
            <div className="text-[10px] text-muted-foreground">
              {language === 'en' ? 'Volume' : 'Volumen'}
            </div>
          </div>
          <div className="p-2 bg-black/20 rounded-lg">
            <Users className="w-4 h-4 mx-auto mb-1 text-purple-400" />
            <div className="font-bold">{league.players.find(p => p.id === 'player')?.weeklySwaps || 0}</div>
            <div className="text-[10px] text-muted-foreground">Swaps</div>
          </div>
          <div className="p-2 bg-black/20 rounded-lg">
            {(league.players.find(p => p.id === 'player')?.weeklyProfit || 0) >= 0
              ? <ArrowUp className="w-4 h-4 mx-auto mb-1 text-green-400" />
              : <ArrowDown className="w-4 h-4 mx-auto mb-1 text-red-400" />
            }
            <div className={cn(
              'font-bold',
              (league.players.find(p => p.id === 'player')?.weeklyProfit || 0) >= 0
                ? 'text-green-400'
                : 'text-red-400'
            )}>
              {league.players.find(p => p.id === 'player')?.weeklyProfit || 0}
            </div>
            <div className="text-[10px] text-muted-foreground">P&L</div>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="space-y-1">
          <div className="text-sm font-medium mb-2">
            {language === 'en' ? 'Leaderboard' : 'Clasificación'}
          </div>

          {/* Top players */}
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {topPlayers.map((player, index) => (
              <PlayerRow
                key={player.id}
                player={player}
                isCurrentPlayer={player.id === 'player'}
                rank={index + 1}
              />
            ))}

            {/* Separator if player not in top */}
            {!playerInTop && playersAroundMe.length > 0 && (
              <>
                <div className="flex items-center gap-2 py-2">
                  <div className="flex-1 h-px bg-slate-700" />
                  <Minus className="w-4 h-4 text-slate-500" />
                  <div className="flex-1 h-px bg-slate-700" />
                </div>
                {playersAroundMe.map((player) => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    isCurrentPlayer={player.id === 'player'}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        {/* Tier progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {language === 'en' ? 'Progress to next tier' : 'Progreso al siguiente tier'}
            </span>
            <span>{tier.icon} → {Object.values(leagueTiers).find(t => t.minRank < tier.minRank)?.icon || '🏆'}</span>
          </div>
          <Progress
            value={Math.max(0, 100 - (league.playerRank / tier.minRank) * 100)}
            className="h-2"
          />
        </div>
      </CardContent>
    </Card>
  );
}

// Compact version for sidebar
export function TradingLeagueBadge({ league }: { league: TradingLeague }) {
  const tier = leagueTiers[league.playerTier];

  return (
    <Badge
      variant="outline"
      className={cn('px-2 py-1', tierBadgeColors[league.playerTier])}
    >
      <Trophy className="w-3 h-3 mr-1" />
      #{league.playerRank} {tier.icon}
    </Badge>
  );
}
