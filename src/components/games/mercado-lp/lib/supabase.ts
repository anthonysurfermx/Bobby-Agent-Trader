import { supabase } from '@/lib/supabase';
import type { PlayerState, Pool, Token } from '../types/game';

export interface GameProgressData {
  user_id: string;
  xp: number;
  level: number;
  reputation: number;
  swap_count: number;
  total_fees_earned: number;
  inventory: Record<string, number>;
  lp_positions: any[];
  badges: any[];
  completed_challenges: string[];
  tutorial_progress: Record<string, boolean>;
  stats: {
    totalSwapVolume: number;
    profitableSwaps: number;
    totalLPProvided: number;
    tokensCreated: number;
    auctionBidsPlaced: number;
    auctionTokensWon: number;
  };
  last_played_date?: string;
  current_streak: number;
  best_streak: number;
  pools: Pool[];
  tokens: Token[];
  current_level: number;
  // Daily XP tracking (UTC-based)
  daily_xp?: number;
  daily_xp_date?: string; // ISO date string in UTC (YYYY-MM-DD)
  avatar?: string;
}

/**
 * Loads game progress from Supabase for the current user
 */
export async function loadGameProgress(): Promise<GameProgressData | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.log('No user logged in, using local storage');
      return null;
    }

    const { data, error } = await supabase
      .from('game_progress')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No row found - first time playing
        console.log('No game progress found for user, will create on first save');
        return null;
      }
      throw error;
    }

    console.log('✅ Game progress loaded from Supabase');
    return data as GameProgressData;
  } catch (error) {
    console.error('Error loading game progress:', error);
    return null;
  }
}

/**
 * Saves game progress to Supabase for the current user
 */
export async function saveGameProgress(
  player: PlayerState,
  pools: Pool[],
  tokens: Token[],
  currentLevel: number
): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.log('No user logged in, skipping Supabase save');
      return false;
    }

    const gameData: Partial<GameProgressData> = {
      user_id: user.id,
      xp: player.xp,
      level: player.level,
      avatar: player.avatar || '/player.png',
      reputation: player.reputation,
      swap_count: player.swapCount,
      total_fees_earned: player.totalFeesEarned,
      inventory: player.inventory,
      lp_positions: player.lpPositions,
      badges: player.badges,
      completed_challenges: player.completedChallenges,
      tutorial_progress: player.tutorialProgress,
      stats: player.stats,
      last_played_date: player.lastPlayedDate,
      current_streak: player.currentStreak,
      best_streak: player.bestStreak,
      pools,
      tokens,
      current_level: currentLevel,
      // Daily XP tracking (UTC-based)
      daily_xp: player.dailyXP,
      daily_xp_date: player.dailyXPDate,
    };

    const { error } = await supabase
      .from('game_progress')
      .upsert(gameData, {
        onConflict: 'user_id'
      });

    if (error) {
      throw error;
    }

    console.log('✅ Game progress saved to Supabase');
    return true;
  } catch (error) {
    console.error('Error saving game progress:', error);
    return false;
  }
}

/**
 * Gets the game leaderboard
 */
export async function getLeaderboard(limit = 10) {
  try {
    const { data, error } = await supabase
      .from('game_leaderboard')
      .select('*')
      .limit(limit);

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }
}

/**
 * Gets recent market activity from real users
 */
export interface MarketActivity {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar: string;
  xp: number;
  level: number;
  swap_count: number;
  updated_at: string;
}

export async function getRecentMarketActivity(limit = 10): Promise<MarketActivity[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('game_leaderboard')
      .select('user_id, full_name, avatar_url, xp, level, swap_count, updated_at')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).map((item: any, index: number) => ({
      id: `activity-${item.user_id}-${index}`,
      user_id: item.user_id,
      user_name: item.full_name || 'Jugador anónimo',
      user_avatar: item.avatar_url || '',
      xp: item.xp || 0,
      level: item.level || 1,
      swap_count: item.swap_count || 0,
      updated_at: item.updated_at,
    }));
  } catch (error) {
    console.error('Error fetching market activity:', error);
    // Fallback a datos locales para no romper la UI
    return [
      {
        id: 'activity-local-1',
        user_id: 'local',
        user_name: 'Mercado LP',
        user_avatar: '',
        xp: 0,
        level: 1,
        swap_count: 0,
        updated_at: new Date().toISOString(),
      },
    ];
  }
}

/**
 * Deletes game progress for the current user (reset game)
 */
export async function resetGameProgress(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.log('No user logged in');
      return false;
    }

    const { error } = await supabase
      .from('game_progress')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    console.log('✅ Game progress reset');
    return true;
  } catch (error) {
    console.error('Error resetting game progress:', error);
    return false;
  }
}
