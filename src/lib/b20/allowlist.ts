// ============================================================
// B20 allowlist — the Coinbase tokenized stocks Bobby is allowed to touch.
//
// Discovery and listing are two different things. New B20s are DISCOVERED
// from the factory's `B20Created` event or Base's canonical list, but only an
// address in this administered table is ever quoted, charted or swapped.
// Tokens are identified by ADDRESS, never by ticker (the standard says so:
// symbols are not unique). Source: docs.base.org/specifications/b20/
// tokenized-stocks-on-base (2026-09-02).
// ============================================================

export const BASE_CHAIN_ID = 8453;

/** Circle USDC on Base — the quote asset for every B20 pair Bobby quotes. */
export const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;

/** B20 onchain registry: multiplier + pause flag for every listed token. */
export const B20_REGISTRY = '0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD' as const;

export interface B20Listing {
  /** Token contract on Base — the identity. */
  address: `0x${string}`;
  /** Onchain symbol (with the `c` suffix). */
  symbol: string;
  /** Underlying US ticker, for Bobby's analysis engine and Yahoo/OKX data. */
  underlying: string;
  name: string;
  /** Chainlink total-return feed proxy on Base (24/5, freezes on corporate actions). */
  chainlinkFeed: `0x${string}`;
  /** Whether Bobby's demo surfaces it. Others stay discoverable but hidden. */
  featured: boolean;
}

export const B20_ALLOWLIST: readonly B20Listing[] = [
  { address: '0xb200000000000000000000C2e324d24d7eEcd1fb', symbol: 'AAPLc', underlying: 'AAPL', name: 'Apple Inc.', chainlinkFeed: '0x787f13dEa48Db0897CbCDD985de77809D837F988', featured: true },
  { address: '0xb20000000000000000000078ee7ce2fE4908108C', symbol: 'NVDAc', underlying: 'NVDA', name: 'NVIDIA Corporation', chainlinkFeed: '0x04689a41629776563E6822F76f2e57D148d28513', featured: true },
  { address: '0xb2000000000000000000008bC8786B856E61707C', symbol: 'METAc', underlying: 'META', name: 'Meta Platforms', chainlinkFeed: '0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D', featured: true },
  { address: '0xb2000000000000000000002D0BA3164cc74f58B7', symbol: 'GOOGLc', underlying: 'GOOGL', name: 'Alphabet', chainlinkFeed: '0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2', featured: true },
  { address: '0xb200000000000000000000d9192b6B456483C2E8', symbol: 'AMZNc', underlying: 'AMZN', name: 'Amazon', chainlinkFeed: '0x06A8E4b3aBB3B7543d8396FB2B763d22820cB295', featured: false },
  { address: '0xB200000000000000000000Ab99cFa739E253872B', symbol: 'MSFTc', underlying: 'MSFT', name: 'Microsoft', chainlinkFeed: '0xeB10A6c9aa7E537aEd766C08c35Dae35B321b18c', featured: false },
  { address: '0xb2000000000000000000001e800a7f5189430cD0', symbol: 'TSLAc', underlying: 'TSLA', name: 'Tesla', chainlinkFeed: '0xFaf869185383a24F8cb00e27BdA6b63B9905DCb4', featured: false },
  { address: '0xb200000000000000000000c85a31389D71F3ecfb', symbol: 'COINc', underlying: 'COIN', name: 'Coinbase', chainlinkFeed: '0x408e44f504A7371a345F03a73dDC96A4b48e8aa7', featured: false },
  { address: '0xB20000000000000000000019f6E7C675b73C2e4D', symbol: 'CRCLc', underlying: 'CRCL', name: 'Circle Internet', chainlinkFeed: '0x0231cF2635D1E17bB5c2462cc7504Ba1fBd61f33', featured: false },
  { address: '0xB2000000000000000000004AFF16039bA04bdFBc', symbol: 'INTCc', underlying: 'INTC', name: 'Intel', chainlinkFeed: '0xAB657C39bac0D5886250D70849e2E3E008F2EECB', featured: false },
  { address: '0xb2000000000000000000004884b426556b92883d', symbol: 'MSTRc', underlying: 'MSTR', name: 'Strategy (MicroStrategy)', chainlinkFeed: '0xB3cE282CD188b35DA0E38D8Bc7d58e33173D202a', featured: false },
  { address: '0xb200000000000000000000397293Cb8cda9a10c5', symbol: 'SNDKc', underlying: 'SNDK', name: 'Sandisk', chainlinkFeed: '0x388b0dC46C0Fb05A74BeE0994fa5b02c6Fcca2eA', featured: false },
  { address: '0xb2000000000000000000007b9fcbd005511aCBd5', symbol: 'SPCXc', underlying: 'SPCX', name: 'SpaceX', chainlinkFeed: '0x6A634B235903C4ad6376892180d6fF8612e3Fa68', featured: false },
] as const;

/** Demo guardrails, enforced server-side and mirrored in the UI. */
export const B20_LIMITS = {
  /** Largest single ticket the demo will quote or build calldata for. */
  maxTicketUsdc: 500,
  minTicketUsdc: 5,
  /** Default and ceiling for user-selected slippage, in percent. */
  defaultSlippagePct: 0.5,
  maxSlippagePct: 2,
  /** Refuse to build a swap when the DEX price is this far from Chainlink. */
  maxOracleDeviationPct: 3,
  /** Chainlink feeds heartbeat every 24h; anything older is stale. */
  maxFeedAgeSec: 26 * 3600,
} as const;

export function findB20(query: string): B20Listing | undefined {
  const q = query.trim().toLowerCase();
  return B20_ALLOWLIST.find(
    (t) => t.address.toLowerCase() === q || t.symbol.toLowerCase() === q || t.underlying.toLowerCase() === q,
  );
}

export function isAllowlistedB20(address: string): boolean {
  const a = address.toLowerCase();
  return B20_ALLOWLIST.some((t) => t.address.toLowerCase() === a);
}
