import { LeagueTier, LeaguePlayer, TradingLeague, LeagueReward } from '../types/game';

/**
 * League tier configuration
 */
export const leagueTiers: Record<LeagueTier, { name: string; nameEn: string; icon: string; color: string; minRank: number }> = {
  bronze: { name: 'Bronce', nameEn: 'Bronze', icon: '🥉', color: '#CD7F32', minRank: 76 },
  silver: { name: 'Plata', nameEn: 'Silver', icon: '🥈', color: '#C0C0C0', minRank: 51 },
  gold: { name: 'Oro', nameEn: 'Gold', icon: '🥇', color: '#FFD700', minRank: 26 },
  platinum: { name: 'Platino', nameEn: 'Platinum', icon: '💎', color: '#E5E4E2', minRank: 11 },
  diamond: { name: 'Diamante', nameEn: 'Diamond', icon: '👑', color: '#B9F2FF', minRank: 1 },
};

/**
 * League rewards by tier
 */
export const leagueRewards: LeagueReward[] = [
  { tier: 'diamond', minRank: 1, maxRank: 10, xpReward: 500, tokenReward: { tokenId: 'peso', amount: 100 }, badgeId: 'league-diamond' },
  { tier: 'platinum', minRank: 11, maxRank: 25, xpReward: 300, tokenReward: { tokenId: 'peso', amount: 50 } },
  { tier: 'gold', minRank: 26, maxRank: 50, xpReward: 200, tokenReward: { tokenId: 'peso', amount: 25 } },
  { tier: 'silver', minRank: 51, maxRank: 75, xpReward: 100 },
  { tier: 'bronze', minRank: 76, maxRank: 100, xpReward: 50 },
];

/**
 * NPC competitor names for simulation
 */
const npcNames = [
  'CryptoChef', 'MangoPro', 'DeFiKing', 'LiquidezMax', 'TokenMaster',
  'FruteroX', 'SwapNinja', 'PoolShark', 'HodlHero', 'YieldFarmer',
  'BlockBoss', 'ChainChamp', 'DexDominator', 'LPLegend', 'TradeWizard',
  'MarketMaven', 'CoinCrusader', 'VaultViper', 'StakeSniper', 'GasSaver',
  'WhaleWatcher', 'ArbitrageAce', 'SlippageSlayer', 'ImpermanentIgor', 'RugPuller',
  'DiamondHands', 'PaperHands', 'MoonBoy', 'BearSlayer', 'BullRunner',
  'SatoshiFan', 'VitalikJr', 'GasGuzzler', 'MEVMaster', 'FlashLoanFred',
  'OracleSage', 'HookHacker', 'BridgeBuilder', 'LayerLeaper', 'RollupRider',
];

const npcAvatars = ['🦊', '🐻', '🦁', '🐸', '🦅', '🐺', '🦇', '🐙', '🦑', '🦈'];

/**
 * Get current week number of the year
 */
export const getCurrentWeekNumber = (): number => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  return Math.ceil(diff / oneWeek);
};

/**
 * Get week start and end dates
 */
export const getWeekDates = (weekNumber: number): { start: string; end: string } => {
  const now = new Date();
  const year = now.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const weekStart = new Date(jan1.getTime() + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000);
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);

  return {
    start: weekStart.toISOString().split('T')[0],
    end: weekEnd.toISOString().split('T')[0],
  };
};

/**
 * Generate simulated NPC competitors for the league
 */
const generateNPCCompetitors = (count: number, weekSeed: number): LeaguePlayer[] => {
  const shuffledNames = [...npcNames].sort(() => Math.random() - 0.5);

  return shuffledNames.slice(0, count).map((name, index) => {
    // Use week seed for consistent-ish stats per week
    const baseSeed = weekSeed + index;
    const volumeMultiplier = Math.sin(baseSeed) * 0.5 + 1;
    const profitMultiplier = Math.cos(baseSeed) * 0.5 + 0.5;

    return {
      id: `npc-${name.toLowerCase()}`,
      name,
      avatar: npcAvatars[index % npcAvatars.length],
      weeklyVolume: Math.floor(500 + Math.random() * 2000 * volumeMultiplier),
      weeklyProfit: Math.floor((Math.random() - 0.3) * 200 * profitMultiplier),
      weeklySwaps: Math.floor(10 + Math.random() * 50),
      rank: 0,
      tier: 'bronze' as LeagueTier,
    };
  });
};

/**
 * Determine tier from rank
 */
export const getTierFromRank = (rank: number): LeagueTier => {
  if (rank <= 10) return 'diamond';
  if (rank <= 25) return 'platinum';
  if (rank <= 50) return 'gold';
  if (rank <= 75) return 'silver';
  return 'bronze';
};

/**
 * Calculate player rank and update tiers
 */
const calculateRankings = (players: LeaguePlayer[]): LeaguePlayer[] => {
  // Sort by weekly volume (primary), then profit (secondary)
  const sorted = [...players].sort((a, b) => {
    if (b.weeklyVolume !== a.weeklyVolume) {
      return b.weeklyVolume - a.weeklyVolume;
    }
    return b.weeklyProfit - a.weeklyProfit;
  });

  return sorted.map((player, index) => ({
    ...player,
    rank: index + 1,
    tier: getTierFromRank(index + 1),
  }));
};

/**
 * Initialize or get current trading league
 */
export const initTradingLeague = (
  existingLeague: TradingLeague | undefined,
  playerStats: { volume: number; profit: number; swaps: number },
  playerName: string,
  playerAvatar: string
): TradingLeague => {
  const currentWeek = getCurrentWeekNumber();
  const { start, end } = getWeekDates(currentWeek);

  // Check if existing league is still current
  if (existingLeague && existingLeague.weekNumber === currentWeek) {
    // Update player stats in existing league
    const updatedPlayers = existingLeague.players.map(p => {
      if (p.id === 'player') {
        return {
          ...p,
          weeklyVolume: playerStats.volume,
          weeklyProfit: playerStats.profit,
          weeklySwaps: playerStats.swaps,
        };
      }
      return p;
    });

    const rankedPlayers = calculateRankings(updatedPlayers);
    const playerRank = rankedPlayers.find(p => p.id === 'player')?.rank || 50;

    return {
      ...existingLeague,
      players: rankedPlayers,
      playerRank,
      playerTier: getTierFromRank(playerRank),
    };
  }

  // Create new league for new week
  const npcPlayers = generateNPCCompetitors(49, currentWeek);

  const playerEntry: LeaguePlayer = {
    id: 'player',
    name: playerName || 'Tú',
    avatar: playerAvatar || '👤',
    weeklyVolume: playerStats.volume,
    weeklyProfit: playerStats.profit,
    weeklySwaps: playerStats.swaps,
    rank: 0,
    tier: 'bronze',
  };

  const allPlayers = calculateRankings([playerEntry, ...npcPlayers]);
  const playerRank = allPlayers.find(p => p.id === 'player')?.rank || 50;

  return {
    id: `league-${currentWeek}`,
    weekNumber: currentWeek,
    startDate: start,
    endDate: end,
    players: allPlayers,
    playerRank,
    playerTier: getTierFromRank(playerRank),
    rewards: leagueRewards,
    isActive: true,
  };
};

/**
 * Update player weekly stats
 */
export const updatePlayerLeagueStats = (
  league: TradingLeague,
  volumeAdded: number,
  profitAdded: number,
  swapsAdded: number
): TradingLeague => {
  const updatedPlayers = league.players.map(p => {
    if (p.id === 'player') {
      return {
        ...p,
        weeklyVolume: p.weeklyVolume + volumeAdded,
        weeklyProfit: p.weeklyProfit + profitAdded,
        weeklySwaps: p.weeklySwaps + swapsAdded,
      };
    }
    return p;
  });

  const rankedPlayers = calculateRankings(updatedPlayers);
  const playerRank = rankedPlayers.find(p => p.id === 'player')?.rank || 50;

  return {
    ...league,
    players: rankedPlayers,
    playerRank,
    playerTier: getTierFromRank(playerRank),
  };
};

/**
 * Get reward for player's tier
 */
export const getPlayerReward = (league: TradingLeague): LeagueReward | null => {
  return leagueRewards.find(
    r => league.playerRank >= r.minRank && league.playerRank <= r.maxRank
  ) || null;
};

/**
 * Get top N players for display
 */
export const getTopPlayers = (league: TradingLeague, count: number = 10): LeaguePlayer[] => {
  return league.players.slice(0, count);
};

/**
 * Get players around the current player's rank
 */
export const getPlayersAroundRank = (league: TradingLeague, range: number = 3): LeaguePlayer[] => {
  const playerIndex = league.players.findIndex(p => p.id === 'player');
  if (playerIndex === -1) return [];

  const start = Math.max(0, playerIndex - range);
  const end = Math.min(league.players.length, playerIndex + range + 1);

  return league.players.slice(start, end);
};

/**
 * Format volume for display
 */
export const formatVolume = (volume: number): string => {
  if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}K`;
  }
  return volume.toString();
};

/**
 * Get time remaining in current week
 */
export const getTimeRemainingInWeek = (): { days: number; hours: number } => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilSunday = (7 - dayOfWeek) % 7 || 7;
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + daysUntilSunday);
  endOfWeek.setHours(23, 59, 59, 999);

  const diff = endOfWeek.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  return { days, hours };
};
