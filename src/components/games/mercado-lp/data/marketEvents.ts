import { MarketEvent, MarketEventType } from '../types/game';

// Event templates
interface EventTemplate {
  type: MarketEventType;
  titleEs: string;
  titleEn: string;
  descriptionEs: string;
  descriptionEn: string;
  icon: string;
  multiplier: number;
  durationRange: [number, number]; // [min, max] in seconds
  affectsAll: boolean;
  probability: number; // 0-1, higher = more common
}

const eventTemplates: EventTemplate[] = [
  {
    type: 'price_surge',
    titleEs: '¡Precio al Alza!',
    titleEn: 'Price Surge!',
    descriptionEs: 'El {{token}} está volando. +{{percent}}% de valor temporalmente.',
    descriptionEn: '{{token}} is surging. +{{percent}}% value temporarily.',
    icon: '🚀',
    multiplier: 1.3,
    durationRange: [60, 120],
    affectsAll: false,
    probability: 0.15,
  },
  {
    type: 'price_crash',
    titleEs: '¡Caída de Precio!',
    titleEn: 'Price Crash!',
    descriptionEs: 'El {{token}} está cayendo. -{{percent}}% de valor. ¡Oportunidad de compra!',
    descriptionEn: '{{token}} is dropping. -{{percent}}% value. Buying opportunity!',
    icon: '📉',
    multiplier: 0.7,
    durationRange: [45, 90],
    affectsAll: false,
    probability: 0.12,
  },
  {
    type: 'liquidity_bonus',
    titleEs: 'Bonus de Liquidez',
    titleEn: 'Liquidity Bonus',
    descriptionEs: '¡Momento perfecto para ser LP! +50% XP por añadir liquidez.',
    descriptionEn: 'Perfect time to LP! +50% XP for adding liquidity.',
    icon: '💧',
    multiplier: 1.5,
    durationRange: [90, 180],
    affectsAll: true,
    probability: 0.1,
  },
  {
    type: 'trading_frenzy',
    titleEs: '¡Frenesí de Trading!',
    titleEn: 'Trading Frenzy!',
    descriptionEs: 'Los NPCs están activos. Más fees para los LPs.',
    descriptionEn: 'NPCs are active. More fees for LPs.',
    icon: '🎪',
    multiplier: 2.0,
    durationRange: [120, 240],
    affectsAll: true,
    probability: 0.08,
  },
  {
    type: 'fee_discount',
    titleEs: 'Fees Reducidos',
    titleEn: 'Reduced Fees',
    descriptionEs: '¡50% de descuento en fees por tiempo limitado!',
    descriptionEn: '50% off fees for a limited time!',
    icon: '🏷️',
    multiplier: 0.5,
    durationRange: [60, 120],
    affectsAll: true,
    probability: 0.1,
  },
  {
    type: 'xp_boost',
    titleEs: '¡Hora Dorada!',
    titleEn: 'Golden Hour!',
    descriptionEs: '¡Doble XP en todas las acciones!',
    descriptionEn: 'Double XP on all actions!',
    icon: '✨',
    multiplier: 2.0,
    durationRange: [120, 180],
    affectsAll: true,
    probability: 0.05,
  },
  {
    type: 'token_spotlight',
    titleEs: 'Token Destacado',
    titleEn: 'Token Spotlight',
    descriptionEs: '{{token}} es el token del momento. +25% XP al tradearlo.',
    descriptionEn: '{{token}} is trending. +25% XP when trading it.',
    icon: '🔦',
    multiplier: 1.25,
    durationRange: [180, 300],
    affectsAll: false,
    probability: 0.12,
  },
  {
    type: 'whale_alert',
    titleEs: '¡Alerta de Ballena!',
    titleEn: 'Whale Alert!',
    descriptionEs: 'Un gran trader está por entrar al mercado. Prepárate para volatilidad.',
    descriptionEn: 'A big trader is about to enter. Prepare for volatility.',
    icon: '🐋',
    multiplier: 1.5,
    durationRange: [30, 60],
    affectsAll: true,
    probability: 0.07,
  },
];

// Token names for events
const tokenNames: Record<string, { es: string; en: string; emoji: string }> = {
  mango: { es: 'Mango', en: 'Mango', emoji: '🥭' },
  limon: { es: 'Limón', en: 'Lemon', emoji: '🍋' },
  sandia: { es: 'Sandía', en: 'Watermelon', emoji: '🍉' },
  platano: { es: 'Plátano', en: 'Banana', emoji: '🍌' },
  peso: { es: 'Peso', en: 'Peso', emoji: '💵' },
};

/**
 * Random number between min and max
 */
const randomInRange = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Pick a random token
 */
const pickRandomToken = (): string => {
  const tokens = Object.keys(tokenNames);
  return tokens[Math.floor(Math.random() * tokens.length)];
};

/**
 * Generate a random market event
 */
export const generateMarketEvent = (language: 'es' | 'en' = 'es'): MarketEvent | null => {
  // Roll for each event type based on probability
  const roll = Math.random();
  let cumulativeProbability = 0;

  for (const template of eventTemplates) {
    cumulativeProbability += template.probability;
    if (roll < cumulativeProbability) {
      const tokenId = template.affectsAll ? 'all' : pickRandomToken();
      const tokenInfo = tokenId === 'all' ? null : tokenNames[tokenId];
      const duration = randomInRange(template.durationRange[0], template.durationRange[1]);
      const percent = Math.round((Math.abs(template.multiplier - 1) * 100));

      let title = language === 'en' ? template.titleEn : template.titleEs;
      let description = language === 'en' ? template.descriptionEn : template.descriptionEs;

      if (tokenInfo) {
        const tokenName = `${tokenInfo.emoji} ${language === 'en' ? tokenInfo.en : tokenInfo.es}`;
        description = description.replace('{{token}}', tokenName);
        title = title.replace('{{token}}', tokenName);
      }
      description = description.replace('{{percent}}', percent.toString());

      return {
        id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: template.type,
        title,
        description,
        icon: template.icon,
        affectedTokens: template.affectsAll ? ['all'] : [tokenId],
        multiplier: template.multiplier,
        duration,
        startTime: Date.now(),
        isActive: true,
      };
    }
  }

  return null;
};

/**
 * Check if event has expired
 */
export const isEventExpired = (event: MarketEvent): boolean => {
  const elapsed = (Date.now() - event.startTime) / 1000;
  return elapsed >= event.duration;
};

/**
 * Get remaining time for event in seconds
 */
export const getEventTimeRemaining = (event: MarketEvent): number => {
  const elapsed = (Date.now() - event.startTime) / 1000;
  return Math.max(0, Math.ceil(event.duration - elapsed));
};

/**
 * Format time remaining as string
 */
export const formatTimeRemaining = (seconds: number): string => {
  if (seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Get event effect multiplier for a specific action
 */
export const getEventMultiplier = (
  events: MarketEvent[],
  action: 'swap' | 'liquidity' | 'fee' | 'xp',
  tokenId?: string
): number => {
  let multiplier = 1;

  for (const event of events) {
    if (!event.isActive) continue;

    const affectsToken = event.affectedTokens.includes('all') ||
      (tokenId && event.affectedTokens.includes(tokenId));

    switch (event.type) {
      case 'price_surge':
      case 'price_crash':
        if (action === 'swap' && affectsToken) {
          multiplier *= event.multiplier;
        }
        break;
      case 'liquidity_bonus':
        if (action === 'liquidity') {
          multiplier *= event.multiplier;
        }
        break;
      case 'trading_frenzy':
        if (action === 'fee') {
          multiplier *= event.multiplier;
        }
        break;
      case 'fee_discount':
        if (action === 'fee') {
          multiplier *= event.multiplier;
        }
        break;
      case 'xp_boost':
        if (action === 'xp') {
          multiplier *= event.multiplier;
        }
        break;
      case 'token_spotlight':
        if (action === 'xp' && affectsToken) {
          multiplier *= event.multiplier;
        }
        break;
      case 'whale_alert':
        if (action === 'fee') {
          multiplier *= event.multiplier;
        }
        break;
    }
  }

  return multiplier;
};

/**
 * Event check interval (check every 30 seconds)
 */
export const EVENT_CHECK_INTERVAL = 30000;

/**
 * Probability of event spawning per check (5%)
 */
export const EVENT_SPAWN_PROBABILITY = 0.05;

/**
 * Maximum concurrent events
 */
export const MAX_CONCURRENT_EVENTS = 2;
