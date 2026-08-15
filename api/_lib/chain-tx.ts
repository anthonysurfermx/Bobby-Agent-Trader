import { ethers } from 'ethers';

const NONCE_CONFLICT = /already known|nonce (?:too low|has already been used)|replacement transaction underpriced|transaction underpriced/i;

export function isNonceConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return NONCE_CONFLICT.test(message);
}

/**
 * Send using the freshest pending nonce and retry only known nonce races.
 * This keeps independent Vercel invocations sharing the recorder wallet from
 * silently replacing one another; a durable queue remains the long-term path.
 */
export async function sendWithNonceRetry(
  wallet: ethers.Wallet,
  provider: ethers.Provider,
  request: ethers.TransactionRequest,
  attempts = 4,
): Promise<ethers.TransactionResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const nonce = await provider.getTransactionCount(wallet.address, 'pending');
    try {
      return await wallet.sendTransaction({ ...request, nonce });
    } catch (error) {
      lastError = error;
      if (!isNonceConflict(error) || attempt === attempts - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Transaction could not be submitted');
}

export async function waitForSuccessfulReceipt(
  tx: ethers.TransactionResponse,
): Promise<ethers.TransactionReceipt> {
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) {
    throw new Error(`Transaction ${tx.hash} was not confirmed successfully`);
  }
  return receipt;
}
