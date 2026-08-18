// ============================================================
// trackrecord-v2 — server-side foundation for the oracle-verified recorder.
//
// This is the CHAIN-AGNOSTIC, side-effect-light core that the recorder endpoint
// imports to talk to BobbyTrackRecordV2: which price mode a symbol takes, the
// signed Pyth update it needs, the fee buffer to forward, and the V2 ABI.
//
// It deliberately does NOT touch chain selection, PROTOCOL_CHAIN, RPC wiring or
// the production X Layer v1 readers/writers — that endpoint surgery is a
// coordinated step (chain-aware v1/v2) that also needs a deployed V2 address and
// the Hermes API key. Keeping the primitives here, pure and tested, lets that
// wiring be small and lets the whole thing be exercised before it goes live.
//
// VERIFIED universe (spec v0.6 §1): BTC/ETH/SOL only. Everything else is
// ATTESTED (self-reported, v1 semantics), never mixed into verified stats (D-1).
// ============================================================

/** Matches the on-chain enum BobbyTrackRecordV2.PriceMode. Storage-zero is the
 *  WEAK claim, so ATTESTED must be 0 and VERIFIED 1 — do not reorder. */
export enum PriceMode {
  ATTESTED = 0,
  VERIFIED = 1,
}

/** Canonical Pyth price-feed ids for the verified universe (verified live via
 *  Hermes, docs/audit/oracle-comparison.md). The recorder proves entry+exit
 *  against these; a symbol absent here is ATTESTED. */
export const VERIFIED_FEEDS: Readonly<Record<string, `0x${string}`>> = Object.freeze({
  BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
});

/** Hermes base. Public until 2026-08-18; after that PYTH_HERMES_API_KEY is
 *  required — passed as a header so it never lands in a URL or a log. */
const HERMES_BASE = process.env.PYTH_HERMES_BASE || 'https://hermes.pyth.network';

/**
 * Canonicalize a recorder/debate symbol to a bare ticker the contract accepts:
 * uppercase, strip a trailing quote (BTC-USDT / ETH/USD → BTC / ETH), keep only
 * [A-Z0-9]. Mirrors the contract's charset gate so a symbol that would revert
 * `InvalidSymbol` on-chain is caught here first. The contract itself is the
 * source of truth for VERIFIED↔ATTESTED; this only normalizes the string.
 */
export function canonicalizeSymbol(input: unknown): string {
  let s = String(input ?? '').trim().toUpperCase();
  const sep = Math.min(
    ...['-', '/'].map((c) => (s.indexOf(c) === -1 ? Infinity : s.indexOf(c))),
  );
  if (Number.isFinite(sep)) {
    const quote = s.slice(sep + 1);
    if (['USDT', 'USDC', 'USD', 'PERP', 'SWAP'].some((q) => quote.startsWith(q))) {
      s = s.slice(0, sep);
    }
  }
  return s.replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

export interface ResolvedMode {
  symbol: string;
  mode: PriceMode;
  /** Present only for VERIFIED symbols. */
  feedId?: `0x${string}`;
}

/**
 * Decide VERIFIED vs ATTESTED from the canonical symbol. This MUST agree with
 * the on-chain `feedOf` mapping or `commitTrade` reverts `ModeMismatch` — the
 * recorder passes the resulting `mode` as `declaredMode`.
 */
export function resolvePriceMode(rawSymbol: unknown): ResolvedMode {
  const symbol = canonicalizeSymbol(rawSymbol);
  const feedId = VERIFIED_FEEDS[symbol];
  return feedId
    ? { symbol, mode: PriceMode.VERIFIED, feedId }
    : { symbol, mode: PriceMode.ATTESTED };
}

/** Signed update at a declared instant — the ONLY fetch shape the recorder
 *  uses (A2-1): entry anchors at entryAt, exit at exitAt, challenge at
 *  anchorTs. Hermes benchmarks return the FIRST tick at/after that instant,
 *  which is exactly what parsePriceFeedUpdatesUnique proves on-chain. */
export function buildHermesBenchmarkUrl(feedId: string, publishTimeSec: number): string {
  return `${HERMES_BASE}/v2/updates/price/${Math.floor(publishTimeSec)}?ids[]=${feedId}&encoding=hex`;
}

export interface SignedUpdate {
  /** ABI-ready bytes[] element for parsePriceFeedUpdatesUnique. */
  updateData: `0x${string}`;
  price: bigint;
  expo: number;
  conf: bigint;
  publishTime: number;
}

/** Normalize a raw Pyth (price, expo) to the contract's 1e8 scale — the same
 *  math the contract's _toE8 does, for pre-flight banding checks off-chain. */
export function toE8(price: bigint, expo: number): bigint {
  if (price <= 0n) throw new Error('non-positive price');
  if (expo < -18 || expo > 0) throw new Error(`unexpected expo ${expo}`);
  const shift = expo + 8;
  return shift >= 0
    ? price * 10n ** BigInt(shift)
    : price / 10n ** BigInt(-shift);
}

/** Fetch a signed update from Hermes. Network call; the API key (when set)
 *  rides in the Authorization header only. */
export async function fetchSignedUpdate(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SignedUpdate> {
  const headers: Record<string, string> = {};
  const key = process.env.PYTH_HERMES_API_KEY;
  if (key) headers.Authorization = `Bearer ${key}`;

  const res = await fetchImpl(url, { headers });
  if (!res.ok) throw new Error(`Hermes ${res.status}`);
  const data = (await res.json()) as {
    binary?: { data?: string[] };
    parsed?: Array<{ price?: { price?: string; expo?: number; conf?: string; publish_time?: number } }>;
  };
  const hex = data.binary?.data?.[0];
  const p = data.parsed?.[0]?.price;
  if (!hex || !p?.price) throw new Error('Hermes: malformed update');
  return {
    updateData: (hex.startsWith('0x') ? hex : `0x${hex}`) as `0x${string}`,
    price: BigInt(p.price),
    expo: Number(p.expo ?? -8),
    conf: BigInt(p.conf ?? '0'),
    publishTime: Number(p.publish_time ?? 0),
  };
}

/**
 * Fee buffer to forward with a payable commit/resolve. The contract charges the
 * exact Pyth `getUpdateFee` and REFUNDS the excess, so over-sending a small
 * fixed buffer is safe and avoids a second round-trip to read the fee. Mainnet
 * fee is ~4e12 wei (~$0.015); this buffer covers it with margin. Override via
 * env if a chain's fee ever rises.
 */
export const PYTH_FEE_BUFFER_WEI = BigInt(process.env.PYTH_FEE_BUFFER_WEI || '20000000000000'); // 2e13 = 0.00002 ETH

/** V2 write + read ABI (ethers human-readable). Generated to match the frozen
 *  ABI in docs/audit/BobbyTrackRecordV2.abi.json — regenerate from that file,
 *  never hand-drift. NOTE: getWinRate() (v1 selector 0x6f61e432) is GONE —
 *  D-1 splits it into getVerifiedWinRate/getAttestedWinRate. */
export const TRACKRECORD_V2_ABI = [
  'function announceCommit(bytes32 _debateHash)',
  'function commitTrade(bytes32 _debateHash, string _symbol, uint8 _agent, uint8 _conviction, uint96 _entryPrice, uint96 _targetPrice, uint96 _stopPrice, uint8 _declaredMode, uint64 _entryAt, bytes[] _entryUpdateData) payable',
  'function resolveTrade(bytes32 _debateHash, int256 _pnlBps, uint8 _result, uint96 _exitPrice, uint64 _exitAt, bytes[] _exitUpdateData) payable',
  'function challengeStopBreach(bytes32 _debateHash, uint64 _anchorTs, bytes[] _breachUpdateData) payable',
  'function expireCommitment(bytes32 _debateHash)',
  'function getVerifiedWinRate() view returns (uint256)',
  'function getAttestedWinRate() view returns (uint256)',
  'function getVerifiedScorecard() view returns (uint256 winRateBps, uint256 decided, uint256 resolved, uint256 expired, uint256 pending, uint256 resolutionBps)',
  'function getCoverage(uint8 mode) view returns (uint256 resolved, uint256 expired, uint256 pending)',
  'function getAgentStats(uint8 agent, uint8 mode) view returns (uint256 wins, uint256 losses, uint256 total, uint256 winRate)',
  'function isFinal(bytes32 _debateHash) view returns (bool)',
  'function totalTrades() view returns (uint256)',
  'function totalCommitments() view returns (uint256)',
] as const;

/** The Pyth fee getter, in case the recorder prefers exact fee over the buffer. */
export const PYTH_FEE_ABI = ['function getUpdateFee(bytes[] updateData) view returns (uint256)'] as const;
