export interface Token {
  id: string;
  name: string;
  symbol: string;
  emoji: string;
  color: string;
  isBaseToken: boolean;
}

export interface Pool {
  id: string;
  tokenA: Token;
  tokenB: Token;
  reserveA: number;
  reserveB: number;
  baseFeeBps: number;
  hook?: PoolHook;
  totalFeesCollected: { tokenA: number; tokenB: number };
  createdBy: string;
}

export interface PoolHook {
  id: string;
  name: string;
  type: 'dynamic_fee' | 'anti_mev' | 'oracle' | 'custom';
  description: string;
  feeRangeBps?: [number, number];
  icon?: string;
}

export interface LPPosition {
  poolId: string;
  sharePercent: number;
  initialReserveA: number;
  initialReserveB: number;
  feesEarned: { tokenA: number; tokenB: number };
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  level: number;
  completed: boolean;
  xpReward: number;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt?: Date;
}

export interface NPCTrader {
  id: string;
  name: string;
  avatar: string;
  personality: 'comprador' | 'vendedor' | 'especulador' | 'casual';
  preferredTokens: string[];
  catchphrase: string;
  lastTradeTime: number;
}

export interface GameEvent {
  id: string;
  name: string;
  description: string;
  effect: 'volume_boost' | 'volume_drop' | 'price_volatility' | 'token_hype';
  affectedTokens: string[];
  multiplier: number;
  duration: number;
  startTime: number;
  icon: string;
}

export interface TutorialTip {
  id: string;
  trigger: string;
  character: string;
  message: string;
  position: 'top' | 'bottom';
  shown: boolean;
}

export interface PlayerLevel {
  level: number;
  name: string;
  minXP: number;
  maxXP: number;
  icon: string;
  perks: string[];
}

export interface PlayerStats {
  totalSwapVolume: number;
  profitableSwaps: number;
  totalLPProvided: number;
  tokensCreated: number;
  auctionBidsPlaced: number;
  auctionTokensWon: number;
}

export interface PlayerState {
  inventory: Record<string, number>;
  lpPositions: LPPosition[];
  xp: number;
  level: number;
  avatar: string;
  characterName?: string;
  reputation: number;
  completedChallenges: string[];
  badges: Badge[];
  tutorialProgress: Record<string, boolean>;
  swapCount: number;
  totalFeesEarned: number;
  stats: PlayerStats;
  lastPlayedDate?: string;
  currentStreak: number;
  bestStreak: number;
  dailyXP?: number;
  dailyXPDate?: string;
}

export interface NPCActivity {
  id: string;
  npcId: string;
  action: string;
  timestamp: number;
  poolId?: string;
  tokenIn?: string;
  tokenOut?: string;
  amount?: number;
}

export type GameLevel = 1 | 2 | 3 | 4 | 5 | 6;

// === DAILY CHALLENGES ===
export type DailyChallengeType =
  | 'swap_count'      // Complete X swaps
  | 'swap_volume'     // Swap X total volume
  | 'add_liquidity'   // Add liquidity to X pools
  | 'earn_fees'       // Earn X in fees
  | 'low_slippage'    // Complete X low-slippage swaps
  | 'create_token'    // Create a token
  | 'auction_bid'     // Place X auction bids
  | 'reputation'      // Gain X reputation points
  | 'diverse_trades'  // Trade X different token pairs
  | 'profit_trade';   // Complete X profitable trades

export interface DailyChallenge {
  id: string;
  type: DailyChallengeType;
  title: string;
  description: string;
  target: number;
  progress: number;
  xpReward: number;
  bonusReward?: { type: 'tokens' | 'multiplier'; value: number; tokenId?: string };
  completed: boolean;
  icon: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface DailyChallengesState {
  challenges: DailyChallenge[];
  lastRefreshDate: string; // UTC date string
  completedToday: number;
  allCompletedBonus: boolean; // Bonus for completing all 3
}

// === MARKET EVENTS ===
export type MarketEventType =
  | 'price_surge'      // Token price increases
  | 'price_crash'      // Token price drops
  | 'liquidity_bonus'  // Extra XP for LP
  | 'trading_frenzy'   // NPCs trade more
  | 'fee_discount'     // Reduced fees
  | 'xp_boost'         // Double XP
  | 'token_spotlight'  // Specific token highlighted
  | 'whale_alert';     // Large NPC trade incoming

export interface MarketEvent {
  id: string;
  type: MarketEventType;
  title: string;
  description: string;
  icon: string;
  affectedTokens: string[]; // Token IDs or 'all'
  multiplier: number;
  duration: number; // seconds
  startTime: number; // timestamp
  isActive: boolean;
}

// === STREAK REWARDS ===
export interface StreakReward {
  days: number;
  xpBonus: number;
  title: string;
  icon: string;
  claimed: boolean;
  specialReward?: { type: 'tokens' | 'badge' | 'multiplier'; value: number; tokenId?: string };
}

export interface StreakState {
  currentStreak: number;
  bestStreak: number;
  lastPlayedDate: string;
  claimedRewards: number[]; // Array of day milestones claimed
  todayBonusClaimed: boolean;
}

// === TRADING LEAGUES (Level 5) ===
export type LeagueTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface LeaguePlayer {
  id: string;
  name: string;
  avatar: string;
  weeklyVolume: number;
  weeklyProfit: number;
  weeklySwaps: number;
  rank: number;
  tier: LeagueTier;
}

export interface TradingLeague {
  id: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  players: LeaguePlayer[];
  playerRank: number;
  playerTier: LeagueTier;
  rewards: LeagueReward[];
  isActive: boolean;
}

export interface LeagueReward {
  tier: LeagueTier;
  minRank: number;
  maxRank: number;
  xpReward: number;
  tokenReward?: { tokenId: string; amount: number };
  badgeId?: string;
}

// === MARKET MAKER MODE (Level 6) ===
export type AdvancedHookType =
  | 'volatility_oracle'   // Adjusts fees based on volatility
  | 'limit_order'         // Allows limit orders
  | 'concentrated_lp'     // Concentrated liquidity ranges
  | 'auto_rebalance'      // Auto-rebalances position
  | 'flash_loan_guard'    // Protects against flash loans
  | 'mev_share';          // Shares MEV profits with LPs

export interface AdvancedPoolHook extends PoolHook {
  advancedType?: AdvancedHookType;
  parameters?: Record<string, number>;
  unlockLevel: number;
}

export interface MarketMakerStats {
  totalVolumeProvided: number;
  totalFeesEarned: number;
  poolsCreated: number;
  uniqueTraders: number;
  averageUtilization: number;
  profitLoss: number;
}

// === AUCTION TUTORIAL ===
export interface AuctionTutorialStep {
  id: string;
  title: string;
  description: string;
  highlightElement?: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: 'next' | 'bid' | 'advance' | 'complete';
  showBidForm?: boolean;
  suggestedBid?: { maxPrice: number; totalSpend: number };
}

export interface AuctionTutorialState {
  isActive: boolean;
  currentStep: number;
  steps: AuctionTutorialStep[];
  completed: boolean;
  practiceAuction?: Auction;
}

export interface AuctionBlock {
  id: string;
  blockNumber: number;
  tokensAvailable: number;
  currentPrice: number;
  minPrice: number;
  bids: AuctionBid[];
  executed: boolean;
}

export interface AuctionBid {
  id: string;
  bidderId: string;
  bidderName: string;
  maxPrice: number;
  totalSpend: number;
  tokensWon?: number;
  averagePrice?: number;
}

export interface Auction {
  id: string;
  tokenOffered: Token;
  totalSupply: number;
  blocksCount: number;
  tokensPerBlock: number;
  blocks: AuctionBlock[];
  currentBlock: number;
  startPrice: number;
  active: boolean;
  createdBy: string;
}
