import { supabase } from '@/lib/supabase';

export interface FollowedWallet {
  id: string;
  user_id: string;
  wallet_address: string;
  label: string | null;
  created_at: string;
}

export const followedWalletsService = {
  async getAll(): Promise<FollowedWallet[]> {
    const { data, error } = await supabase
      .from('followed_wallets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as FollowedWallet[]) || [];
  },

  async follow(walletAddress: string, label?: string): Promise<FollowedWallet> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('followed_wallets')
      .insert({
        user_id: user.id,
        wallet_address: walletAddress.toLowerCase(),
        label: label || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') throw new Error('Already following this wallet');
      throw error;
    }
    return data as FollowedWallet;
  },

  async unfollow(walletAddress: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('followed_wallets')
      .delete()
      .eq('user_id', user.id)
      .eq('wallet_address', walletAddress.toLowerCase());

    if (error) throw error;
  },

  async updateLabel(walletAddress: string, label: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('followed_wallets')
      .update({ label })
      .eq('user_id', user.id)
      .eq('wallet_address', walletAddress.toLowerCase());

    if (error) throw error;
  },

  async isFollowing(walletAddress: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
      .from('followed_wallets')
      .select('id')
      .eq('user_id', user.id)
      .eq('wallet_address', walletAddress.toLowerCase())
      .maybeSingle();

    if (error) return false;
    return !!data;
  },
};
