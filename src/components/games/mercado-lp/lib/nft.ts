import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export interface NFTClaim {
  id: string;
  user_id: string;
  nft_type: string;
  token_id?: string;
  contract_address?: string;
  chain: string;
  claim_status: 'pending' | 'minting' | 'completed' | 'failed';
  player_level: number;
  player_xp: number;
  total_swaps: number;
  total_lp_provided: number;
  tokens_created: number;
  metadata: any;
  claimed_at?: string;
  minted_at?: string;
  tx_hash?: string;
  error_message?: string;
}

/**
 * Check if the current user can claim the NFT
 */
export async function canClaimNFT(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return false;
    }

    const { data, error } = await supabase
      .rpc('can_claim_mercado_lp_nft', {
        p_user_id: user.id
      });

    if (error) {
      console.error('Error checking NFT claim eligibility:', error);
      return false;
    }

    return data as boolean;
  } catch (error) {
    console.error('Error checking NFT claim eligibility:', error);
    return false;
  }
}

/**
 * Check if user has already claimed the NFT
 */
export async function hasClaimedNFT(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return false;
    }

    const { data, error } = await supabase
      .from('mercado_lp_nft_claims')
      .select('id')
      .eq('user_id', user.id)
      .eq('nft_type', 'mercado_lp_maestro')
      .in('claim_status', ['completed', 'minting', 'pending'])
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking if NFT already claimed:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error('Error checking if NFT already claimed:', error);
    return false;
  }
}

/**
 * Get user's NFT claim
 */
export async function getUserNFTClaim(): Promise<NFTClaim | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data, error } = await supabase
      .from('mercado_lp_nft_claims')
      .select('*')
      .eq('user_id', user.id)
      .eq('nft_type', 'mercado_lp_maestro')
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data as NFTClaim | null;
  } catch (error) {
    console.error('Error getting NFT claim:', error);
    return null;
  }
}

/**
 * Create NFT claim for the current user
 */
export async function createNFTClaim(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error('Debes iniciar sesión para reclamar el NFT');
      return null;
    }

    // Check if can claim
    const canClaim = await canClaimNFT();
    if (!canClaim) {
      toast.error('No cumples los requisitos para reclamar el NFT');
      return null;
    }

    // Check if already claimed
    const alreadyClaimed = await hasClaimedNFT();
    if (alreadyClaimed) {
      toast.info('Ya has reclamado este NFT');
      return null;
    }

    // Create claim using RPC function
    const { data, error } = await supabase
      .rpc('create_nft_claim', {
        p_user_id: user.id
      });

    if (error) {
      throw error;
    }

    toast.success('¡NFT reclamado exitosamente! 🎉');
    console.log('✅ NFT claim created:', data);

    // TODO: Trigger NFT minting process
    // This would call a backend service or smart contract
    await initiateMinting(data as string);

    return data as string;
  } catch (error: any) {
    console.error('Error creating NFT claim:', error);
    toast.error(error.message || 'Error al reclamar NFT');
    return null;
  }
}

/**
 * Initiate the NFT minting process
 * This is a placeholder - actual implementation would call a backend service
 */
async function initiateMinting(claimId: string): Promise<void> {
  try {
    console.log('🎨 Initiating NFT minting for claim:', claimId);

    // Update status to minting
    const { error } = await supabase
      .from('mercado_lp_nft_claims')
      .update({
        claim_status: 'minting',
      })
      .eq('id', claimId);

    if (error) {
      throw error;
    }

    // TODO: Call backend service to mint NFT
    // This would typically:
    // 1. Generate NFT metadata and upload to IPFS
    // 2. Call smart contract to mint NFT
    // 3. Update database with token_id and tx_hash

    // For now, just log
    console.log('🚀 NFT minting process initiated');
    toast.info('Tu NFT se está procesando... ¡Revisa tu email!');

  } catch (error) {
    console.error('Error initiating minting:', error);

    // Update status to failed
    await supabase
      .from('mercado_lp_nft_claims')
      .update({
        claim_status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error'
      })
      .eq('id', claimId);
  }
}

/**
 * Update NFT claim status (admin/backend function)
 */
export async function updateNFTClaimStatus(
  claimId: string,
  status: 'minting' | 'completed' | 'failed',
  tokenId?: string,
  contractAddress?: string,
  txHash?: string,
  errorMessage?: string
): Promise<boolean> {
  try {
    const updateData: any = {
      claim_status: status,
    };

    if (status === 'completed') {
      updateData.minted_at = new Date().toISOString();
      if (tokenId) updateData.token_id = tokenId;
      if (contractAddress) updateData.contract_address = contractAddress;
      if (txHash) updateData.tx_hash = txHash;
    }

    if (status === 'failed' && errorMessage) {
      updateData.error_message = errorMessage;
    }

    const { error } = await supabase
      .from('mercado_lp_nft_claims')
      .update(updateData)
      .eq('id', claimId);

    if (error) {
      throw error;
    }

    console.log('✅ NFT claim status updated:', status);
    return true;
  } catch (error) {
    console.error('Error updating NFT claim status:', error);
    return false;
  }
}
