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

export type BaseSwapTokenKind = 'crypto' | 'stock';

export interface BaseSwapToken {
  symbol: string;
  name: string;
  /** 'stock' = Coinbase tokenized equity (B20 standard). Extra guards apply. */
  kind?: BaseSwapTokenKind;
  /** Underlying US ticker for stocks (AAPL for AAPLc). */
  underlying?: string;
  /** Chainlink total-return feed proxy on Base for stocks (24/5; freezes on corporate actions). */
  chainlinkFeed?: `0x${string}`;
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

export const BASE_CRYPTO_TOKENS: readonly BaseSwapToken[] = [
  { symbol: 'ETH', name: 'Ether', address: BASE_WETH, decimals: 18, native: true },
  { symbol: 'WETH', name: 'Wrapped Ether', address: BASE_WETH, decimals: 18 },
  { symbol: 'USDC', name: 'USD Coin', address: BASE_USDC, decimals: 6, stable: true, aliases: ['USD'] },
  { symbol: 'USDT', name: 'Tether USD', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6, stable: true },
  { symbol: 'DAI', name: 'Dai Stablecoin', address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, stable: true },
  { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8, aliases: ['BTC', 'WBTC'] },
  { symbol: 'AERO', name: 'Aerodrome', address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', decimals: 18 },
] as const;

/**
 * Coinbase tokenized stocks on Base (B20 standard, `c` suffix). Identity is
 * the ADDRESS; symbols are not unique under the standard. Source:
 * docs.base.org/specifications/b20/tokenized-stocks-on-base. All 13 read
 * back on-chain (symbol/decimals) 2026-09-03; Uniswap V3 pools existed that
 * day only for AAPLc, NVDAc, METAc and GOOGLc — the others quote `no_route`
 * until liquidity appears, which is the correct failure.
 */
export const BASE_STOCK_TOKENS: readonly BaseSwapToken[] = [
  { kind: 'stock', symbol: 'AAPLc', underlying: 'AAPL', name: 'Apple Inc.', address: '0xb200000000000000000000C2e324d24d7eEcd1fb', decimals: 8, chainlinkFeed: '0x787f13dEa48Db0897CbCDD985de77809D837F988', aliases: ['AAPL'] },
  { kind: 'stock', symbol: 'NVDAc', underlying: 'NVDA', name: 'NVIDIA Corporation', address: '0xb20000000000000000000078ee7ce2fE4908108C', decimals: 8, chainlinkFeed: '0x04689a41629776563E6822F76f2e57D148d28513', aliases: ['NVDA'] },
  { kind: 'stock', symbol: 'METAc', underlying: 'META', name: 'Meta Platforms', address: '0xb2000000000000000000008bC8786B856E61707C', decimals: 8, chainlinkFeed: '0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D', aliases: ['META'] },
  { kind: 'stock', symbol: 'GOOGLc', underlying: 'GOOGL', name: 'Alphabet', address: '0xb2000000000000000000002D0BA3164cc74f58B7', decimals: 8, chainlinkFeed: '0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2', aliases: ['GOOGL', 'GOOG'] },
  { kind: 'stock', symbol: 'AMZNc', underlying: 'AMZN', name: 'Amazon', address: '0xb200000000000000000000d9192b6B456483C2E8', decimals: 8, chainlinkFeed: '0x06A8E4b3aBB3B7543d8396FB2B763d22820cB295', aliases: ['AMZN'] },
  { kind: 'stock', symbol: 'MSFTc', underlying: 'MSFT', name: 'Microsoft', address: '0xB200000000000000000000Ab99cFa739E253872B', decimals: 8, chainlinkFeed: '0xeB10A6c9aa7E537aEd766C08c35Dae35B321b18c', aliases: ['MSFT'] },
  { kind: 'stock', symbol: 'TSLAc', underlying: 'TSLA', name: 'Tesla', address: '0xb2000000000000000000001e800a7f5189430cD0', decimals: 8, chainlinkFeed: '0xFaf869185383a24F8cb00e27BdA6b63B9905DCb4', aliases: ['TSLA'] },
  { kind: 'stock', symbol: 'COINc', underlying: 'COIN', name: 'Coinbase', address: '0xb200000000000000000000c85a31389D71F3ecfb', decimals: 8, chainlinkFeed: '0x408e44f504A7371a345F03a73dDC96A4b48e8aa7', aliases: ['COIN'] },
  { kind: 'stock', symbol: 'CRCLc', underlying: 'CRCL', name: 'Circle Internet', address: '0xB20000000000000000000019f6E7C675b73C2e4D', decimals: 8, chainlinkFeed: '0x0231cF2635D1E17bB5c2462cc7504Ba1fBd61f33', aliases: ['CRCL'] },
  { kind: 'stock', symbol: 'INTCc', underlying: 'INTC', name: 'Intel', address: '0xB2000000000000000000004AFF16039bA04bdFBc', decimals: 8, chainlinkFeed: '0xAB657C39bac0D5886250D70849e2E3E008F2EECB', aliases: ['INTC'] },
  { kind: 'stock', symbol: 'MSTRc', underlying: 'MSTR', name: 'Strategy (MicroStrategy)', address: '0xb2000000000000000000004884b426556b92883d', decimals: 8, chainlinkFeed: '0xB3cE282CD188b35DA0E38D8Bc7d58e33173D202a', aliases: ['MSTR'] },
  { kind: 'stock', symbol: 'SNDKc', underlying: 'SNDK', name: 'Sandisk', address: '0xb200000000000000000000397293Cb8cda9a10c5', decimals: 8, chainlinkFeed: '0x388b0dC46C0Fb05A74BeE0994fa5b02c6Fcca2eA', aliases: ['SNDK'] },
  { kind: 'stock', symbol: 'SPCXc', underlying: 'SPCX', name: 'SpaceX', address: '0xb2000000000000000000007b9fcbd005511aCBd5', decimals: 8, chainlinkFeed: '0x6A634B235903C4ad6376892180d6fF8612e3Fa68', aliases: ['SPCX'] },
] as const;

export const BASE_SWAP_TOKENS: readonly BaseSwapToken[] = [...BASE_CRYPTO_TOKENS, ...BASE_STOCK_TOKENS];

/** Stock-only guards on top of BASE_SWAP_LIMITS. Server-enforced. */
export const BASE_STOCK_LIMITS = {
  /** Refuse calldata when the DEX price is this far from the Chainlink reference. */
  maxOracleDeviationPct: 3,
  /** Feeds heartbeat every 24h (24/5 market); older than this is stale. */
  maxFeedAgeSec: 26 * 3600,
  /** Smaller tickets are noise against an 8-decimal share. */
  minTicketUsd: 5,
} as const;

export function isStockToken(t: BaseSwapToken | null | undefined): boolean {
  return t?.kind === 'stock';
}

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
export const BASE_STOCK_SYMBOLS: readonly string[] = BASE_STOCK_TOKENS.map((t) => t.symbol);
