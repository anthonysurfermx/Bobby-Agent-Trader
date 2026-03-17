import { PlayerLevel } from '@/components/games/mercado-lp/types/game';

export const playerLevels: PlayerLevel[] = [
  {
    level: 1,
    name: 'Aprendiz',
    minXP: 0,
    maxXP: 199,
    icon: '🌱',
    perks: ['Acceso a Nivel 1: Marchante'],
  },
  {
    level: 2,
    name: 'Marchante',
    minXP: 200,
    maxXP: 499,
    icon: '🔄',
    perks: ['Acceso a Nivel 2: Puestero', 'Descuento 5% en fees'],
  },
  {
    level: 3,
    name: 'Puestero',
    minXP: 500,
    maxXP: 999,
    icon: '🏪',
    perks: ['Acceso a Nivel 3: Agricultor', 'Bonus XP +20%'],
  },
  {
    level: 4,
    name: 'Comerciante',
    minXP: 1000,
    maxXP: 1999,
    icon: '💼',
    perks: ['Acceso a Nivel 4: Subastero', 'Badge especial', 'Título personalizado'],
  },
  {
    level: 5,
    name: 'Maestro',
    minXP: 2000,
    maxXP: 3999,
    icon: '⭐',
    perks: ['Acceso a Nivel 5: Ligas de Trading', 'Bonus XP +50%', 'Descuento 15% en fees', 'Competencia semanal'],
  },
  {
    level: 6,
    name: 'Leyenda',
    minXP: 4000,
    maxXP: 999999,
    icon: '👑',
    perks: ['Acceso a Nivel 6: Market Maker', 'Bonus XP +100%', 'Hooks avanzados', 'Hall of Fame'],
  },
];

export const getPlayerLevel = (xp: number): PlayerLevel => {
  for (let i = playerLevels.length - 1; i >= 0; i--) {
    if (xp >= playerLevels[i].minXP) {
      return playerLevels[i];
    }
  }
  return playerLevels[0];
};

export const getNextLevel = (currentLevel: number): PlayerLevel | null => {
  return playerLevels.find(l => l.level === currentLevel + 1) || null;
};

export const getXPProgress = (xp: number): { current: number; max: number; percentage: number } => {
  const level = getPlayerLevel(xp);
  const current = xp - level.minXP;
  const max = level.maxXP - level.minXP;
  const percentage = Math.min((current / max) * 100, 100);

  return { current, max, percentage };
};

/**
 * Calcula el multiplicador de XP según el nivel del jugador
 * N1-N2: 1x (sin bonus)
 * N3: 1.2x (+20%)
 * N4: 1.2x (+20%)
 * N5: 1.5x (+50%)
 * N6: 2x (+100%)
 */
export const getXPMultiplier = (playerLevel: number): number => {
  if (playerLevel >= 6) return 2.0;   // +100%
  if (playerLevel >= 5) return 1.5;   // +50%
  if (playerLevel >= 3) return 1.2;   // +20%
  return 1.0;                          // Sin bonus
};

/**
 * Calcula el descuento de fees según el nivel del jugador
 * N1: 0% descuento
 * N2-N4: 5% descuento
 * N5-N6: 15% descuento
 */
export const getFeeDiscount = (playerLevel: number): number => {
  if (playerLevel >= 5) return 0.15;  // 15% descuento
  if (playerLevel >= 2) return 0.05;  // 5% descuento
  return 0;                            // Sin descuento
};

/**
 * Obtiene los perks activos formateados para mostrar en UI
 */
export const getActivePerks = (playerLevel: number): { xpBonus: string; feeDiscount: string } => {
  const xpMult = getXPMultiplier(playerLevel);
  const feeDisc = getFeeDiscount(playerLevel);

  return {
    xpBonus: xpMult > 1 ? `+${Math.round((xpMult - 1) * 100)}% XP` : '',
    feeDiscount: feeDisc > 0 ? `-${Math.round(feeDisc * 100)}% fees` : '',
  };
};
