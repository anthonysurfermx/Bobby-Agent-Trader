import { supabase } from '@/lib/supabase';

// NFT Contract on Base
export const NFT_CONTRACT_ADDRESS = '0xA03DA0BAab286043aD01f22a1F69b1D46b0E2EF7';
export const NFT_CHAIN = 'base';

export interface NFTGalleryProfile {
  id: string;
  user_id: string;
  nickname: string;
  twitter_handle: string | null;
  wallet_address: string | null;
  token_ids: number[];
  player_level: number;
  player_xp: number;
  contract_address: string;
  chain: string;
  verified_on_chain: boolean;
  minted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GalleryItem {
  nickname: string;
  twitterHandle: string | null;
  walletAddress: string | null;
  tokenIds: number[];
  playerLevel: number;
  playerXP: number;
  verifiedOnChain: boolean;
  mintedAt: string | null;
}

/**
 * Get all NFT gallery profiles for the public gallery
 */
export async function getGalleryProfiles(limit = 50): Promise<GalleryItem[]> {
  try {
    const { data, error } = await supabase
      .from('nft_gallery_profiles')
      .select('nickname, twitter_handle, wallet_address, token_ids, player_level, player_xp, verified_on_chain, minted_at, created_at')
      .eq('contract_address', NFT_CONTRACT_ADDRESS)
      .order('player_xp', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data || []).map((item) => ({
      nickname: item.nickname,
      twitterHandle: item.twitter_handle,
      walletAddress: item.wallet_address,
      tokenIds: item.token_ids || [],
      playerLevel: item.player_level,
      playerXP: item.player_xp,
      verifiedOnChain: item.verified_on_chain,
      mintedAt: item.minted_at || item.created_at,
    }));
  } catch (error) {
    console.error('Error fetching gallery profiles:', error);
    return [];
  }
}

/**
 * Get gallery stats
 */
export async function getGalleryStats(): Promise<{
  totalMinted: number;
  totalVerified: number;
  averageLevel: number;
  averageXP: number;
}> {
  try {
    const { data, error } = await supabase
      .from('nft_gallery_profiles')
      .select('player_level, player_xp, verified_on_chain, wallet_address')
      .eq('contract_address', NFT_CONTRACT_ADDRESS);

    if (error) throw error;

    const profiles = data || [];
    // Count all registered profiles as "minted" since they completed the game
    const totalProfiles = profiles.length;
    // Verified = those with wallet address connected
    const verifiedProfiles = profiles.filter(p => p.verified_on_chain || p.wallet_address);

    const totalLevels = profiles.reduce((sum, p) => sum + (p.player_level || 0), 0);
    const totalXP = profiles.reduce((sum, p) => sum + (p.player_xp || 0), 0);

    return {
      totalMinted: totalProfiles,
      totalVerified: verifiedProfiles.length,
      averageLevel: totalProfiles > 0 ? Math.round(totalLevels / totalProfiles) : 0,
      averageXP: totalProfiles > 0 ? Math.round(totalXP / totalProfiles) : 0,
    };
  } catch (error) {
    console.error('Error fetching gallery stats:', error);
    return {
      totalMinted: 0,
      totalVerified: 0,
      averageLevel: 0,
      averageXP: 0,
    };
  }
}

/**
 * Update profile with wallet address after minting
 */
export async function updateProfileWallet(
  userId: string,
  walletAddress: string,
  tokenId?: number
): Promise<boolean> {
  try {
    const updateData: Partial<NFTGalleryProfile> = {
      wallet_address: walletAddress.toLowerCase(),
      minted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (tokenId !== undefined) {
      // Append token ID to existing array
      const { data: existing } = await supabase
        .from('nft_gallery_profiles')
        .select('token_ids')
        .eq('user_id', userId)
        .single();

      const existingTokenIds = existing?.token_ids || [];
      if (!existingTokenIds.includes(tokenId)) {
        updateData.token_ids = [...existingTokenIds, tokenId];
      }
    }

    const { error } = await supabase
      .from('nft_gallery_profiles')
      .update(updateData)
      .eq('user_id', userId);

    if (error) throw error;

    console.log('✅ Profile wallet updated');
    return true;
  } catch (error) {
    console.error('Error updating profile wallet:', error);
    return false;
  }
}

/**
 * Mark profile as verified on-chain
 */
export async function markProfileVerified(
  userId: string,
  tokenIds: number[]
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('nft_gallery_profiles')
      .update({
        verified_on_chain: true,
        token_ids: tokenIds,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) throw error;

    console.log('✅ Profile marked as verified');
    return true;
  } catch (error) {
    console.error('Error marking profile verified:', error);
    return false;
  }
}

/**
 * Get user's own gallery profile
 */
export async function getUserGalleryProfile(): Promise<NFTGalleryProfile | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('nft_gallery_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data as NFTGalleryProfile | null;
  } catch (error) {
    console.error('Error fetching user gallery profile:', error);
    return null;
  }
}
