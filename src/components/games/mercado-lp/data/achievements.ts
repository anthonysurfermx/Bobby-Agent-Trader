import { Badge } from '@/components/games/mercado-lp/types/game';

export interface Achievement extends Badge {
  condition: (player: any, pools: any[], tokens: any[]) => boolean;
  xpReward: number;
  category: 'trading' | 'liquidity' | 'creation' | 'mastery';
}

export const achievements: Achievement[] = [
  // === NIVEL 1: MARCHANTE (Trading) ===
  {
    id: 'first-swap',
    name: 'Primer Trueque',
    description: 'Completa tu primer swap en el mercado',
    icon: '🔄',
    category: 'trading',
    xpReward: 25,
    condition: (player) => player.swapCount >= 1,
  },
  {
    id: 'low-slippage-master',
    name: 'Precio Justo',
    description: 'Haz 5 swaps exitosos',
    icon: '🎯',
    category: 'trading',
    xpReward: 50,
    condition: (player) => player.swapCount >= 5,
  },
  {
    id: 'volume-trader',
    name: 'Alto Volumen',
    description: 'Completa 25 swaps en total',
    icon: '📈',
    category: 'trading',
    xpReward: 100,
    condition: (player) => player.swapCount >= 25,
  },
  {
    id: 'swap-legend',
    name: 'Leyenda del Trueque',
    description: 'Completa 50 swaps',
    icon: '👑',
    category: 'trading',
    xpReward: 200,
    condition: (player) => player.swapCount >= 50,
  },

  // === NIVEL 2: PUESTERO (Liquidity) ===
  {
    id: 'first-lp',
    name: 'Puestero Novato',
    description: 'Provee liquidez por primera vez',
    icon: '🏪',
    category: 'liquidity',
    xpReward: 50,
    condition: (player) => player.lpPositions.length >= 1,
  },
  {
    id: 'first-fee',
    name: 'Primera Propina',
    description: 'Gana tu primer fee como LP',
    icon: '💵',
    category: 'liquidity',
    xpReward: 30,
    condition: (player) => player.totalFeesEarned > 0,
  },
  {
    id: 'fee-collector',
    name: 'Colector de Propinas',
    description: 'Gana 50 en fees totales',
    icon: '💰',
    category: 'liquidity',
    xpReward: 100,
    condition: (player) => player.totalFeesEarned >= 50,
  },
  {
    id: 'diversified-lp',
    name: 'Portafolio Diverso',
    description: 'Mantén LP en 3 pools simultáneamente',
    icon: '🎪',
    category: 'liquidity',
    xpReward: 150,
    condition: (player) => player.lpPositions.length >= 3,
  },

  // === NIVEL 3: AGRICULTOR (Creation) ===
  {
    id: 'token-creator',
    name: 'Inventor de Frutas',
    description: 'Crea tu primer token',
    icon: '✨',
    category: 'creation',
    xpReward: 100,
    condition: (player, pools, tokens) => tokens.length > 5,
  },
  {
    id: 'successful-launch',
    name: 'Lanzamiento Exitoso',
    description: 'Tu token tiene liquidez > 100',
    icon: '🚀',
    category: 'creation',
    xpReward: 150,
    condition: (player, pools) => {
      const playerPools = pools.filter(p => p.createdBy === 'player');
      return playerPools.some(p => (p.reserveA + p.reserveB) > 100);
    },
  },
  {
    id: 'multi-token-creator',
    name: 'Agricultor Experto',
    description: 'Crea 3 tokens diferentes',
    icon: '🌾',
    category: 'creation',
    xpReward: 200,
    condition: (player, pools, tokens) => tokens.length >= 8, // 5 base + 3 custom
  },

  // === NIVEL 4: SUBASTERO (Auctions) ===
  {
    id: 'first-auction-bid',
    name: 'Primer Martillazo',
    description: 'Coloca tu primera oferta en subasta',
    icon: '🔨',
    category: 'mastery',
    xpReward: 50,
    condition: (player) => player.stats?.auctionBidsPlaced >= 1,
  },
  {
    id: 'auction-winner',
    name: 'Ganador de Subasta',
    description: 'Gana tokens en una subasta',
    icon: '🏆',
    category: 'mastery',
    xpReward: 150,
    condition: (player) => player.stats?.auctionTokensWon > 0,
  },

  // === MASTERY (Cross-level) ===
  {
    id: 'balanced-trader',
    name: 'Comerciante Equilibrado',
    description: 'Mantén al menos 20 unidades de 4 frutas diferentes',
    icon: '⚖️',
    category: 'mastery',
    xpReward: 150,
    condition: (player) => {
      const counts = Object.values(player.inventory).filter((v: any) => v >= 20);
      return counts.length >= 4;
    },
  },
  {
    id: 'reputation-50',
    name: 'Buena Fama',
    description: 'Alcanza 50 de reputación',
    icon: '🌟',
    category: 'mastery',
    xpReward: 100,
    condition: (player) => player.reputation >= 50,
  },
  {
    id: 'reputation-100',
    name: 'Estrella del Mercado',
    description: 'Alcanza 100 de reputación',
    icon: '⭐',
    category: 'mastery',
    xpReward: 250,
    condition: (player) => player.reputation >= 100,
  },
  {
    id: 'level-up-3',
    name: 'Puestero Certificado',
    description: 'Alcanza nivel 3 del jugador',
    icon: '🏅',
    category: 'mastery',
    xpReward: 150,
    condition: (player) => player.level >= 3,
  },
  {
    id: 'level-up-5',
    name: 'Maestro Reconocido',
    description: 'Alcanza nivel 5 del jugador',
    icon: '👨‍🎓',
    category: 'mastery',
    xpReward: 300,
    condition: (player) => player.level >= 5,
  },
  {
    id: 'streak-7',
    name: 'Racha Semanal',
    description: 'Juega 7 días consecutivos',
    icon: '🔥',
    category: 'mastery',
    xpReward: 200,
    condition: (player) => player.currentStreak >= 7,
  },
  {
    id: 'market-maven',
    name: 'Gurú del Mercado',
    description: 'Desbloquea 10 achievements',
    icon: '🧙',
    category: 'mastery',
    xpReward: 500,
    condition: (player) => player.badges.length >= 10,
  },
];
