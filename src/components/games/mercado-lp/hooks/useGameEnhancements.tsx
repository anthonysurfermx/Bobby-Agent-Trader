import { useState, useEffect, useCallback } from 'react';
import {
  DailyChallengesState,
  DailyChallengeType,
  MarketEvent,
  StreakState,
  TradingLeague,
  MarketMakerStats,
  AuctionTutorialState,
} from '../types/game';
import {
  initDailyChallenges,
  updateChallengeProgress,
  ALL_COMPLETED_BONUS_XP,
  getUTCDateString,
} from '../data/dailyChallenges';
import {
  generateMarketEvent,
  isEventExpired,
  EVENT_CHECK_INTERVAL,
  EVENT_SPAWN_PROBABILITY,
  MAX_CONCURRENT_EVENTS,
  getEventMultiplier,
} from '../data/marketEvents';
import {
  updateStreakState,
  claimStreakReward,
  claimDailyBonus,
  getAvailableRewards,
} from '../data/streakRewards';
import {
  initTradingLeague,
  updatePlayerLeagueStats,
} from '../data/tradingLeagues';
import {
  initMarketMakerStats,
  updateMarketMakerStats,
} from '../data/marketMakerMode';
import {
  initAuctionTutorial,
  advanceTutorialStep,
} from '../data/auctionTutorial';
import { toast } from 'sonner';

const ENHANCEMENTS_STORAGE_KEY = 'mercado-lp-enhancements-v1';

interface EnhancementsState {
  dailyChallenges: DailyChallengesState | undefined;
  activeEvents: MarketEvent[];
  streakState: StreakState | undefined;
  tradingLeague: TradingLeague | undefined;
  marketMakerStats: MarketMakerStats;
  auctionTutorial: AuctionTutorialState | undefined;
}

interface UseGameEnhancementsProps {
  playerLevel: number;
  playerXP: number;
  playerName: string;
  playerAvatar: string;
  onAddXP: (amount: number, source: string) => void;
  onAddTokens: (tokenId: string, amount: number) => void;
}

export function useGameEnhancements({
  playerLevel,
  playerXP,
  playerName,
  playerAvatar,
  onAddXP,
  onAddTokens,
}: UseGameEnhancementsProps) {
  // State
  const [dailyChallenges, setDailyChallenges] = useState<DailyChallengesState | undefined>();
  const [activeEvents, setActiveEvents] = useState<MarketEvent[]>([]);
  const [streakState, setStreakState] = useState<StreakState | undefined>();
  const [tradingLeague, setTradingLeague] = useState<TradingLeague | undefined>();
  const [marketMakerStats, setMarketMakerStats] = useState<MarketMakerStats>(initMarketMakerStats());
  const [auctionTutorial, setAuctionTutorial] = useState<AuctionTutorialState | undefined>();
  const [isLoaded, setIsLoaded] = useState(false);

  // Load state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ENHANCEMENTS_STORAGE_KEY);
      if (saved) {
        const data: EnhancementsState = JSON.parse(saved);
        if (data.dailyChallenges) setDailyChallenges(data.dailyChallenges);
        if (data.activeEvents) setActiveEvents(data.activeEvents.filter(e => !isEventExpired(e)));
        if (data.streakState) setStreakState(data.streakState);
        if (data.tradingLeague) setTradingLeague(data.tradingLeague);
        if (data.marketMakerStats) setMarketMakerStats(data.marketMakerStats);
        if (data.auctionTutorial) setAuctionTutorial(data.auctionTutorial);
      }
    } catch (e) {
      console.error('Failed to load enhancements state:', e);
    }
    setIsLoaded(true);
  }, []);

  // Save state to localStorage
  useEffect(() => {
    if (!isLoaded) return;

    const state: EnhancementsState = {
      dailyChallenges,
      activeEvents,
      streakState,
      tradingLeague,
      marketMakerStats,
      auctionTutorial,
    };

    localStorage.setItem(ENHANCEMENTS_STORAGE_KEY, JSON.stringify(state));
  }, [dailyChallenges, activeEvents, streakState, tradingLeague, marketMakerStats, auctionTutorial, isLoaded]);

  // Initialize/refresh daily challenges
  useEffect(() => {
    if (!isLoaded) return;

    const today = getUTCDateString();
    if (!dailyChallenges || dailyChallenges.lastRefreshDate !== today) {
      const newChallenges = initDailyChallenges(dailyChallenges, playerLevel);
      setDailyChallenges(newChallenges);
      if (dailyChallenges) {
        toast.info('🎯 ¡Nuevos retos diarios disponibles!', { duration: 3000 });
      }
    }
  }, [isLoaded, playerLevel, dailyChallenges]);

  // Initialize/update streak
  useEffect(() => {
    if (!isLoaded) return;

    const newStreakState = updateStreakState(streakState);
    if (!streakState || newStreakState.currentStreak !== streakState.currentStreak) {
      setStreakState(newStreakState);
      if (newStreakState.currentStreak > 1 && (!streakState || newStreakState.currentStreak > streakState.currentStreak)) {
        toast.success(`🔥 ¡Racha de ${newStreakState.currentStreak} días!`, { duration: 3000 });
      }
    }
  }, [isLoaded]);

  // Initialize trading league
  useEffect(() => {
    if (!isLoaded || playerLevel < 5) return;

    const league = initTradingLeague(
      tradingLeague,
      { volume: 0, profit: 0, swaps: 0 },
      playerName,
      playerAvatar
    );
    setTradingLeague(league);
  }, [isLoaded, playerLevel, playerName, playerAvatar]);

  // Market events ticker
  useEffect(() => {
    if (!isLoaded) return;

    const checkEvents = () => {
      // Remove expired events
      setActiveEvents(prev => prev.filter(e => !isEventExpired(e)));

      // Maybe spawn new event
      if (activeEvents.length < MAX_CONCURRENT_EVENTS && Math.random() < EVENT_SPAWN_PROBABILITY) {
        const newEvent = generateMarketEvent();
        if (newEvent) {
          setActiveEvents(prev => [...prev, newEvent]);
          toast(
            <div className="flex items-center gap-2">
              <span className="text-xl">{newEvent.icon}</span>
              <div>
                <div className="font-bold">{newEvent.title}</div>
                <div className="text-sm opacity-80">{newEvent.description}</div>
              </div>
            </div>,
            { duration: 5000 }
          );
        }
      }
    };

    const interval = setInterval(checkEvents, EVENT_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [isLoaded, activeEvents.length]);

  // === ACTIONS ===

  // Update daily challenge progress
  const trackChallengeProgress = useCallback((type: DailyChallengeType, amount: number = 1) => {
    if (!dailyChallenges) return;

    const prevCompleted = dailyChallenges.completedToday;
    const updated = updateChallengeProgress(dailyChallenges, type, amount);

    // Check for newly completed challenges
    updated.challenges.forEach((challenge, index) => {
      const prev = dailyChallenges.challenges[index];
      if (challenge.completed && !prev.completed) {
        toast.success(`✅ Reto completado: ${challenge.title} (+${challenge.xpReward} XP)`, { duration: 3000 });
        onAddXP(challenge.xpReward, 'dailyChallenge');

        if (challenge.bonusReward) {
          if (challenge.bonusReward.type === 'tokens' && challenge.bonusReward.tokenId) {
            onAddTokens(challenge.bonusReward.tokenId, challenge.bonusReward.value);
            toast.success(`🎁 Bonus: +${challenge.bonusReward.value} ${challenge.bonusReward.tokenId.toUpperCase()}`, { duration: 3000 });
          }
        }
      }
    });

    setDailyChallenges(updated);
  }, [dailyChallenges, onAddXP, onAddTokens]);

  // Claim all completed bonus
  const claimAllCompletedBonus = useCallback(() => {
    if (!dailyChallenges || !dailyChallenges.completedToday === 3 || dailyChallenges.allCompletedBonus) return;

    setDailyChallenges(prev => prev ? { ...prev, allCompletedBonus: true } : prev);
    onAddXP(ALL_COMPLETED_BONUS_XP, 'dailyChallengeBonus');
    toast.success(`🏆 ¡Todos los retos completados! +${ALL_COMPLETED_BONUS_XP} XP bonus`, { duration: 4000 });
  }, [dailyChallenges, onAddXP]);

  // Claim streak reward
  const claimStreakRewardAction = useCallback((days: number) => {
    if (!streakState) return;

    const { newState, reward } = claimStreakReward(streakState, days);
    if (reward) {
      setStreakState(newState);
      onAddXP(reward.xpBonus, 'streakReward');
      toast.success(`${reward.icon} ¡Recompensa de racha reclamada! +${reward.xpBonus} XP`, { duration: 4000 });

      if (reward.specialReward?.type === 'tokens' && reward.specialReward.tokenId) {
        onAddTokens(reward.specialReward.tokenId, reward.specialReward.value);
      }
    }
  }, [streakState, onAddXP, onAddTokens]);

  // Claim daily login bonus
  const claimDailyBonusAction = useCallback(() => {
    if (!streakState) return;

    const { newState, bonus } = claimDailyBonus(streakState);
    if (bonus > 0) {
      setStreakState(newState);
      onAddXP(bonus, 'dailyLogin');
      toast.success(`☀️ ¡Bonus de login diario! +${bonus} XP`, { duration: 3000 });
    }
  }, [streakState, onAddXP]);

  // Update league stats after a trade
  const updateLeagueAfterTrade = useCallback((volume: number, profit: number, swaps: number = 1) => {
    if (!tradingLeague || playerLevel < 5) return;

    const updated = updatePlayerLeagueStats(tradingLeague, volume, profit, swaps);
    setTradingLeague(updated);
  }, [tradingLeague, playerLevel]);

  // Update market maker stats
  const updateMMStats = useCallback((action: 'volume' | 'fees' | 'pool' | 'trader', amount: number) => {
    if (playerLevel < 6) return;

    setMarketMakerStats(prev => updateMarketMakerStats(prev, action, amount));
  }, [playerLevel]);

  // Get event multiplier for actions
  const getEventXPMultiplier = useCallback((tokenId?: string): number => {
    return getEventMultiplier(activeEvents, 'xp', tokenId);
  }, [activeEvents]);

  const getEventFeeMultiplier = useCallback((tokenId?: string): number => {
    return getEventMultiplier(activeEvents, 'fee', tokenId);
  }, [activeEvents]);

  // Start auction tutorial
  const startAuctionTutorial = useCallback(() => {
    setAuctionTutorial(initAuctionTutorial());
  }, []);

  // Advance auction tutorial
  const advanceAuctionTutorialStep = useCallback(() => {
    if (!auctionTutorial) return;
    setAuctionTutorial(advanceTutorialStep(auctionTutorial));
  }, [auctionTutorial]);

  // Dismiss event
  const dismissEvent = useCallback((eventId: string) => {
    setActiveEvents(prev => prev.filter(e => e.id !== eventId));
  }, []);

  return {
    // State
    dailyChallenges,
    activeEvents,
    streakState,
    tradingLeague,
    marketMakerStats,
    auctionTutorial,
    isEnhancementsLoaded: isLoaded,

    // Actions
    trackChallengeProgress,
    claimAllCompletedBonus,
    claimStreakReward: claimStreakRewardAction,
    claimDailyBonus: claimDailyBonusAction,
    updateLeagueAfterTrade,
    updateMMStats,
    getEventXPMultiplier,
    getEventFeeMultiplier,
    startAuctionTutorial,
    advanceAuctionTutorialStep,
    setAuctionTutorial,
    dismissEvent,
  };
}
