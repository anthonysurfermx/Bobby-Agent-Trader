// ============================================================
// Base swap allow-list — the ONLY tokens Bobby will quote or build calldata
// for. Shared by the API (server) and the UI (client): one list, no drift.
//
// Every address below was read back on-chain (symbol()/decimals()) on
// 2026-09-03 before being committed. Adding a token means: verify on
// Basescan, read symbol/decimals with eth_call, then append here. Nothing
// is learned from an upstream — the allow-list IS the code.
// ============================================================

export const BASE_SWAP_CHAIN_ID = 8453;
/** Pinned Uniswap V3 SwapRouter02 on Base. Shared with the browser signing guard. */
export const BASE_SWAP_ROUTER02 = '0x2626664c2603336E57B271c5C0b26F421741e481' as const;
/** Coinbase's onchain oracle registry for B20 tokenized stocks: getOracleParams(token) → (multiplier 1e18, paused).
 *  docs.base.org/specifications/b20/tokenized-stocks-on-base. A paused feed holds its last value during corporate actions. */
export const BASE_B20_ORACLE_REGISTRY = '0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD' as const;

/** Canonical WETH9 on Base (also what ETH is wrapped into by the router). */
export const BASE_WETH = '0x4200000000000000000000000000000000000006' as const;
/** Native USDC on Base (Circle). */
export const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;

export interface BaseSwapToken {
  symbol: string;
  name: string;
  /** Checksummed contract address. For native ETH this is WETH9 (the router wraps/unwraps). */
  address: `0x${string}`;
  decimals: number;
  /** True only for the native ETH entry: no approval, msg.value carries the amount. */
  native?: boolean;
  /** Stablecoins price the ticket in USD without an extra quote. */
  stable?: boolean;
  /** Symbols the agents use that map here (BTC → cbBTC). */
  aliases?: string[];
  /** Coinbase B20 tokenized equity. Identity is pinned by address, never mutable symbol metadata. */
  assetClass?: 'tokenized-stock';
  underlyingSymbol?: string;
  issuer?: 'Coinbase Tokenized Stocks';
  /** Official Chainlink Total Return Value feed on Base. */
  referenceFeed?: `0x${string}`;
  /** A deliberately smaller server-side cap for newer, thinner markets. */
  maxTicketUsd?: number;
}

export const BASE_SWAP_TOKENS: readonly BaseSwapToken[] = [
  { symbol: 'ETH', name: 'Ether', address: BASE_WETH, decimals: 18, native: true },
  { symbol: 'WETH', name: 'Wrapped Ether', address: BASE_WETH, decimals: 18 },
  { symbol: 'USDC', name: 'USD Coin', address: BASE_USDC, decimals: 6, stable: true, aliases: ['USD'] },
  { symbol: 'USDT', name: 'Tether USD', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6, stable: true },
  { symbol: 'DAI', name: 'Dai Stablecoin', address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, stable: true },
  { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8, aliases: ['BTC', 'WBTC'] },
  { symbol: 'AERO', name: 'Aerodrome', address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', decimals: 18 },
  {
    symbol: 'AAPLc', name: 'Coinbase Tokenized Apple',
    address: '0xb200000000000000000000C2e324d24d7eEcd1fb', decimals: 8,
    aliases: ['AAPL'], assetClass: 'tokenized-stock', underlyingSymbol: 'AAPL',
    issuer: 'Coinbase Tokenized Stocks', referenceFeed: '0x787f13dEa48Db0897CbCDD985de77809D837F988', maxTicketUsd: 100,
  },
  {
    symbol: 'GOOGLc', name: 'Coinbase Tokenized Alphabet',
    address: '0xb2000000000000000000002D0BA3164cc74f58B7', decimals: 8,
    aliases: ['GOOGL', 'GOOG'], assetClass: 'tokenized-stock', underlyingSymbol: 'GOOGL',
    issuer: 'Coinbase Tokenized Stocks', referenceFeed: '0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2', maxTicketUsd: 100,
  },
  {
    symbol: 'METAc', name: 'Coinbase Tokenized Meta',
    address: '0xb2000000000000000000008bC8786B856E61707C', decimals: 8,
    aliases: ['META'], assetClass: 'tokenized-stock', underlyingSymbol: 'META',
    issuer: 'Coinbase Tokenized Stocks', referenceFeed: '0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D', maxTicketUsd: 100,
  },
  {
    symbol: 'NVDAc', name: 'Coinbase Tokenized NVIDIA',
    address: '0xb20000000000000000000078ee7ce2fE4908108C', decimals: 8,
    aliases: ['NVDA'], assetClass: 'tokenized-stock', underlyingSymbol: 'NVDA',
    issuer: 'Coinbase Tokenized Stocks', referenceFeed: '0x04689a41629776563E6822F76f2e57D148d28513', maxTicketUsd: 100,
  },
  {
    symbol: 'SPCXc', name: 'Coinbase Tokenized SpaceX',
    address: '0xb2000000000000000000007b9fcbd005511aCBd5', decimals: 8,
    aliases: ['SPCX'], assetClass: 'tokenized-stock', underlyingSymbol: 'SPCX',
    issuer: 'Coinbase Tokenized Stocks', referenceFeed: '0x6A634B235903C4ad6376892180d6fF8612e3Fa68', maxTicketUsd: 10,
  },
] as const;

/** Server-enforced limits; the UI only mirrors them. */
export const BASE_SWAP_LIMITS = {
  /** Per-ticket cap in USD. Overridable down (never up) with BASE_SWAP_MAX_TICKET_USD. */
  maxTicketUsd: 500,
  minTicketUsd: 1,
  defaultSlippagePct: 0.5,
  maxSlippagePct: 3,
  /** Execution vs small-size price along the same route. Above this: no calldata. */
  maxPriceImpactPct: 3,
  /** Calldata deadline; the router reverts after it. */
  deadlineSec: 20 * 60,
} as const;

const BY_SYMBOL = new Map<string, BaseSwapToken>();
const BY_ADDRESS = new Map<string, BaseSwapToken>();
for (const t of BASE_SWAP_TOKENS) {
  BY_SYMBOL.set(t.symbol.toUpperCase(), t);
  for (const a of t.aliases ?? []) BY_SYMBOL.set(a.toUpperCase(), t);
  // Address lookups resolve to the ERC-20 entry (WETH), never to native ETH.
  if (!t.native) BY_ADDRESS.set(t.address.toLowerCase(), t);
}

/** Resolve a symbol, alias or address. Unknown → null (callers fail closed). */
export function findBaseToken(ref: string | null | undefined): BaseSwapToken | null {
  if (!ref) return null;
  const raw = String(ref).trim();
  if (!raw) return null;
  if (/^0x[0-9a-fA-F]{40}$/.test(raw)) return BY_ADDRESS.get(raw.toLowerCase()) ?? null;
  return BY_SYMBOL.get(raw.toUpperCase()) ?? null;
}

/**
 * Where Coinbase tokenized stocks may be offered by Bobby. FAIL-CLOSED: a
 * viewer whose edge country is not on this list gets quotes but never
 * calldata. Coinbase excludes US persons and "other restricted
 * jurisdictions"; this list is Bobby's own, narrower, and must be validated
 * by counsel before it grows. Version it on every change. The env brake
 * BASE_STOCK_COUNTRY_ALLOWLIST may only NARROW it (intersection), never widen.
 * IP country is a gate, not proof of residence — the human's attestation is
 * the other gate, and neither replaces KYC where the issuer requires it.
 */
export const STOCK_COUNTRY_ALLOWLIST = {
  version: '2026-09-03-draft-pending-legal-review',
  countries: ['MX'] as readonly string[],
} as const;

export function stockCountryAllowed(country: string | null | undefined, envList?: string | null): boolean {
  const c = (country || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return false;
  if (!STOCK_COUNTRY_ALLOWLIST.countries.includes(c)) return false;
  const narrow = (envList || '').split(',').map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x));
  return narrow.length ? narrow.includes(c) : true;
}

export function isStockToken(t: BaseSwapToken | null | undefined): boolean {
  return t?.assetClass === 'tokenized-stock';
}

/** Symbols the UI may offer, in display order. */
export const BASE_SWAP_SYMBOLS: readonly string[] = BASE_SWAP_TOKENS.map((t) => t.symbol);
export const BASE_STOCK_SYMBOLS: readonly string[] = BASE_SWAP_TOKENS
  .filter((t) => t.assetClass === 'tokenized-stock')
  .map((t) => t.symbol);
