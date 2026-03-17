// ============================================================
// OKX OnchainOS Service — Token intelligence, whale tracking
// Wraps /api/okx-onchain Vercel proxy
// ============================================================

export interface TokenHolder {
  holderAddress: string;
  amount: string;
  valueUsd: string;
  share: string; // percentage
  rank: number;
}

export interface TopTrader {
  traderAddress: string;
  pnl: string;
  pnlUsd: string;
  tradeCount: number;
  buyAmount: string;
  sellAmount: string;
  netFlow: string;
}

export interface TrendingToken {
  tokenContractAddress: string;
  tokenSymbol: string;
  tokenName: string;
  chainIndex: string;
  price: string;
  priceChange24h: string;
  volume24h: string;
  marketCap: string;
  holders: number;
  logo: string;
}

export interface WalletPnL {
  address: string;
  totalPnl: string;
  totalPnlUsd: string;
  winRate: string;
  tradeCount: number;
  avgHoldTime: string;
}

// Cache
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 60_000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data as T;
  return null;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

async function fetchOnchain<T>(params: Record<string, string>): Promise<T | null> {
  const cacheKey = JSON.stringify(params);
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  const qs = new URLSearchParams(params).toString();
  try {
    const res = await fetch(`/api/okx-onchain?${qs}`);
    const json = await res.json();
    if (!json.ok || !json.data) return null;
    setCache(cacheKey, json.data);
    return json.data as T;
  } catch {
    return null;
  }
}

/** Get top holders for a token */
export function getTokenHolders(chainIndex: string, tokenAddress: string, limit = 20) {
  return fetchOnchain<TokenHolder[]>({
    action: 'holders',
    chainIndex,
    tokenAddress,
    limit: String(limit),
  });
}

/** Get top traders for a token */
export function getTopTraders(chainIndex: string, tokenAddress: string, limit = 20) {
  return fetchOnchain<TopTrader[]>({
    action: 'traders',
    chainIndex,
    tokenAddress,
    limit: String(limit),
  });
}

/** Get trending tokens on a chain */
export function getTrendingTokens(chainIndex = '1') {
  return fetchOnchain<TrendingToken[]>({
    action: 'trending',
    chainIndex,
  });
}

/** Get wallet PnL analysis */
export function getWalletPnL(chainIndex: string, address: string) {
  return fetchOnchain<WalletPnL>({
    action: 'wallet-pnl',
    chainIndex,
    address,
  });
}

// ─── Helpers for matching Polymarket whales to on-chain activity ───

/** Known token addresses for crypto prediction markets */
export const CRYPTO_TOKEN_MAP: Record<string, { chainIndex: string; address: string; symbol: string }> = {
  bitcoin: { chainIndex: '1', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC' },
  btc: { chainIndex: '1', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC' },
  ethereum: { chainIndex: '1', address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', symbol: 'ETH' },
  eth: { chainIndex: '1', address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', symbol: 'ETH' },
  solana: { chainIndex: '501', address: 'So11111111111111111111111111111111111111112', symbol: 'SOL' },
  sol: { chainIndex: '501', address: 'So11111111111111111111111111111111111111112', symbol: 'SOL' },
};

/** Detect crypto token from market title */
export function detectToken(title: string): typeof CRYPTO_TOKEN_MAP[string] | null {
  const lower = title.toLowerCase();
  for (const [keyword, config] of Object.entries(CRYPTO_TOKEN_MAP)) {
    if (lower.includes(keyword)) return config;
  }
  return null;
}
