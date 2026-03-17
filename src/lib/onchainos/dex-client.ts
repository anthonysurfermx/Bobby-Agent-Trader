// ============================================================
// OKX DEX Aggregator Client — web3.okx.com API v5
// Handles HMAC-SHA256 auth + DEX quote/swap/bridge endpoints
// Supports 400+ DEXes across 26+ chains including X Layer
// ============================================================

// ---------- Auth ----------

interface OKXDexCredentials {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  projectId: string;
}

function getDexCredentials(): OKXDexCredentials {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;

  if (!apiKey || !secretKey || !passphrase || !projectId) {
    throw new Error('[OKX DEX] Missing credentials. Need: OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE, OKX_PROJECT_ID');
  }

  return { apiKey, secretKey, passphrase, projectId };
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function dexFetch<T>(path: string, queryParams: Record<string, string>): Promise<T> {
  const creds = getDexCredentials();
  const timestamp = new Date().toISOString();
  const queryString = '?' + new URLSearchParams(queryParams).toString();

  // DEX signature: timestamp + method + requestPath + queryString
  const stringToSign = timestamp + 'GET' + path + queryString;
  const signature = await hmacSign(stringToSign, creds.secretKey);

  const url = `https://www.okx.com${path}${queryString}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'OK-ACCESS-KEY': creds.apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': creds.passphrase,
      'OK-ACCESS-PROJECT': creds.projectId,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[OKX DEX] HTTP ${response.status}: ${errorText}`);
  }

  const json = await response.json() as { code: string; msg: string; data: T };

  if (json.code !== '0') {
    throw new Error(`[OKX DEX] API Error ${json.code}: ${json.msg}`);
  }

  return json.data;
}

// ---------- Types ----------

export interface DexQuote {
  chainId: string;
  fromToken: TokenInfo;
  toToken: TokenInfo;
  fromTokenAmount: string;
  toTokenAmount: string;
  estimateGasFee: string;
  routerList: DexRoute[];
  quoteCompareList: DexComparison[];
}

export interface TokenInfo {
  tokenContractAddress: string;
  tokenSymbol: string;
  tokenName: string;
  decimal: string;
  tokenUnitPrice: string;
}

export interface DexRoute {
  router: string;
  routerPercent: string;
  subRouterList: Array<{
    dexRouter: Array<{
      dexName: string;
      dexProtocol: string[];
      fromToken: { tokenSymbol: string; tokenContractAddress: string };
      toToken: { tokenSymbol: string; tokenContractAddress: string };
    }>;
  }>;
}

export interface DexComparison {
  dexName: string;
  dexLogo: string;
  tradeFee: string;
  receiveAmount: string;
  amountProportion?: string;
}

export interface SwapData {
  routerResult: DexQuote;
  tx: {
    from: string;
    to: string;
    value: string;
    data: string;
    gasPrice: string;
    gasLimit: string;
  };
}

export interface CrossChainQuote {
  fromChainId: string;
  toChainId: string;
  fromTokenAmount: string;
  toTokenAmount: string;
  bridgeName: string;
  estimateTime: string;
  routerList: Array<{
    bridgeName: string;
    bridgeLogo: string;
    toTokenAmount: string;
    estimateTime: string;
    fromDexRouterList: DexRoute[];
    toDexRouterList: DexRoute[];
  }>;
}

// ---------- Public API ----------

/**
 * Get a swap quote from OKX DEX aggregator.
 * Returns the best price across 400+ DEXes without executing.
 */
export async function getQuote(params: {
  chainId: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string; // in smallest unit (wei, satoshi, etc.)
  slippage?: string; // e.g. "0.5" for 0.5%
}): Promise<DexQuote> {
  const query: Record<string, string> = {
    chainId: params.chainId,
    fromTokenAddress: params.fromTokenAddress,
    toTokenAddress: params.toTokenAddress,
    amount: params.amount,
    slippage: params.slippage || '0.5',
  };

  const data = await dexFetch<DexQuote[]>('/api/v5/dex/aggregator/quote', query);

  if (!data || data.length === 0) {
    throw new Error('[OKX DEX] No quote returned');
  }

  return data[0];
}

/**
 * Get swap calldata to execute on-chain via OKX DEX router.
 * Requires a connected wallet to sign the transaction.
 */
export async function getSwapData(params: {
  chainId: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  slippage?: string;
  userWalletAddress: string;
}): Promise<SwapData> {
  const query: Record<string, string> = {
    chainId: params.chainId,
    fromTokenAddress: params.fromTokenAddress,
    toTokenAddress: params.toTokenAddress,
    amount: params.amount,
    slippage: params.slippage || '0.5',
    userWalletAddress: params.userWalletAddress,
  };

  const data = await dexFetch<SwapData[]>('/api/v5/dex/aggregator/swap', query);

  if (!data || data.length === 0) {
    throw new Error('[OKX DEX] No swap data returned');
  }

  return data[0];
}

/**
 * Get a cross-chain bridge quote.
 */
export async function getCrossChainQuote(params: {
  fromChainId: string;
  toChainId: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  slippage?: string;
}): Promise<CrossChainQuote> {
  const query: Record<string, string> = {
    fromChainId: params.fromChainId,
    toChainId: params.toChainId,
    fromTokenAddress: params.fromTokenAddress,
    toTokenAddress: params.toTokenAddress,
    amount: params.amount,
    slippage: params.slippage || '0.5',
  };

  const data = await dexFetch<CrossChainQuote[]>('/api/v5/cross-chain/quote', query);

  if (!data || data.length === 0) {
    throw new Error('[OKX DEX] No cross-chain quote returned');
  }

  return data[0];
}

/**
 * Get supported chains for single-chain swaps.
 */
export async function getSupportedChains(): Promise<Array<{
  chainId: string;
  chainName: string;
  dexTokenApproveAddress: string;
}>> {
  return dexFetch('/api/v5/dex/aggregator/supported/chain', {});
}

/**
 * Get available liquidity sources for a chain.
 */
export async function getLiquiditySources(chainId: string): Promise<Array<{
  id: string;
  name: string;
  logo: string;
}>> {
  return dexFetch('/api/v5/dex/aggregator/get-liquidity', { chainId });
}

/**
 * Get ERC-20 approve transaction data for the OKX router.
 */
export async function getApproveData(params: {
  chainId: string;
  tokenContractAddress: string;
  approveAmount: string;
}): Promise<{ data: string; to: string }> {
  const data = await dexFetch<Array<{ data: string; dexContractAddress: string }>>(
    '/api/v5/dex/aggregator/approve-transaction',
    {
      chainId: params.chainId,
      tokenContractAddress: params.tokenContractAddress,
      approveAmount: params.approveAmount,
    }
  );

  if (!data || data.length === 0) {
    throw new Error('[OKX DEX] No approve data returned');
  }

  return { data: data[0].data, to: data[0].dexContractAddress };
}
