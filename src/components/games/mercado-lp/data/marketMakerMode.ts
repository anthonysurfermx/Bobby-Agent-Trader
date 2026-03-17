import { AdvancedPoolHook, AdvancedHookType, MarketMakerStats } from '../types/game';

/**
 * Advanced hook configurations for Market Maker Mode (Level 6)
 */
export const advancedHooks: AdvancedPoolHook[] = [
  {
    id: 'volatility-oracle',
    name: 'Oráculo de Volatilidad',
    type: 'oracle',
    advancedType: 'volatility_oracle',
    description: 'Ajusta los fees automáticamente según la volatilidad del mercado. Mayor volatilidad = mayores fees para proteger a los LPs.',
    feeRangeBps: [5, 200],
    icon: '📊',
    unlockLevel: 6,
    parameters: {
      baseFeeBps: 30,
      volatilityMultiplier: 2.0,
      lookbackPeriod: 10, // trades
    },
  },
  {
    id: 'limit-order-hook',
    name: 'Hook de Órdenes Límite',
    type: 'custom',
    advancedType: 'limit_order',
    description: 'Permite a los traders colocar órdenes límite que se ejecutan cuando el precio alcanza cierto nivel.',
    feeRangeBps: [20, 50],
    icon: '📋',
    unlockLevel: 6,
    parameters: {
      maxPendingOrders: 5,
      executionBonus: 10, // BPS bonus for limit orders
    },
  },
  {
    id: 'concentrated-lp',
    name: 'Liquidez Concentrada',
    type: 'custom',
    advancedType: 'concentrated_lp',
    description: 'Permite concentrar tu liquidez en un rango de precios específico para mayores rendimientos.',
    feeRangeBps: [10, 100],
    icon: '🎯',
    unlockLevel: 6,
    parameters: {
      minRange: 0.8, // 80% of current price
      maxRange: 1.2, // 120% of current price
      concentrationBonus: 1.5, // 50% more fees in range
    },
  },
  {
    id: 'auto-rebalance',
    name: 'Auto-Rebalanceo',
    type: 'custom',
    advancedType: 'auto_rebalance',
    description: 'Rebalancea automáticamente tu posición para mantener el ratio 50/50 y minimizar pérdida impermanente.',
    feeRangeBps: [15, 40],
    icon: '⚖️',
    unlockLevel: 6,
    parameters: {
      rebalanceThreshold: 0.1, // 10% deviation triggers rebalance
      rebalanceFee: 5, // BPS fee for rebalancing
    },
  },
  {
    id: 'flash-loan-guard',
    name: 'Guardián Anti-Flash',
    type: 'anti_mev',
    advancedType: 'flash_loan_guard',
    description: 'Protege contra ataques de flash loans añadiendo un delay temporal en trades grandes.',
    feeRangeBps: [25, 100],
    icon: '🛡️',
    unlockLevel: 6,
    parameters: {
      flashLoanThreshold: 0.3, // 30% of reserves
      delayBlocks: 1,
      penaltyBps: 50,
    },
  },
  {
    id: 'mev-share',
    name: 'MEV Compartido',
    type: 'dynamic_fee',
    advancedType: 'mev_share',
    description: 'Captura el MEV generado por arbitrajistas y lo redistribuye entre los LPs.',
    feeRangeBps: [10, 150],
    icon: '💰',
    unlockLevel: 6,
    parameters: {
      mevCaptureRate: 0.5, // 50% of MEV captured
      lpShareRate: 0.8, // 80% goes to LPs
    },
  },
];

/**
 * Get hook by ID
 */
export const getAdvancedHook = (hookId: string): AdvancedPoolHook | undefined => {
  return advancedHooks.find(h => h.id === hookId);
};

/**
 * Get hooks available at a certain level
 */
export const getAvailableHooks = (playerLevel: number): AdvancedPoolHook[] => {
  return advancedHooks.filter(h => playerLevel >= h.unlockLevel);
};

/**
 * Calculate dynamic fee based on hook type and market conditions
 */
export const calculateHookFee = (
  hook: AdvancedPoolHook,
  tradeSize: number,
  reserveSize: number,
  recentVolatility: number = 0.1
): number => {
  if (!hook.feeRangeBps) return 30;

  const [minBps, maxBps] = hook.feeRangeBps;
  const tradeRatio = tradeSize / reserveSize;

  switch (hook.advancedType) {
    case 'volatility_oracle': {
      const volatilityFactor = Math.min(recentVolatility * (hook.parameters?.volatilityMultiplier || 2), 1);
      return minBps + (maxBps - minBps) * volatilityFactor;
    }

    case 'concentrated_lp': {
      // Lower fees when in range, higher when out of range
      const inRange = tradeRatio < (hook.parameters?.maxRange || 1.2);
      return inRange ? minBps : maxBps;
    }

    case 'flash_loan_guard': {
      const threshold = hook.parameters?.flashLoanThreshold || 0.3;
      if (tradeRatio > threshold) {
        return maxBps + (hook.parameters?.penaltyBps || 50);
      }
      return minBps;
    }

    case 'mev_share': {
      // Higher fees during high activity to capture more MEV
      const activityMultiplier = Math.min(tradeRatio * 5, 1);
      return minBps + (maxBps - minBps) * activityMultiplier;
    }

    case 'auto_rebalance':
    case 'limit_order':
    default:
      // Standard dynamic fee
      return minBps + (maxBps - minBps) * Math.min(tradeRatio, 1);
  }
};

/**
 * Initialize market maker stats
 */
export const initMarketMakerStats = (): MarketMakerStats => ({
  totalVolumeProvided: 0,
  totalFeesEarned: 0,
  poolsCreated: 0,
  uniqueTraders: 0,
  averageUtilization: 0,
  profitLoss: 0,
});

/**
 * Update market maker stats after an action
 */
export const updateMarketMakerStats = (
  stats: MarketMakerStats,
  action: 'volume' | 'fees' | 'pool' | 'trader',
  amount: number
): MarketMakerStats => {
  switch (action) {
    case 'volume':
      return {
        ...stats,
        totalVolumeProvided: stats.totalVolumeProvided + amount,
        averageUtilization: Math.min(1, (stats.totalVolumeProvided + amount) / (stats.poolsCreated * 1000 || 1)),
      };
    case 'fees':
      return {
        ...stats,
        totalFeesEarned: stats.totalFeesEarned + amount,
        profitLoss: stats.profitLoss + amount,
      };
    case 'pool':
      return {
        ...stats,
        poolsCreated: stats.poolsCreated + 1,
      };
    case 'trader':
      return {
        ...stats,
        uniqueTraders: stats.uniqueTraders + 1,
      };
    default:
      return stats;
  }
};

/**
 * Calculate market maker score for leaderboard
 */
export const calculateMarketMakerScore = (stats: MarketMakerStats): number => {
  const volumeScore = stats.totalVolumeProvided * 0.3;
  const feeScore = stats.totalFeesEarned * 10;
  const poolScore = stats.poolsCreated * 100;
  const utilScore = stats.averageUtilization * 500;
  const profitScore = Math.max(0, stats.profitLoss * 5);

  return Math.round(volumeScore + feeScore + poolScore + utilScore + profitScore);
};

/**
 * Get market maker rank title
 */
export const getMarketMakerTitle = (score: number): { title: string; titleEn: string; icon: string } => {
  if (score >= 10000) return { title: 'Creador de Mercado Legendario', titleEn: 'Legendary Market Maker', icon: '👑' };
  if (score >= 5000) return { title: 'Maestro de Liquidez', titleEn: 'Liquidity Master', icon: '💎' };
  if (score >= 2000) return { title: 'Proveedor Experto', titleEn: 'Expert Provider', icon: '⭐' };
  if (score >= 1000) return { title: 'Creador Establecido', titleEn: 'Established Maker', icon: '🏆' };
  if (score >= 500) return { title: 'Proveedor en Ascenso', titleEn: 'Rising Provider', icon: '📈' };
  return { title: 'Aprendiz de Mercado', titleEn: 'Market Apprentice', icon: '🌱' };
};

/**
 * Hook benefits for UI display
 */
export const getHookBenefits = (hookId: string, language: 'es' | 'en' = 'es'): string[] => {
  const benefits: Record<string, { es: string[]; en: string[] }> = {
    'volatility-oracle': {
      es: [
        'Protección automática en mercados volátiles',
        'Fees dinámicos que maximizan rendimiento',
        'Reduce pérdida impermanente',
      ],
      en: [
        'Automatic protection in volatile markets',
        'Dynamic fees that maximize returns',
        'Reduces impermanent loss',
      ],
    },
    'limit-order-hook': {
      es: [
        'Órdenes límite sin intermediarios',
        'Mejor ejecución de trades',
        'Bonus por órdenes ejecutadas',
      ],
      en: [
        'Limit orders without intermediaries',
        'Better trade execution',
        'Bonus for executed orders',
      ],
    },
    'concentrated-lp': {
      es: [
        'Hasta 50% más fees en tu rango',
        'Mayor eficiencia de capital',
        'Control granular de exposición',
      ],
      en: [
        'Up to 50% more fees in your range',
        'Higher capital efficiency',
        'Granular exposure control',
      ],
    },
    'auto-rebalance': {
      es: [
        'Minimiza pérdida impermanente',
        'Mantiene ratio 50/50 automáticamente',
        'Gestión pasiva de posiciones',
      ],
      en: [
        'Minimizes impermanent loss',
        'Automatically maintains 50/50 ratio',
        'Passive position management',
      ],
    },
    'flash-loan-guard': {
      es: [
        'Protección contra flash loans',
        'Penaliza trades sospechosos',
        'Mayor seguridad para LPs',
      ],
      en: [
        'Flash loan protection',
        'Penalizes suspicious trades',
        'Enhanced LP security',
      ],
    },
    'mev-share': {
      es: [
        'Captura MEV de arbitrajistas',
        '80% va directo a LPs',
        'Ingresos adicionales pasivos',
      ],
      en: [
        'Captures MEV from arbitrageurs',
        '80% goes directly to LPs',
        'Additional passive income',
      ],
    },
  };

  return benefits[hookId]?.[language] || [];
};
