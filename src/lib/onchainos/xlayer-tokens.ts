// ============================================================
// X Layer Token Registry — Chain ID 196
// Contract addresses for key tokens on OKX's L2
// ============================================================

export const XLAYER_CHAIN_ID = '196';
export const XLAYER_RPC = 'https://rpc.xlayer.tech';
export const XLAYER_EXPLORER = 'https://www.oklink.com/x-layer';

// OKX DEX uses this address for native tokens on all EVM chains
export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export interface XLayerToken {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logo?: string;
  isNative?: boolean;
}

// Verified contract addresses from OKLink + OKX token list
export const XLAYER_TOKENS: Record<string, XLayerToken> = {
  OKB: {
    symbol: 'OKB',
    name: 'OKB',
    address: NATIVE_TOKEN_ADDRESS,
    decimals: 18,
    isNative: true,
  },
  WOKB: {
    symbol: 'WOKB',
    name: 'Wrapped OKB',
    address: '0xe538905cf8410324e03A5A23C1c177a474D59b2b',
    decimals: 18,
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x74b7F16337b8972027F6196A17a631aC6dE26d22',
    decimals: 6,
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    address: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d',
    decimals: 6,
  },
  USDT0: {
    symbol: 'USDT0',
    name: 'USDT0 (LayerZero)',
    address: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
    decimals: 6,
  },
  WETH: {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    address: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c',
    decimals: 18,
  },
  WBTC: {
    symbol: 'WBTC',
    name: 'Wrapped BTC',
    address: '0xEA034fb02eB1808C2cc3adbC15f447B93CbE08e1',
    decimals: 8,
  },
  DAI: {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    address: '0xC5015b9d9161Dca7e18e32f6f25C4aD850731Fd4',
    decimals: 18,
  },
};

/**
 * Maps Polymarket asset keywords to X Layer token pairs.
 * When smart money accumulates "BTC", we want to quote USDC → WBTC on X Layer.
 */
export const ASSET_TO_XLAYER_PAIR: Record<string, { from: XLayerToken; to: XLayerToken }> = {
  btc: { from: XLAYER_TOKENS.USDC, to: XLAYER_TOKENS.WBTC },
  bitcoin: { from: XLAYER_TOKENS.USDC, to: XLAYER_TOKENS.WBTC },
  eth: { from: XLAYER_TOKENS.USDC, to: XLAYER_TOKENS.WETH },
  ethereum: { from: XLAYER_TOKENS.USDC, to: XLAYER_TOKENS.WETH },
  okb: { from: XLAYER_TOKENS.USDC, to: XLAYER_TOKENS.OKB },
};

/**
 * Convert a human-readable amount to smallest unit (wei/satoshi).
 * e.g. toSmallestUnit("100", 6) → "100000000" (100 USDC)
 */
export function toSmallestUnit(amount: string, decimals: number): string {
  const [whole, fraction = ''] = amount.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return (BigInt(whole) * BigInt(10 ** decimals) + BigInt(paddedFraction)).toString();
}

/**
 * Convert from smallest unit to human-readable.
 * e.g. fromSmallestUnit("100000000", 6) → "100.0"
 */
export function fromSmallestUnit(amount: string, decimals: number): string {
  const padded = amount.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals) || '0';
  const fraction = padded.slice(-decimals);
  const trimmed = fraction.replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed}` : whole;
}

/**
 * Extract asset keyword from a Polymarket market slug.
 * Returns the X Layer token pair if mappable.
 */
export function getXLayerPairFromSlug(slug: string): { from: XLayerToken; to: XLayerToken } | null {
  const slugLower = slug.toLowerCase();
  for (const [keyword, pair] of Object.entries(ASSET_TO_XLAYER_PAIR)) {
    const pattern = new RegExp(`(^|[-\\s])${keyword}([-\\s]|$)`);
    if (pattern.test(slugLower)) {
      return pair;
    }
  }
  return null;
}
