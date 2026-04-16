// ============================================================
// dex-execution — OKX DEX Aggregator helpers for building signable
// calldata. Previously inlined in api/agent-run.ts. Uses the v5 endpoint
// path the agent cycle was already using; the public /api/dex-* proxy
// endpoints use v6 with a different response shape — those are distinct
// on purpose (different callers, different token addressing).
// ============================================================

import { hmacSign } from './okx-hmac';

const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export const TOKEN_REGISTRY: Record<string, Record<string, { address: string; decimals: number }>> = {
  '196': { // X Layer
    USDC: { address: '0x74b7F16337b8972027F6196A17a631aC6dE26d22', decimals: 6 },
    WETH: { address: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c', decimals: 18 },
    WBTC: { address: '0xEA034fb02eB1808C2cc3adbC15f447B93CbE08e1', decimals: 8 },
    OKB:  { address: NATIVE_TOKEN, decimals: 18 },
  },
  '1': { // Ethereum
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    WETH: { address: NATIVE_TOKEN, decimals: 18 },
    WBTC: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
  },
  '8453': { // Base
    USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    WETH: { address: NATIVE_TOKEN, decimals: 18 },
  },
};

interface OkxCreds {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  projectId: string;
}

function creds(): OkxCreds | null {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;
  if (!apiKey || !secretKey || !passphrase || !projectId) return null;
  return { apiKey, secretKey, passphrase, projectId };
}

function okxHeaders(c: OkxCreds, ts: string, sig: string) {
  return {
    'OK-ACCESS-KEY': c.apiKey,
    'OK-ACCESS-SIGN': sig,
    'OK-ACCESS-TIMESTAMP': ts,
    'OK-ACCESS-PASSPHRASE': c.passphrase,
    'OK-ACCESS-PROJECT': c.projectId,
  };
}

export interface SwapQuote {
  fromAmount: string;
  toAmount: string;
  fromToken: string;
  toToken: string;
}

export async function getSwapQuote(
  chainId: string,
  fromSymbol: string,
  toSymbol: string,
  amountUsd: number,
): Promise<SwapQuote | null> {
  const c = creds();
  if (!c) return null;

  const chainTokens = TOKEN_REGISTRY[chainId];
  if (!chainTokens || !chainTokens[fromSymbol] || !chainTokens[toSymbol]) return null;

  const from = chainTokens[fromSymbol];
  const to = chainTokens[toSymbol];
  const fromAmount = String(Math.round(amountUsd * (10 ** from.decimals)));

  const path = `/api/v5/dex/aggregator/quote?chainId=${chainId}&fromTokenAddress=${from.address}&toTokenAddress=${to.address}&amount=${fromAmount}`;
  const ts = new Date().toISOString();
  const sig = await hmacSign(ts + 'GET' + path, c.secretKey);

  try {
    const resp = await fetch(`https://www.okx.com${path}`, { headers: okxHeaders(c, ts, sig) });
    const data = await resp.json();
    if (data?.data?.[0]) {
      return {
        fromToken: fromSymbol,
        toToken: toSymbol,
        fromAmount,
        toAmount: data.data[0].toTokenAmount || '0',
      };
    }
  } catch (e) {
    console.error('[DEX] Quote error:', e);
  }
  return null;
}

export interface SwapCalldata {
  to: string;
  data: string;
  value: string;
  gas: string;
}

export async function getSwapCalldata(
  chainId: string,
  fromSymbol: string,
  toSymbol: string,
  amountUsd: number,
  userWallet: string,
  slippage = '0.5',
): Promise<SwapCalldata | null> {
  const c = creds();
  if (!c) return null;

  const chainTokens = TOKEN_REGISTRY[chainId];
  if (!chainTokens || !chainTokens[fromSymbol] || !chainTokens[toSymbol]) return null;

  const from = chainTokens[fromSymbol];
  const to = chainTokens[toSymbol];
  const fromAmount = String(Math.round(amountUsd * (10 ** from.decimals)));

  const path = `/api/v5/dex/aggregator/swap?chainId=${chainId}&fromTokenAddress=${from.address}&toTokenAddress=${to.address}&amount=${fromAmount}&userWalletAddress=${userWallet}&slippage=${slippage}`;
  const ts = new Date().toISOString();
  const sig = await hmacSign(ts + 'GET' + path, c.secretKey);

  try {
    const resp = await fetch(`https://www.okx.com${path}`, { headers: okxHeaders(c, ts, sig) });
    const data = await resp.json();
    const tx = data?.data?.[0]?.tx;
    if (tx) {
      return { to: tx.to, data: tx.data, value: tx.value || '0', gas: tx.gas || '500000' };
    }
  } catch (e) {
    console.error('[DEX] Swap calldata error:', e);
  }
  return null;
}

export interface ApproveCalldata {
  to: string;
  data: string;
}

export async function getApproveCalldata(
  chainId: string,
  tokenSymbol: string,
  amount: string,
): Promise<ApproveCalldata | null> {
  const c = creds();
  if (!c) return null;

  const chainTokens = TOKEN_REGISTRY[chainId];
  if (!chainTokens || !chainTokens[tokenSymbol]) return null;

  const token = chainTokens[tokenSymbol];
  // Native tokens don't need approval.
  if (token.address === NATIVE_TOKEN) return null;

  const path = `/api/v5/dex/aggregator/approve-transaction?chainId=${chainId}&tokenContractAddress=${token.address}&approveAmount=${amount}`;
  const ts = new Date().toISOString();
  const sig = await hmacSign(ts + 'GET' + path, c.secretKey);

  try {
    const resp = await fetch(`https://www.okx.com${path}`, { headers: okxHeaders(c, ts, sig) });
    const data = await resp.json();
    if (data?.data?.[0]) {
      return { to: data.data[0].to, data: data.data[0].data };
    }
  } catch (e) {
    console.error('[DEX] Approve error:', e);
  }
  return null;
}
