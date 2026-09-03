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
}

export const BASE_SWAP_TOKENS: readonly BaseSwapToken[] = [
  { symbol: 'ETH', name: 'Ether', address: BASE_WETH, decimals: 18, native: true },
  { symbol: 'WETH', name: 'Wrapped Ether', address: BASE_WETH, decimals: 18 },
  { symbol: 'USDC', name: 'USD Coin', address: BASE_USDC, decimals: 6, stable: true, aliases: ['USD'] },
  { symbol: 'USDT', name: 'Tether USD', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6, stable: true },
  { symbol: 'DAI', name: 'Dai Stablecoin', address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, stable: true },
  { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8, aliases: ['BTC', 'WBTC'] },
  { symbol: 'AERO', name: 'Aerodrome', address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', decimals: 18 },
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

/** Symbols the UI may offer, in display order. */
export const BASE_SWAP_SYMBOLS: readonly string[] = BASE_SWAP_TOKENS.map((t) => t.symbol);
