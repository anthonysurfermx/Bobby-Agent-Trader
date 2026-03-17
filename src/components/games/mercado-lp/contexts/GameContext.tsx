import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { Token, Pool, PlayerState, GameLevel, Challenge, NPCTrader, GameEvent, NPCActivity, TutorialTip, Badge, Auction, AuctionBid, PlayerLevel } from '@/components/games/mercado-lp/types/game';
import { initialNPCs } from '@/components/games/mercado-lp/data/npcs';
import { tutorialTips } from '@/components/games/mercado-lp/data/tutorialTips';
import { saveGameState, loadGameState } from '@/components/games/mercado-lp/lib/storage';
import { loadGameProgress, saveGameProgress } from '@/components/games/mercado-lp/lib/supabase';
import { achievements } from '@/components/games/mercado-lp/data/achievements';
import { getPlayerLevel, getXPMultiplier, getFeeDiscount } from '@/components/games/mercado-lp/data/playerLevels';
import { toast } from 'sonner';

// Sound utilities
const SOUND_BASE_PATH = '/sounds/mercado-lp';
const MUTE_STORAGE_KEY = 'mercado_lp_sound_muted';

const playSound = (soundName: string, volume = 0.5) => {
  const isMuted = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
  if (isMuted) return;

  const audio = new Audio(`${SOUND_BASE_PATH}/${soundName}`);
  audio.volume = volume;
  audio.play().catch(() => {});
};

interface GameContextType {
  tokens: Token[];
  pools: Pool[];
  player: PlayerState;
  currentLevel: GameLevel;
  challenges: Challenge[];
  npcs: NPCTrader[];
  npcActivities: NPCActivity[];
  currentEvent: GameEvent | null;
  eventTimeRemaining: number;
  activeTip: TutorialTip | null;
  showMap: boolean;
  showStartScreen: boolean;
  isLoaded: boolean;
  newBadge: Badge | null;
  levelUpNotification: PlayerLevel | null;
  auction: Auction | null;
  setPlayerAvatar: (avatar: string) => void;
  setPlayerCharacterName: (name: string) => void;
  openMap: () => void;
  closeMap: () => void;
  closeStartScreen: () => void;
  setCurrentLevel: (level: GameLevel) => void;
  getEffectiveFeePercent: (pool: Pool, amountIn: number, tokenInId: string) => number;
  swap: (poolId: string, tokenIn: Token, amountIn: number) => void;
  addLiquidity: (poolId: string, amountA: number, amountB: number) => void;
  removeLiquidity: (poolId: string, sharePercent: number) => void;
  createToken: (token: Omit<Token, 'id'>) => Token;
  createPool: (tokenA: Token, tokenB: Token, amountA: number, amountB: number) => Pool;
  completeChallenge: (challengeId: string) => void;
  dismissTip: () => void;
  triggerTutorial: (trigger: string) => void;
  dismissBadge: () => void;
  dismissLevelUp: () => void;
  placeBid: (blockNumber: number, bid: AuctionBid) => void;
  advanceAuctionBlock: () => void;
  startAuction: () => void;
  resetAuction: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

const initialTokens: Token[] = [
  { id: 'peso', name: 'Peso', symbol: 'PESO', emoji: '💵', color: '#10b981', isBaseToken: true },
  { id: 'mango', name: 'Mango', symbol: 'MNGO', emoji: '🥭', color: '#f59e0b', isBaseToken: false },
  { id: 'limon', name: 'Limón', symbol: 'LMN', emoji: '🍋', color: '#eab308', isBaseToken: false },
  { id: 'sandia', name: 'Sandía', symbol: 'WTRM', emoji: '🍉', color: '#ef4444', isBaseToken: false },
  { id: 'platano', name: 'Plátano', symbol: 'BANA', emoji: '🍌', color: '#facc15', isBaseToken: false },
];

const initialPools: Pool[] = [
  {
    id: 'mango-limon',
    tokenA: initialTokens[1],
    tokenB: initialTokens[2],
    reserveA: 100,
    reserveB: 100,
    baseFeeBps: 30,
    hook: {
      id: 'dynamic-fee',
      name: 'Tarifa dinámica v4',
      type: 'dynamic_fee',
      description: 'Ajusta la fee según el tamaño del swap.',
      feeRangeBps: [5, 100],
      icon: '📈',
    },
    totalFeesCollected: { tokenA: 0, tokenB: 0 },
    createdBy: 'system',
  },
  {
    id: 'sandia-peso',
    tokenA: initialTokens[3],
    tokenB: initialTokens[0],
    reserveA: 50,
    reserveB: 150,
    baseFeeBps: 8,
    hook: {
      id: 'anti-mev',
      name: 'Hook anti-MEV',
      type: 'anti_mev',
      description: 'Protege contra sandwich.',
      feeRangeBps: [8, 20],
      icon: '🛡️',
    },
    totalFeesCollected: { tokenA: 0, tokenB: 0 },
    createdBy: 'system',
  },
  {
    id: 'platano-peso',
    tokenA: initialTokens[4],
    tokenB: initialTokens[0],
    reserveA: 80,
    reserveB: 120,
    baseFeeBps: 15,
    hook: {
      id: 'oracle',
      name: 'Hook oráculo/TWAP',
      type: 'oracle',
      description: 'Mantiene TWAP.',
      feeRangeBps: [10, 25],
      icon: '⏱️',
    },
    totalFeesCollected: { tokenA: 0, tokenB: 0 },
    createdBy: 'system',
  },
];

const initialChallenges: Challenge[] = [
  {
    id: 'first-swap',
    title: 'Primera Compra',
    description: 'Complete your first swap',
    level: 1,
    completed: false,
    xpReward: 50,
  },
  {
    id: 'three-swaps',
    title: 'Maestro del Trueque',
    description: 'Complete 3 swaps',
    level: 1,
    completed: false,
    xpReward: 100,
  },
  {
    id: 'low-impact',
    title: 'Precio Justo',
    description: 'Perform a swap with low price impact (< 5%)',
    level: 1,
    completed: false,
    xpReward: 150,
  },
];

const initialInventory: Record<string, number> = {
  peso: 500,
  mango: 50,
  limon: 50,
  sandia: 30,
  platano: 40,
};

export const GameProvider = ({ children }: { children: ReactNode }) => {
  const [tokens, setTokens] = useState<Token[]>(initialTokens);
  const [pools, setPools] = useState<Pool[]>(initialPools);
  const [currentLevel, setCurrentLevel] = useState<GameLevel>(1);
  const [challenges, setChallenges] = useState<Challenge[]>(initialChallenges);
  const [npcs, setNpcs] = useState<NPCTrader[]>(initialNPCs);
  const [npcActivities, setNpcActivities] = useState<NPCActivity[]>([]);
  const [currentEvent, setCurrentEvent] = useState<GameEvent | null>(null);
  const [eventTimeRemaining, setEventTimeRemaining] = useState(0);
  const [tips, setTips] = useState<TutorialTip[]>(tutorialTips);
  const [activeTip, setActiveTip] = useState<TutorialTip | null>(null);
  const [showMap, setShowMap] = useState(true);
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [newBadge, setNewBadge] = useState<Badge | null>(null);
  const [levelUpNotification, setLevelUpNotification] = useState<PlayerLevel | null>(null);
  const [auction, setAuction] = useState<Auction | null>(null);

  const [player, setPlayer] = useState<PlayerState>({
    inventory: initialInventory,
    lpPositions: [],
    xp: 0,
    level: 1,
    avatar: '/player.png',
    reputation: 10,
    completedChallenges: [],
    badges: [],
    tutorialProgress: {},
    swapCount: 0,
    totalFeesEarned: 0,
    stats: {
      totalSwapVolume: 0,
      profitableSwaps: 0,
      totalLPProvided: 0,
      tokensCreated: 0,
      auctionBidsPlaced: 0,
      auctionTokensWon: 0,
    },
    lastPlayedDate: undefined,
    currentStreak: 0,
    bestStreak: 0,
  });

  // Load saved game state on mount
  useEffect(() => {
    const loadSavedState = async () => {
      // First try to load from Supabase (if user is authenticated)
      const supabaseData = await loadGameProgress();

      if (supabaseData) {
        // User is logged in and has saved progress in Supabase
        setPlayer({
          inventory: supabaseData.inventory || initialInventory,
          lpPositions: supabaseData.lp_positions || [],
          xp: supabaseData.xp || 0,
          level: supabaseData.level || 1,
          reputation: supabaseData.reputation || 10,
          completedChallenges: supabaseData.completed_challenges || [],
          badges: supabaseData.badges || [],
          tutorialProgress: supabaseData.tutorial_progress || {},
          swapCount: supabaseData.swap_count || 0,
          totalFeesEarned: supabaseData.total_fees_earned || 0,
          stats: supabaseData.stats || {
            totalSwapVolume: 0,
            profitableSwaps: 0,
            totalLPProvided: 0,
            tokensCreated: 0,
            auctionBidsPlaced: 0,
            auctionTokensWon: 0,
          },
          lastPlayedDate: supabaseData.last_played_date,
          currentStreak: supabaseData.current_streak || 0,
          bestStreak: supabaseData.best_streak || 0,
          avatar: supabaseData.avatar || '/player.png',
          // Daily XP tracking
          dailyXP: supabaseData.daily_xp || 0,
          dailyXPDate: supabaseData.daily_xp_date,
        });
        if (supabaseData.pools?.length > 0) setPools(supabaseData.pools);
        if (supabaseData.tokens?.length > 0) setTokens(supabaseData.tokens);
        setCurrentLevel((supabaseData.current_level || 1) as GameLevel);
        setShowStartScreen(false);
        console.log('✅ Game loaded from Supabase');
      } else {
        // Fallback to localStorage
        const savedState = loadGameState();
        if (savedState) {
          setPlayer({
            ...savedState.player,
            avatar: savedState.player?.avatar || '/player.png',
          });
          setPools(savedState.pools);
          setTokens(savedState.tokens);
          setCurrentLevel(savedState.currentLevel as GameLevel);
          setShowMap(savedState.showMap);
          setShowStartScreen(false);
          console.log('✅ Game loaded from localStorage');
        }
      }

      setIsLoaded(true);
    };

    loadSavedState();
  }, []);

  const addReputation = (amount: number) => {
    setPlayer(prev => ({
      ...prev,
      reputation: Math.min(100, prev.reputation + amount),
    }));
  };

  const setPlayerAvatar = (avatar: string) => {
    setPlayer(prev => ({
      ...prev,
      avatar,
    }));
  };

  const setPlayerCharacterName = (name: string) => {
    setPlayer(prev => ({
      ...prev,
      characterName: name,
    }));
  };

  const openMap = () => setShowMap(true);
  const closeMap = () => setShowMap(false);
  const closeStartScreen = () => setShowStartScreen(false);
  const dismissBadge = () => setNewBadge(null);
  const dismissLevelUp = () => setLevelUpNotification(null);

  // Update player level based on XP
  const updatePlayerLevel = useCallback((currentXP: number, prevXP: number) => {
    const newLevel = getPlayerLevel(currentXP);
    const oldLevel = getPlayerLevel(prevXP);

    if (newLevel.level > oldLevel.level) {
      // Level up!
      setPlayer(prev => ({ ...prev, level: newLevel.level }));
      setLevelUpNotification(newLevel);

      // Play level up sound
      playSound('LevelUp.wav', 0.6);

      toast.success(
        `¡Subiste de nivel! Ahora eres ${newLevel.name} ${newLevel.icon}`,
        { duration: 5000 }
      );
      return true;
    }
    return false;
  }, []);

  /**
   * Obtiene la fecha actual en UTC como string ISO (YYYY-MM-DD)
   * Esto evita problemas con cambios de zona horaria
   */
  const getUTCDateString = (): string => {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD
  };

  /**
   * Cap diario de XP escalado por nivel del jugador
   * N1-N2: 400 XP, N3-N4: 600 XP, N5-N6: 800 XP
   */
  const getDailyXPCap = (playerLevel: number): number => {
    if (playerLevel >= 5) return 800;
    if (playerLevel >= 3) return 600;
    return 400;
  };

  // Source labels for XP toasts
  const XP_SOURCE_LABELS: Record<string, string> = {
    swap: 'Swap',
    liquidity: 'LP',
    createPool: 'Pool',
    challenge: 'Misión',
    auctionBid: 'Puja',
    auctionWin: 'Subasta',
    achievement: 'Logro',
  };

  /**
   * Función centralizada para agregar XP con multiplicador de nivel
   * Aplica bonus según el nivel actual del jugador y respeta el cap diario (UTC-based)
   */
  const addXP = useCallback((baseXP: number, source: string) => {
    setPlayer(prev => {
      const todayUTC = getUTCDateString();
      const isNewDay = prev.dailyXPDate !== todayUTC;
      const currentDailyXP = isNewDay ? 0 : (prev.dailyXP || 0);
      const dailyCap = getDailyXPCap(prev.level);

      // Check if already at daily cap
      if (currentDailyXP >= dailyCap) {
        toast.info(`Cap diario alcanzado (${dailyCap} XP). ¡Vuelve mañana!`, { duration: 2500 });
        return prev;
      }

      const multiplier = getXPMultiplier(prev.level);
      const finalXP = Math.round(baseXP * multiplier);

      // Apply daily cap - limit XP to remaining daily allowance
      const remainingDaily = dailyCap - currentDailyXP;
      const cappedXP = Math.min(finalXP, remainingDaily);
      const wasCapped = cappedXP < finalXP;

      const newXP = prev.xp + cappedXP;
      const newDailyXP = currentDailyXP + cappedXP;

      // Check for level up after state update
      setTimeout(() => updatePlayerLevel(newXP, prev.xp), 100);

      // Show detailed XP toast with source and bonus
      const sourceLabel = XP_SOURCE_LABELS[source] || source;
      const bonusText = multiplier > 1 ? `, ×${multiplier}` : '';
      const capText = wasCapped ? ' [cap]' : '';
      toast.success(`+${cappedXP} XP (${sourceLabel}${bonusText})${capText}`, { duration: 2000 });

      // Play XP gain sound
      playSound('XPGain.wav', 0.3);

      return {
        ...prev,
        xp: newXP,
        dailyXP: newDailyXP,
        dailyXPDate: todayUTC,
      };
    });
  }, [updatePlayerLevel]);

  /**
   * Calcula el fee efectivo aplicando descuento por nivel del jugador
   */
  const getEffectiveFeeWithDiscount = useCallback((baseFeePercent: number, playerLevel: number): number => {
    const discount = getFeeDiscount(playerLevel);
    return baseFeePercent * (1 - discount);
  }, []);

  // Check and update daily streak
  useEffect(() => {
    if (!isLoaded) return;

    const today = new Date().toDateString();
    const lastPlayed = player.lastPlayedDate;

    if (lastPlayed !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const wasYesterday = lastPlayed === yesterday.toDateString();

      setPlayer(prev => ({
        ...prev,
        lastPlayedDate: today,
        currentStreak: wasYesterday ? prev.currentStreak + 1 : 1,
        bestStreak: wasYesterday
          ? Math.max(prev.bestStreak, prev.currentStreak + 1)
          : Math.max(prev.bestStreak, prev.currentStreak),
      }));

      if (wasYesterday) {
        const newStreak = player.currentStreak + 1;
        toast.success(`¡Racha de ${newStreak} días! 🔥`, { duration: 3000 });
      }
    }
  }, [isLoaded, player.lastPlayedDate, player.currentStreak, player.bestStreak]);

  // Check for new achievements
  const checkAchievements = useCallback(() => {
    for (const achievement of achievements) {
      // Check if already unlocked
      if (player.badges.some(b => b.id === achievement.id)) continue;

      // Check if condition is met
      if (achievement.condition(player, pools, tokens)) {
        const newBadgeData: Badge = {
          id: achievement.id,
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
          unlockedAt: new Date(),
        };

        // Add badge to player (without XP - that goes through addXP)
        setPlayer(prev => ({
          ...prev,
          badges: [...prev.badges, newBadgeData],
        }));

        // Add XP through centralized function (respects cap and multipliers)
        addXP(achievement.xpReward, 'achievement');

        setNewBadge(newBadgeData);

        // Play badge sound
        playSound('Badge.wav', 0.6);

        break; // Only show one badge at a time
      }
    }
  }, [player, pools, tokens, addXP]);

  // Auto-save game state when key values change
  useEffect(() => {
    if (!isLoaded) return; // Don't save during initial load

    const timeoutId = setTimeout(async () => {
      // Save to localStorage (always)
      saveGameState({
        player,
        pools,
        tokens,
        currentLevel,
        showMap,
      });

      // Also save to Supabase if user is authenticated
      try {
        await saveGameProgress(player, pools, tokens, currentLevel);
      } catch (error) {
        console.log('Supabase save skipped (user not logged in or error)');
      }
    }, 1000); // Debounce saves by 1 second

    return () => clearTimeout(timeoutId);
  }, [player, pools, tokens, currentLevel, showMap, isLoaded]);

  // Check for achievements after player state changes
  useEffect(() => {
    if (!isLoaded) return; // Don't check during initial load
    checkAchievements();
  }, [player.swapCount, player.lpPositions.length, player.totalFeesEarned, player.reputation, player.xp, tokens.length, pools.length, isLoaded, checkAchievements]);

  const getEffectiveFeePercent = useCallback((pool: Pool, amountIn: number, tokenInId: string) => {
    const basePercent = (pool.baseFeeBps || 30) / 100;
    const isTokenA = pool.tokenA.id === tokenInId;
    const reserveIn = isTokenA ? pool.reserveA : pool.reserveB;

    if (pool.hook?.type === 'dynamic_fee' && pool.hook.feeRangeBps) {
      const [minBps, maxBps] = pool.hook.feeRangeBps;
      const tradeRatio = reserveIn > 0 ? Math.min(amountIn / reserveIn, 1) : 1;
      const dynamicBps = minBps + (maxBps - minBps) * tradeRatio;
      return dynamicBps / 100;
    }

    if (pool.hook?.type === 'anti_mev') {
      return basePercent + 0.05;
    }

    if (pool.hook?.type === 'oracle' && pool.hook.feeRangeBps) {
      const [minBps, maxBps] = pool.hook.feeRangeBps;
      return (minBps + maxBps) / 200;
    }

    return basePercent;
  }, []);

  const triggerTutorial = useCallback((trigger: string) => {
    const tip = tips.find(t => t.trigger === trigger && !t.shown);
    if (tip && !player.tutorialProgress[trigger]) {
      setActiveTip(tip);
      setPlayer(prev => ({
        ...prev,
        tutorialProgress: { ...prev.tutorialProgress, [trigger]: true },
      }));
    }
  }, [tips, player.tutorialProgress]);

  const dismissTip = () => {
    if (activeTip) {
      setTips(tips.map(t => t.id === activeTip.id ? { ...t, shown: true } : t));
    }
    setActiveTip(null);
  };

  const addNPCActivity = (npcId: string, action: string, poolId?: string) => {
    const activity: NPCActivity = {
      id: `${npcId}-${Date.now()}`,
      npcId,
      action,
      timestamp: Date.now(),
      poolId,
    };
    setNpcActivities(prev => [activity, ...prev].slice(0, 20));
  };

  // NPC trading simulation
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() < 0.3 && pools.length > 0 && player.reputation > 10) {
        const npc = npcs[Math.floor(Math.random() * npcs.length)];
        const pool = pools[Math.floor(Math.random() * pools.length)];
        const isTokenA = Math.random() < 0.5;
        const tokenIn = isTokenA ? pool.tokenA : pool.tokenB;
        const tokenOut = isTokenA ? pool.tokenB : pool.tokenA;
        const amount = Math.random() * 10 + 2;

        const feePercent = getEffectiveFeePercent(pool, amount, tokenIn.id);

        setPools(prevPools => prevPools.map(p => {
          if (p.id === pool.id) {
            const reserveIn = isTokenA ? p.reserveA : p.reserveB;
            const reserveOut = isTokenA ? p.reserveB : p.reserveA;
            const amountInWithFee = amount * (1 - feePercent / 100);
            const amountOut = (reserveOut * amountInWithFee) / (reserveIn + amountInWithFee);
            const feeAmount = amount * feePercent / 100;

            return {
              ...p,
              reserveA: isTokenA ? p.reserveA + amount : p.reserveA - amountOut,
              reserveB: isTokenA ? p.reserveB - amountOut : p.reserveB + amount,
              totalFeesCollected: {
                tokenA: isTokenA ? p.totalFeesCollected.tokenA + feeAmount : p.totalFeesCollected.tokenA,
                tokenB: !isTokenA ? p.totalFeesCollected.tokenB + feeAmount : p.totalFeesCollected.tokenB,
              },
            };
          }
          return p;
        }));

        addNPCActivity(
          npc.id,
          `Cambió ${amount.toFixed(1)} ${tokenIn.emoji} por ${tokenOut.emoji}`,
          pool.id
        );

        // Update LP fees for player positions
        setPlayer(prev => ({
          ...prev,
          lpPositions: prev.lpPositions.map(pos => {
            if (pos.poolId === pool.id) {
              const posFeAmount = (amount * feePercent / 100) * (pos.sharePercent / 100);
              return {
                ...pos,
                feesEarned: {
                  tokenA: isTokenA ? pos.feesEarned.tokenA + posFeAmount : pos.feesEarned.tokenA,
                  tokenB: !isTokenA ? pos.feesEarned.tokenB + posFeAmount : pos.feesEarned.tokenB,
                },
              };
            }
            return pos;
          }),
          totalFeesEarned: prev.totalFeesEarned + (amount * feePercent / 100),
        }));

        setNpcs(prevNpcs => prevNpcs.map(n =>
          n.id === npc.id ? { ...n, lastTradeTime: Date.now() } : n
        ));
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [pools, npcs, player.reputation, getEffectiveFeePercent]);

  // Event timer
  useEffect(() => {
    if (currentEvent && eventTimeRemaining > 0) {
      const timer = setTimeout(() => {
        setEventTimeRemaining(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (currentEvent && eventTimeRemaining === 0) {
      setCurrentEvent(null);
    }
  }, [currentEvent, eventTimeRemaining]);

  const swap = (poolId: string, tokenIn: Token, amountIn: number) => {
    const pool = pools.find(p => p.id === poolId);
    if (!pool) return;

    const isTokenA = pool.tokenA.id === tokenIn.id;
    const tokenOut = isTokenA ? pool.tokenB : pool.tokenA;
    const reserveIn = isTokenA ? pool.reserveA : pool.reserveB;
    const reserveOut = isTokenA ? pool.reserveB : pool.reserveA;

    if ((player.inventory[tokenIn.id] || 0) < amountIn) {
      alert(`Not enough ${tokenIn.symbol}!`);
      return;
    }

    // Aplicar descuento de fees según nivel del jugador
    const baseFeePercent = getEffectiveFeePercent(pool, amountIn, tokenIn.id);
    const feePercent = getEffectiveFeeWithDiscount(baseFeePercent, player.level);
    const amountInWithFee = amountIn * (1 - feePercent / 100);
    const amountOut = (reserveOut * amountInWithFee) / (reserveIn + amountInWithFee);
    const priceImpact = (amountOut / reserveOut) * 100;

    // Trigger tutorials
    if (player.swapCount === 0) {
      triggerTutorial('first_swap_attempt');
    }
    if (priceImpact > 10) {
      triggerTutorial('first_high_slippage');
    }

    const feeAmount = amountIn * feePercent / 100;

    setPools(pools.map(p => {
      if (p.id === poolId) {
        return {
          ...p,
          reserveA: isTokenA ? p.reserveA + amountIn : p.reserveA - amountOut,
          reserveB: isTokenA ? p.reserveB - amountOut : p.reserveB + amountIn,
          totalFeesCollected: {
            tokenA: isTokenA ? p.totalFeesCollected.tokenA + feeAmount : p.totalFeesCollected.tokenA,
            tokenB: !isTokenA ? p.totalFeesCollected.tokenB + feeAmount : p.totalFeesCollected.tokenB,
          },
        };
      }
      return p;
    }));

    // Actualizar inventario, reputación y stats (sin XP, se agrega por separado)
    setPlayer(prev => ({
      ...prev,
      inventory: {
        ...prev.inventory,
        [tokenIn.id]: (prev.inventory[tokenIn.id] || 0) - amountIn,
        [tokenOut.id]: (prev.inventory[tokenOut.id] || 0) + amountOut,
      },
      reputation: Math.min(100, prev.reputation + 1),
      swapCount: prev.swapCount + 1,
      stats: {
        ...prev.stats,
        totalSwapVolume: prev.stats.totalSwapVolume + amountIn,
        // Contar swap rentable si el price impact es bajo
        profitableSwaps: priceImpact < 5 ? prev.stats.profitableSwaps + 1 : prev.stats.profitableSwaps,
      },
    }));

    // Agregar XP con multiplicador de nivel
    addXP(10, 'swap');

    if (!player.completedChallenges.includes('first-swap')) {
      completeChallenge('first-swap');
    }
    if (poolId === 'mango-limon' && priceImpact < 5 && !player.completedChallenges.includes('low-impact')) {
      completeChallenge('low-impact');
    }
  };

  const addLiquidity = (poolId: string, amountA: number, amountB: number) => {
    const pool = pools.find(p => p.id === poolId);
    if (!pool) return;

    if (player.lpPositions.length === 0) {
      triggerTutorial('first_lp_attempt');
    }

    if ((player.inventory[pool.tokenA.id] || 0) < amountA || 
        (player.inventory[pool.tokenB.id] || 0) < amountB) {
      alert('Not enough tokens to provide liquidity!');
      return;
    }

    const totalLiquidity = Math.sqrt(pool.reserveA * pool.reserveB);
    const newLiquidity = Math.sqrt(amountA * amountB);
    const sharePercent = (newLiquidity / (totalLiquidity + newLiquidity)) * 100;

    setPools(pools.map(p => {
      if (p.id === poolId) {
        return {
          ...p,
          reserveA: p.reserveA + amountA,
          reserveB: p.reserveB + amountB,
        };
      }
      return p;
    }));

    setPlayer(prev => ({
      ...prev,
      inventory: {
        ...prev.inventory,
        [pool.tokenA.id]: prev.inventory[pool.tokenA.id] - amountA,
        [pool.tokenB.id]: prev.inventory[pool.tokenB.id] - amountB,
      },
      lpPositions: [
        ...prev.lpPositions,
        {
          poolId,
          sharePercent,
          initialReserveA: amountA,
          initialReserveB: amountB,
          feesEarned: { tokenA: 0, tokenB: 0 },
        },
      ],
      reputation: Math.min(100, prev.reputation + 3),
      stats: {
        ...prev.stats,
        totalLPProvided: prev.stats.totalLPProvided + amountA + amountB,
      },
    }));

    // Agregar XP con multiplicador de nivel
    addXP(50, 'liquidity');
  };

  const removeLiquidity = (poolId: string, sharePercent: number) => {
    const pool = pools.find(p => p.id === poolId);
    const position = player.lpPositions.find(p => p.poolId === poolId);
    if (!pool || !position) return;

    const withdrawA = (pool.reserveA * sharePercent) / 100;
    const withdrawB = (pool.reserveB * sharePercent) / 100;

    if (position.feesEarned.tokenA > 0 || position.feesEarned.tokenB > 0) {
      triggerTutorial('first_fees_earned');
    }

    setPools(pools.map(p => {
      if (p.id === poolId) {
        return {
          ...p,
          reserveA: p.reserveA - withdrawA,
          reserveB: p.reserveB - withdrawB,
        };
      }
      return p;
    }));

    setPlayer(prev => ({
      ...prev,
      inventory: {
        ...prev.inventory,
        [pool.tokenA.id]: (prev.inventory[pool.tokenA.id] || 0) + withdrawA + position.feesEarned.tokenA,
        [pool.tokenB.id]: (prev.inventory[pool.tokenB.id] || 0) + withdrawB + position.feesEarned.tokenB,
      },
      lpPositions: prev.lpPositions.filter(p => p.poolId !== poolId),
    }));
  };

  const createToken = (tokenData: Omit<Token, 'id'>): Token => {
    triggerTutorial('first_token_create');
    
    const newToken: Token = {
      ...tokenData,
      id: tokenData.symbol.toLowerCase(),
    };
    setTokens([...tokens, newToken]);
    
    setPlayer(prev => ({
      ...prev,
      inventory: {
        ...prev.inventory,
        [newToken.id]: 1000,
      },
      stats: {
        ...prev.stats,
        tokensCreated: prev.stats.tokensCreated + 1,
      },
    }));
    
    return newToken;
  };

  const createPool = (tokenA: Token, tokenB: Token, amountA: number, amountB: number): Pool => {
    const newPool: Pool = {
      id: `${tokenA.symbol}-${tokenB.symbol}`.toLowerCase(),
      tokenA,
      tokenB,
      reserveA: amountA,
      reserveB: amountB,
      baseFeeBps: 15,
      hook: {
        id: 'custom',
        name: 'Hook personalizado',
        type: 'custom',
        description: 'Hook básico para tu pool.',
        feeRangeBps: [10, 30],
        icon: '🧩',
      },
      totalFeesCollected: { tokenA: 0, tokenB: 0 },
      createdBy: 'player',
    };

    setPools([...pools, newPool]);

    setPlayer(prev => ({
      ...prev,
      inventory: {
        ...prev.inventory,
        [tokenA.id]: (prev.inventory[tokenA.id] || 0) - amountA,
        [tokenB.id]: (prev.inventory[tokenB.id] || 0) - amountB,
      },
      reputation: Math.min(100, prev.reputation + 5),
    }));

    // Agregar XP con multiplicador de nivel
    addXP(200, 'createPool');

    addNPCActivity('system', `¡Nueva fruta en el mercado! ${tokenA.emoji} ${tokenA.symbol}`);

    return newPool;
  };

  const completeChallenge = (challengeId: string) => {
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge || player.completedChallenges.includes(challengeId)) return;

    setChallenges(challenges.map(c =>
      c.id === challengeId ? { ...c, completed: true } : c
    ));

    setPlayer(prev => ({
      ...prev,
      completedChallenges: [...prev.completedChallenges, challengeId],
    }));

    // Agregar XP con multiplicador de nivel
    addXP(challenge.xpReward, 'challenge');
  };

  // Auction functions
  const placeBid = (blockNumber: number, bid: AuctionBid) => {
    if (!auction) return;

    setAuction(prev => {
      if (!prev) return prev;

      const updatedBlocks = prev.blocks.map(block => {
        if (block.blockNumber === blockNumber) {
          // Remove existing player bid if any
          const filteredBids = block.bids.filter(b => b.bidderId !== 'player');
          return {
            ...block,
            bids: [...filteredBids, bid],
          };
        }
        return block;
      });

      return {
        ...prev,
        blocks: updatedBlocks,
      };
    });

    // Deduct from player inventory
    setPlayer(prev => ({
      ...prev,
      inventory: {
        ...prev.inventory,
        peso: (prev.inventory.peso || 0) - bid.totalSpend,
      },
      stats: {
        ...prev.stats,
        auctionBidsPlaced: prev.stats.auctionBidsPlaced + 1,
      },
    }));

    // Agregar XP por participar en subasta (5 XP base)
    addXP(5, 'auctionBid');
  };

  const advanceAuctionBlock = () => {
    if (!auction) return;

    setAuction(prev => {
      if (!prev || prev.currentBlock >= prev.blocksCount) return prev;

      const currentBlockData = prev.blocks.find(b => b.blockNumber === prev.currentBlock);
      if (!currentBlockData) return prev;

      // Execute current block - calculate clearing price
      const sortedBids = [...currentBlockData.bids].sort((a, b) => b.maxPrice - a.maxPrice);
      let tokensRemaining = currentBlockData.tokensAvailable;
      let clearingPrice = currentBlockData.minPrice;

      // Determine clearing price
      for (const bid of sortedBids) {
        const maxTokensForBid = bid.totalSpend / bid.maxPrice;
        if (maxTokensForBid > 0) {
          clearingPrice = bid.maxPrice;
          if (tokensRemaining <= 0) break;
        }
      }

      // Allocate tokens to winning bids
      const updatedBlocks = prev.blocks.map(block => {
        if (block.blockNumber !== prev.currentBlock) return block;

        let remaining = block.tokensAvailable;
        const executedBids = sortedBids.map(bid => {
          if (remaining <= 0 || bid.maxPrice < clearingPrice) {
            return bid;
          }

          const maxTokens = bid.totalSpend / clearingPrice;
          const tokensWon = Math.min(maxTokens, remaining);
          remaining -= tokensWon;

          return {
            ...bid,
            tokensWon,
            averagePrice: clearingPrice,
          };
        });

        return {
          ...block,
          bids: executedBids,
          executed: true,
          currentPrice: clearingPrice,
        };
      });

      // Award tokens to player if they won
      const playerBid = currentBlockData.bids.find(b => b.bidderId === 'player');
      if (playerBid && playerBid.maxPrice >= clearingPrice) {
        const maxTokens = playerBid.totalSpend / clearingPrice;
        const tokensWon = Math.min(maxTokens, currentBlockData.tokensAvailable);
        const actualCost = tokensWon * clearingPrice;
        const refund = playerBid.totalSpend - actualCost;

        setPlayer(prevPlayer => ({
          ...prevPlayer,
          inventory: {
            ...prevPlayer.inventory,
            [prev.tokenOffered.id]: (prevPlayer.inventory[prev.tokenOffered.id] || 0) + tokensWon,
            peso: (prevPlayer.inventory.peso || 0) + refund,
          },
          stats: {
            ...prevPlayer.stats,
            auctionTokensWon: prevPlayer.stats.auctionTokensWon + tokensWon,
          },
        }));

        // Agregar XP por ganar tokens en subasta (30 XP base)
        addXP(30, 'auctionWin');
      }

      return {
        ...prev,
        blocks: updatedBlocks,
        currentBlock: prev.currentBlock + 1,
        active: prev.currentBlock + 1 <= prev.blocksCount,
      };
    });
  };

  // Start a new auction manually
  const startAuction = () => {
    if (tokens.length <= 5) {
      return; // Need user-created tokens
    }

    const userToken = tokens.find(t => !t.isBaseToken && t.id !== 'mango' && t.id !== 'limon' && t.id !== 'sandia' && t.id !== 'platano');

    if (!userToken) return;

    const blocksCount = 5;
    const totalSupply = 100;
    const tokensPerBlock = totalSupply / blocksCount;
    const startPrice = 5;

    const auctionBlocks = Array.from({ length: blocksCount }, (_, i) => ({
      id: `block-${i + 1}`,
      blockNumber: i + 1,
      tokensAvailable: tokensPerBlock,
      currentPrice: startPrice + i,
      minPrice: startPrice,
      bids: [],
      executed: false,
    }));

    setAuction({
      id: `auction-${Date.now()}`,
      tokenOffered: userToken,
      totalSupply,
      blocksCount,
      tokensPerBlock,
      blocks: auctionBlocks,
      currentBlock: 1,
      startPrice,
      active: true,
      createdBy: 'player',
    });
  };

  // Reset auction
  const resetAuction = () => {
    setAuction(null);
  };

  return (
    <GameContext.Provider
      value={{
        tokens,
        pools,
        player,
        currentLevel,
        challenges,
        npcs,
        npcActivities,
        currentEvent,
        eventTimeRemaining,
        activeTip,
        showMap,
        showStartScreen,
        isLoaded,
        newBadge,
        levelUpNotification,
        auction,
        setPlayerAvatar,
        setPlayerCharacterName,
        openMap,
        closeMap,
        closeStartScreen,
        setCurrentLevel,
        getEffectiveFeePercent,
        swap,
        addLiquidity,
        removeLiquidity,
        createToken,
        createPool,
        completeChallenge,
        dismissTip,
        triggerTutorial,
        dismissBadge,
        dismissLevelUp,
        placeBid,
        advanceAuctionBlock,
        startAuction,
        resetAuction,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within GameProvider');
  }
  return context;
};
