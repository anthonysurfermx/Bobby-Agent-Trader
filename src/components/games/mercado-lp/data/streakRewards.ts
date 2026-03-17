import { StreakReward, StreakState } from '../types/game';

/**
 * Streak reward milestones
 */
export const streakRewards: StreakReward[] = [
  {
    days: 3,
    xpBonus: 50,
    title: '3 días seguidos',
    icon: '🔥',
    claimed: false,
  },
  {
    days: 7,
    xpBonus: 150,
    title: 'Racha semanal',
    icon: '🌟',
    claimed: false,
    specialReward: {
      type: 'tokens',
      value: 25,
      tokenId: 'peso',
    },
  },
  {
    days: 14,
    xpBonus: 300,
    title: 'Dos semanas',
    icon: '💪',
    claimed: false,
    specialReward: {
      type: 'tokens',
      value: 50,
      tokenId: 'mango',
    },
  },
  {
    days: 21,
    xpBonus: 500,
    title: 'Tres semanas',
    icon: '🏆',
    claimed: false,
    specialReward: {
      type: 'multiplier',
      value: 2.0, // Double XP for next day
    },
  },
  {
    days: 30,
    xpBonus: 1000,
    title: 'Racha mensual',
    icon: '👑',
    claimed: false,
    specialReward: {
      type: 'badge',
      value: 1,
    },
  },
  {
    days: 60,
    xpBonus: 2500,
    title: 'Dos meses',
    icon: '🎖️',
    claimed: false,
    specialReward: {
      type: 'tokens',
      value: 200,
      tokenId: 'peso',
    },
  },
  {
    days: 100,
    xpBonus: 5000,
    title: 'Centenario',
    icon: '💎',
    claimed: false,
    specialReward: {
      type: 'badge',
      value: 1,
    },
  },
];

/**
 * Daily login bonus based on streak
 */
export const getDailyLoginBonus = (currentStreak: number): number => {
  if (currentStreak >= 30) return 50;
  if (currentStreak >= 14) return 30;
  if (currentStreak >= 7) return 20;
  if (currentStreak >= 3) return 10;
  return 5;
};

/**
 * Get UTC date string
 */
export const getUTCDateString = (): string => {
  return new Date().toISOString().split('T')[0];
};

/**
 * Check if two dates are consecutive days
 */
const areConsecutiveDays = (date1: string, date2: string): boolean => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return diffDays === 1;
};

/**
 * Check if date is today
 */
const isToday = (dateStr: string): boolean => {
  return dateStr === getUTCDateString();
};

/**
 * Initialize or update streak state
 */
export const updateStreakState = (existingState?: StreakState): StreakState => {
  const today = getUTCDateString();

  if (!existingState) {
    return {
      currentStreak: 1,
      bestStreak: 1,
      lastPlayedDate: today,
      claimedRewards: [],
      todayBonusClaimed: false,
    };
  }

  // Already played today
  if (isToday(existingState.lastPlayedDate)) {
    return existingState;
  }

  // Check if streak continues
  if (areConsecutiveDays(existingState.lastPlayedDate, today)) {
    const newStreak = existingState.currentStreak + 1;
    return {
      currentStreak: newStreak,
      bestStreak: Math.max(newStreak, existingState.bestStreak),
      lastPlayedDate: today,
      claimedRewards: existingState.claimedRewards,
      todayBonusClaimed: false,
    };
  }

  // Streak broken - reset
  return {
    currentStreak: 1,
    bestStreak: existingState.bestStreak,
    lastPlayedDate: today,
    claimedRewards: existingState.claimedRewards,
    todayBonusClaimed: false,
  };
};

/**
 * Get available (unclaimed) rewards for current streak
 */
export const getAvailableRewards = (
  currentStreak: number,
  claimedRewards: number[]
): StreakReward[] => {
  return streakRewards.filter(
    reward => reward.days <= currentStreak && !claimedRewards.includes(reward.days)
  );
};

/**
 * Get next upcoming reward
 */
export const getNextReward = (
  currentStreak: number,
  claimedRewards: number[]
): StreakReward | null => {
  // First check for unclaimed available rewards
  const available = getAvailableRewards(currentStreak, claimedRewards);
  if (available.length > 0) {
    return available[0];
  }

  // Then get next milestone
  return streakRewards.find(reward => reward.days > currentStreak) || null;
};

/**
 * Calculate days until next reward
 */
export const getDaysUntilNextReward = (
  currentStreak: number,
  claimedRewards: number[]
): number => {
  const next = getNextReward(currentStreak, claimedRewards);
  if (!next) return 0;
  return Math.max(0, next.days - currentStreak);
};

/**
 * Claim a streak reward
 */
export const claimStreakReward = (
  state: StreakState,
  days: number
): { newState: StreakState; reward: StreakReward | null } => {
  const reward = streakRewards.find(r => r.days === days);
  if (!reward || state.claimedRewards.includes(days)) {
    return { newState: state, reward: null };
  }

  if (days > state.currentStreak) {
    return { newState: state, reward: null };
  }

  return {
    newState: {
      ...state,
      claimedRewards: [...state.claimedRewards, days],
    },
    reward,
  };
};

/**
 * Claim daily login bonus
 */
export const claimDailyBonus = (state: StreakState): { newState: StreakState; bonus: number } => {
  if (state.todayBonusClaimed) {
    return { newState: state, bonus: 0 };
  }

  const bonus = getDailyLoginBonus(state.currentStreak);

  return {
    newState: {
      ...state,
      todayBonusClaimed: true,
    },
    bonus,
  };
};

/**
 * Get streak status for UI display
 */
export const getStreakStatus = (state: StreakState): {
  isActive: boolean;
  daysRemaining: number;
  percentToNext: number;
  nextMilestone: number;
} => {
  const today = getUTCDateString();
  const isActive = isToday(state.lastPlayedDate) || areConsecutiveDays(state.lastPlayedDate, today);

  const nextMilestone = streakRewards.find(r => r.days > state.currentStreak)?.days || state.currentStreak;
  const prevMilestone = [...streakRewards].reverse().find(r => r.days <= state.currentStreak)?.days || 0;

  const progressRange = nextMilestone - prevMilestone;
  const currentProgress = state.currentStreak - prevMilestone;
  const percentToNext = progressRange > 0 ? (currentProgress / progressRange) * 100 : 100;

  return {
    isActive,
    daysRemaining: nextMilestone - state.currentStreak,
    percentToNext,
    nextMilestone,
  };
};

/**
 * Format streak for display
 */
export const formatStreak = (days: number): string => {
  if (days === 1) return '1 día';
  return `${days} días`;
};

/**
 * Get reward title in English
 */
export const getRewardTitleEn = (days: number): string => {
  const titles: Record<number, string> = {
    3: '3 Day Streak',
    7: 'Weekly Streak',
    14: 'Two Weeks',
    21: 'Three Weeks',
    30: 'Monthly Streak',
    60: 'Two Months',
    100: 'Century',
  };
  return titles[days] || `${days} Day Streak`;
};
