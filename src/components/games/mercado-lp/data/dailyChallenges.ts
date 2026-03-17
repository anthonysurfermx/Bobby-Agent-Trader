import { DailyChallenge, DailyChallengeType, DailyChallengesState } from '../types/game';

// Challenge templates by difficulty
interface ChallengeTemplate {
  type: DailyChallengeType;
  titleEs: string;
  titleEn: string;
  descriptionEs: string;
  descriptionEn: string;
  icon: string;
  difficulty: 'easy' | 'medium' | 'hard';
  targetRange: [number, number]; // [min, max]
  xpReward: number;
  bonusChance: number; // 0-1 probability of bonus reward
}

const challengeTemplates: ChallengeTemplate[] = [
  // EASY challenges
  {
    type: 'swap_count',
    titleEs: 'Día de Trueques',
    titleEn: 'Trading Day',
    descriptionEs: 'Completa {{target}} swaps',
    descriptionEn: 'Complete {{target}} swaps',
    icon: '🔄',
    difficulty: 'easy',
    targetRange: [3, 5],
    xpReward: 50,
    bonusChance: 0.2,
  },
  {
    type: 'reputation',
    titleEs: 'Buena Fama',
    titleEn: 'Good Reputation',
    descriptionEs: 'Gana {{target}} puntos de reputación',
    descriptionEn: 'Earn {{target}} reputation points',
    icon: '⭐',
    difficulty: 'easy',
    targetRange: [5, 10],
    xpReward: 40,
    bonusChance: 0.1,
  },
  {
    type: 'swap_volume',
    titleEs: 'Volumen del Día',
    titleEn: 'Daily Volume',
    descriptionEs: 'Intercambia {{target}} en volumen total',
    descriptionEn: 'Trade {{target}} in total volume',
    icon: '📊',
    difficulty: 'easy',
    targetRange: [50, 100],
    xpReward: 45,
    bonusChance: 0.15,
  },

  // MEDIUM challenges
  {
    type: 'add_liquidity',
    titleEs: 'Proveedor de Liquidez',
    titleEn: 'Liquidity Provider',
    descriptionEs: 'Añade liquidez a {{target}} pool(s)',
    descriptionEn: 'Add liquidity to {{target}} pool(s)',
    icon: '💧',
    difficulty: 'medium',
    targetRange: [1, 2],
    xpReward: 80,
    bonusChance: 0.3,
  },
  {
    type: 'low_slippage',
    titleEs: 'Trader Eficiente',
    titleEn: 'Efficient Trader',
    descriptionEs: 'Completa {{target}} swaps con slippage bajo (<5%)',
    descriptionEn: 'Complete {{target}} low-slippage swaps (<5%)',
    icon: '🎯',
    difficulty: 'medium',
    targetRange: [2, 4],
    xpReward: 75,
    bonusChance: 0.25,
  },
  {
    type: 'diverse_trades',
    titleEs: 'Diversificador',
    titleEn: 'Diversifier',
    descriptionEs: 'Opera en {{target}} pares diferentes',
    descriptionEn: 'Trade {{target}} different pairs',
    icon: '🌈',
    difficulty: 'medium',
    targetRange: [2, 3],
    xpReward: 70,
    bonusChance: 0.2,
  },
  {
    type: 'earn_fees',
    titleEs: 'Colector de Fees',
    titleEn: 'Fee Collector',
    descriptionEs: 'Gana {{target}} en fees como LP',
    descriptionEn: 'Earn {{target}} in LP fees',
    icon: '💰',
    difficulty: 'medium',
    targetRange: [5, 15],
    xpReward: 85,
    bonusChance: 0.35,
  },

  // HARD challenges
  {
    type: 'profit_trade',
    titleEs: 'Trading Rentable',
    titleEn: 'Profitable Trading',
    descriptionEs: 'Completa {{target}} trades rentables',
    descriptionEn: 'Complete {{target}} profitable trades',
    icon: '📈',
    difficulty: 'hard',
    targetRange: [3, 5],
    xpReward: 120,
    bonusChance: 0.4,
  },
  {
    type: 'create_token',
    titleEs: 'Creador de Tokens',
    titleEn: 'Token Creator',
    descriptionEs: 'Crea un nuevo token',
    descriptionEn: 'Create a new token',
    icon: '✨',
    difficulty: 'hard',
    targetRange: [1, 1],
    xpReward: 150,
    bonusChance: 0.5,
  },
  {
    type: 'auction_bid',
    titleEs: 'Subastero',
    titleEn: 'Auctioneer',
    descriptionEs: 'Coloca {{target}} pujas en subastas',
    descriptionEn: 'Place {{target}} auction bids',
    icon: '🔨',
    difficulty: 'hard',
    targetRange: [2, 3],
    xpReward: 100,
    bonusChance: 0.35,
  },
];

// Bonus tokens that can be awarded
const bonusTokens = ['mango', 'limon', 'sandia', 'platano', 'peso'];

/**
 * Generates random number between min and max (inclusive)
 */
const randomInRange = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Seeded random number generator for consistent daily challenges
 * Uses the date as seed so all players get same challenges
 */
const seededRandom = (seed: number): () => number => {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
};

/**
 * Get date seed from UTC date string
 */
const getDateSeed = (dateStr: string): number => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return year * 10000 + month * 100 + day;
};

/**
 * Generates 3 daily challenges (1 easy, 1 medium, 1 hard)
 */
export const generateDailyChallenges = (dateStr: string, playerLevel: number): DailyChallenge[] => {
  const seed = getDateSeed(dateStr);
  const random = seededRandom(seed);

  const easyTemplates = challengeTemplates.filter(t => t.difficulty === 'easy');
  const mediumTemplates = challengeTemplates.filter(t => t.difficulty === 'medium');
  const hardTemplates = challengeTemplates.filter(t => t.difficulty === 'hard');

  // Select one from each difficulty using seeded random
  const easyIndex = Math.floor(random() * easyTemplates.length);
  const mediumIndex = Math.floor(random() * mediumTemplates.length);
  const hardIndex = Math.floor(random() * hardTemplates.length);

  const selectedTemplates = [
    easyTemplates[easyIndex],
    mediumTemplates[mediumIndex],
    hardTemplates[hardIndex],
  ];

  // Scale rewards based on player level
  const levelMultiplier = 1 + (playerLevel - 1) * 0.1; // +10% per level

  return selectedTemplates.map((template, index) => {
    const target = randomInRange(template.targetRange[0], template.targetRange[1]);
    const scaledXP = Math.round(template.xpReward * levelMultiplier);

    // Generate bonus reward
    let bonusReward: DailyChallenge['bonusReward'] | undefined;
    if (random() < template.bonusChance) {
      const bonusType = random() < 0.7 ? 'tokens' : 'multiplier';
      if (bonusType === 'tokens') {
        const tokenId = bonusTokens[Math.floor(random() * bonusTokens.length)];
        bonusReward = {
          type: 'tokens',
          value: randomInRange(5, 20),
          tokenId,
        };
      } else {
        bonusReward = {
          type: 'multiplier',
          value: 1.5, // 50% XP boost for next action
        };
      }
    }

    return {
      id: `daily-${dateStr}-${index}`,
      type: template.type,
      title: template.titleEs, // Default to Spanish, will be translated in UI
      description: template.descriptionEs.replace('{{target}}', target.toString()),
      target,
      progress: 0,
      xpReward: scaledXP,
      bonusReward,
      completed: false,
      icon: template.icon,
      difficulty: template.difficulty,
    };
  });
};

/**
 * Get current UTC date string
 */
export const getUTCDateString = (): string => {
  return new Date().toISOString().split('T')[0];
};

/**
 * Initialize or refresh daily challenges state
 */
export const initDailyChallenges = (
  existingState: DailyChallengesState | undefined,
  playerLevel: number
): DailyChallengesState => {
  const today = getUTCDateString();

  // If state exists and is from today, return it
  if (existingState && existingState.lastRefreshDate === today) {
    return existingState;
  }

  // Generate new challenges
  return {
    challenges: generateDailyChallenges(today, playerLevel),
    lastRefreshDate: today,
    completedToday: 0,
    allCompletedBonus: false,
  };
};

/**
 * Update challenge progress
 */
export const updateChallengeProgress = (
  state: DailyChallengesState,
  type: DailyChallengeType,
  amount: number = 1
): DailyChallengesState => {
  const updatedChallenges = state.challenges.map(challenge => {
    if (challenge.type === type && !challenge.completed) {
      const newProgress = Math.min(challenge.progress + amount, challenge.target);
      return {
        ...challenge,
        progress: newProgress,
        completed: newProgress >= challenge.target,
      };
    }
    return challenge;
  });

  const completedCount = updatedChallenges.filter(c => c.completed).length;
  const allCompleted = completedCount === 3 && !state.allCompletedBonus;

  return {
    ...state,
    challenges: updatedChallenges,
    completedToday: completedCount,
    allCompletedBonus: allCompleted || state.allCompletedBonus,
  };
};

/**
 * All completed bonus XP
 */
export const ALL_COMPLETED_BONUS_XP = 100;

/**
 * Get translated challenge title and description
 */
export const getTranslatedChallenge = (
  challenge: DailyChallenge,
  language: 'es' | 'en'
): { title: string; description: string } => {
  const template = challengeTemplates.find(t => t.type === challenge.type);
  if (!template) {
    return { title: challenge.title, description: challenge.description };
  }

  const title = language === 'en' ? template.titleEn : template.titleEs;
  const descTemplate = language === 'en' ? template.descriptionEn : template.descriptionEs;
  const description = descTemplate.replace('{{target}}', challenge.target.toString());

  return { title, description };
};
