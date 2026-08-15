import { ethers } from 'ethers';

export const PRICE_MODE = {
  ATTESTED: 0,
  VERIFIED: 1,
} as const;

export type PriceMode = (typeof PRICE_MODE)[keyof typeof PRICE_MODE];
export type HermesKind = 'latest' | 'timestamp';

export const PYTH_FEEDS = {
  BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
} as const;

export const DEFAULT_HERMES_URL = 'https://pyth.dourolabs.app/hermes';
export const CURRENT_HERMES_URL = 'https://hermes.pyth.network';

export const PYTH_CONTRACTS: Record<number, { upgraded: string; current: string }> = {
  8453: {
    upgraded: '0xbC16aee60f64864882BC6C4E428e148Fc0E272F5',
    current: '0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a',
  },
  84532: {
    upgraded: '0x5f52e4DBEA21f5b23523B6e20d50c29ae0a4EB83',
    current: '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729',
  },
};

export const TRACK_RECORD_V2_ABI = [
  'function commitTrade(bytes32,string,uint8,uint8,uint96,uint96,uint96,uint8,bytes[]) payable',
  'function resolveTrade(bytes32,int256,uint8,uint96,uint64,bytes[]) payable',
  'function expireCommitment(bytes32)',
  'function MAX_COMMITMENT_TTL() view returns (uint256)',
  'function totalTrades() view returns (uint256)',
  'function totalCommitments() view returns (uint256)',
  'function pendingCount() view returns (uint256)',
  'function winsVerified() view returns (uint256)',
  'function lossesVerified() view returns (uint256)',
  'function totalPnlBpsVerified() view returns (int256)',
  'function winsAttested() view returns (uint256)',
  'function lossesAttested() view returns (uint256)',
  'function totalPnlBpsAttested() view returns (int256)',
  'function getAttestedWinRate() view returns (uint256)',
  'function getVerifiedScorecard() view returns (uint256 winRateBps,uint256 decided,uint256 resolved,uint256 expired,uint256 pending,uint256 resolutionBps)',
  'function getCoverage(uint8) view returns (uint256 resolved,uint256 expired,uint256 pending)',
  'function getAgentStats(uint8,uint8) view returns (uint256 wins,uint256 losses,uint256 total,uint256 winRate)',
  'function activePyth() view returns (address)',
  'function feedOf(bytes32) view returns (bytes32)',
  'function commitIndex(bytes32) view returns (uint256)',
  'function tradeIndex(bytes32) view returns (uint256)',
  'function getCommitment(uint256) view returns (tuple(bytes32 debateHash,uint96 entryPrice,uint96 targetPrice,uint64 committedAt,uint96 stopPrice,address recorder,uint64 minResolveAt,uint8 agent,uint8 conviction,bool resolved,uint8 mode,uint16 entryWindowSec,uint16 exitWindowSec,uint24 maxExitLagSec,uint24 challengeWindowSec,uint16 entryTolBps,uint16 exitTolBps,uint16 confMaxBps,tuple(bytes32 feedId,int64 price,uint64 conf,int32 expo,uint64 publishTime) entryEvidence,string symbol))',
  'function getTrade(uint256) view returns (tuple(bytes32 debateHash,uint96 entryPrice,uint96 exitPrice,uint64 committedAt,uint64 resolvedAt,address recorder,uint8 agent,uint8 conviction,uint8 result,uint8 mode,int256 pnlBps,uint64 exitAt,uint64 challengeDeadline,bool stopChallenged,tuple(bytes32 feedId,int64 price,uint64 conf,int32 expo,uint64 publishTime) entryEvidence,tuple(bytes32 feedId,int64 price,uint64 conf,int32 expo,uint64 publishTime) exitEvidence,string symbol))',
];

export const PYTH_ABI = [
  'function getUpdateFee(bytes[] updateData) view returns (uint256)',
];

export const TRACK_RECORD_V1_READ_ABI = [
  'function totalTrades() view returns (uint256)',
  'function totalCommitments() view returns (uint256)',
  'function getWinRate() view returns (uint256)',
  'function wins() view returns (uint256)',
  'function losses() view returns (uint256)',
  'function totalPnlBps() view returns (int256)',
  'function pendingCount() view returns (uint256)',
];

export interface TrackRecordPublicStats {
  version: 'v1' | 'v2';
  totalTrades: string;
  totalCommitments: string;
  winRateBps: string;
  wins: string;
  losses: string;
  totalPnlBps: string;
  pending: string;
  resolutionBps: string;
  verified?: {
    decided: string;
    resolved: string;
    expired: string;
    pending: string;
  };
  attested?: {
    winRateBps: string;
    wins: string;
    losses: string;
    totalPnlBps: string;
    resolved: string;
    expired: string;
    pending: string;
  };
}

const DEBATE_HASH_DOMAIN = ethers.keccak256(ethers.toUtf8Bytes('BOBBY_TRACK_RECORD_V2'));
const QUOTE_SUFFIXES = ['-USDT-SWAP', '-USDC-SWAP', '-USD-SWAP', '-USDT', '-USDC', '-USD'];
const CANONICAL_SYMBOL = /^[A-Z0-9]{2,10}$/;

export interface HermesPriceUpdate {
  updateData: string;
  feedId: string;
  price: bigint;
  conf: bigint;
  expo: number;
  publishTime: number;
  priceE8: bigint;
}

interface HermesResponse {
  binary?: { encoding?: string; data?: unknown[] };
  parsed?: Array<{
    id?: string;
    price?: { price?: string; conf?: string; expo?: number; publish_time?: number };
  }>;
}

export function isTrackRecordV2(chainId: number): boolean {
  return chainId === 8453 || chainId === 84532;
}

export async function readTrackRecordPublicStats(
  call: (data: string) => Promise<string>,
  useV2: boolean,
): Promise<TrackRecordPublicStats> {
  const iface = new ethers.Interface(useV2 ? TRACK_RECORD_V2_ABI : TRACK_RECORD_V1_READ_ABI);
  const read = async (name: string, args: unknown[] = []) => {
    const raw = await call(iface.encodeFunctionData(name, args));
    return iface.decodeFunctionResult(name, raw);
  };

  if (!useV2) {
    const [trades, commitments, winRate, wins, losses, pnl, pending] = await Promise.all([
      read('totalTrades'),
      read('totalCommitments'),
      read('getWinRate'),
      read('wins'),
      read('losses'),
      read('totalPnlBps'),
      read('pendingCount'),
    ]);
    return {
      version: 'v1',
      totalTrades: trades[0].toString(),
      totalCommitments: commitments[0].toString(),
      winRateBps: winRate[0].toString(),
      wins: wins[0].toString(),
      losses: losses[0].toString(),
      totalPnlBps: pnl[0].toString(),
      pending: pending[0].toString(),
      resolutionBps: '10000',
    };
  }

  const [trades, commitments, scorecard, wins, losses, pnl, attestedWinRate, attestedWins,
    attestedLosses, attestedPnl, attestedCoverage] = await Promise.all([
    read('totalTrades'),
    read('totalCommitments'),
    read('getVerifiedScorecard'),
    read('winsVerified'),
    read('lossesVerified'),
    read('totalPnlBpsVerified'),
    read('getAttestedWinRate'),
    read('winsAttested'),
    read('lossesAttested'),
    read('totalPnlBpsAttested'),
    read('getCoverage', [PRICE_MODE.ATTESTED]),
  ]);
  return {
    version: 'v2',
    totalTrades: trades[0].toString(),
    totalCommitments: commitments[0].toString(),
    winRateBps: scorecard.winRateBps.toString(),
    wins: wins[0].toString(),
    losses: losses[0].toString(),
    totalPnlBps: pnl[0].toString(),
    pending: scorecard.pending.toString(),
    resolutionBps: scorecard.resolutionBps.toString(),
    verified: {
      decided: scorecard.decided.toString(),
      resolved: scorecard.resolved.toString(),
      expired: scorecard.expired.toString(),
      pending: scorecard.pending.toString(),
    },
    attested: {
      winRateBps: attestedWinRate[0].toString(),
      wins: attestedWins[0].toString(),
      losses: attestedLosses[0].toString(),
      totalPnlBps: attestedPnl[0].toString(),
      resolved: attestedCoverage.resolved.toString(),
      expired: attestedCoverage.expired.toString(),
      pending: attestedCoverage.pending.toString(),
    },
  };
}

export function canonicalizeTrackSymbol(input: string): string {
  let symbol = input.trim().toUpperCase();
  for (const suffix of QUOTE_SUFFIXES) {
    if (symbol.endsWith(suffix)) {
      symbol = symbol.slice(0, -suffix.length);
      break;
    }
  }
  if (!CANONICAL_SYMBOL.test(symbol)) {
    throw new Error('Symbol must canonicalize to 2-10 uppercase alphanumeric characters');
  }
  return symbol;
}

export function modeForSymbol(symbol: string): PriceMode {
  return Object.hasOwn(PYTH_FEEDS, symbol) ? PRICE_MODE.VERIFIED : PRICE_MODE.ATTESTED;
}

export function feedForSymbol(symbol: string): string | null {
  return (PYTH_FEEDS as Record<string, string>)[symbol] || null;
}

export function hermesUrlForPyth(chainId: number, activePyth: string): string {
  if (process.env.PYTH_HERMES_URL) return process.env.PYTH_HERMES_URL;
  const contracts = PYTH_CONTRACTS[chainId];
  if (!contracts || !ethers.isAddress(activePyth)) {
    throw new Error('Unsupported active Pyth configuration');
  }
  if (activePyth.toLowerCase() === contracts.upgraded.toLowerCase()) return DEFAULT_HERMES_URL;
  if (activePyth.toLowerCase() === contracts.current.toLowerCase()) return CURRENT_HERMES_URL;
  throw new Error('Active Pyth is outside the canonical set');
}

export function toV1DebateHash(threadId: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(threadId));
}

export function toV2DebateHash(threadId: string, symbol: string, mode: PriceMode): string {
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ['bytes32', 'bytes32', 'bytes32', 'uint8'],
    [
      DEBATE_HASH_DOMAIN,
      ethers.keccak256(ethers.toUtf8Bytes(threadId)),
      ethers.keccak256(ethers.toUtf8Bytes(symbol)),
      mode,
    ],
  ));
}

export function numberToE8(value: number): bigint {
  if (!Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER / 1e8) {
    throw new Error('Price is outside the supported positive range');
  }
  return BigInt(Math.round(value * 1e8));
}

export function pythPriceToE8(price: bigint, expo: number): bigint {
  if (price <= 0n || !Number.isInteger(expo) || expo < -18 || expo > 0) {
    throw new Error('Invalid Pyth price');
  }
  const shift = expo + 8;
  const priceE8 = shift >= 0
    ? price * (10n ** BigInt(shift))
    : price / (10n ** BigInt(-shift));
  if (priceE8 <= 0n) throw new Error('Pyth price underflows 1e8 precision');
  return priceE8;
}

export function pnlBpsFromOracle(isLong: boolean, entryE8: bigint, exitE8: bigint): bigint {
  if (entryE8 <= 0n || exitE8 <= 0n) throw new Error('Oracle prices must be positive');
  return isLong
    ? ((exitE8 - entryE8) * 10_000n) / entryE8
    : ((entryE8 - exitE8) * 10_000n) / entryE8;
}

export function resultFromPnlBps(pnlBps: bigint): 'win' | 'loss' | 'break_even' {
  return pnlBps > 0n ? 'win' : pnlBps < 0n ? 'loss' : 'break_even';
}

function normalizeFeedId(feedId: string): string {
  const normalized = feedId.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error('Invalid Pyth feed id');
  return `0x${normalized}`;
}

function hermesBaseUrl(requested?: string): string {
  const configured = (requested || process.env.PYTH_HERMES_URL || DEFAULT_HERMES_URL).replace(/\/$/, '');
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('PYTH_HERMES_URL must be an HTTPS URL without credentials');
  }
  return url.toString().replace(/\/$/, '');
}

export async function fetchHermesPriceUpdate(args: {
  feedId: string;
  kind: HermesKind;
  publishTime?: number;
  fetchImpl?: typeof fetch;
  requireApiKey?: boolean;
  hermesUrl?: string;
}): Promise<HermesPriceUpdate> {
  const apiKey = process.env.PYTH_HERMES_API_KEY || '';
  if ((args.requireApiKey ?? true) && !apiKey) {
    throw new Error('PYTH_HERMES_API_KEY is required for verified writes');
  }

  const expectedFeed = normalizeFeedId(args.feedId);
  const path = args.kind === 'latest'
    ? '/v2/updates/price/latest'
    : `/v2/updates/price/${Math.trunc(args.publishTime || 0)}`;
  if (args.kind === 'timestamp' && (!Number.isInteger(args.publishTime) || (args.publishTime || 0) <= 0)) {
    throw new Error('A positive publishTime is required for timestamp updates');
  }

  const url = new URL(`${hermesBaseUrl(args.hermesUrl)}${path}`);
  url.searchParams.append('ids[]', expectedFeed);
  url.searchParams.set('encoding', 'hex');
  url.searchParams.set('parsed', 'true');

  const fetchImpl = args.fetchImpl || fetch;
  const response = await fetchImpl(url, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Hermes request failed (${response.status})`);

  const body = await response.json() as HermesResponse;
  const updates = body.binary?.data;
  const parsed = body.parsed;
  if (body.binary?.encoding !== 'hex' || !Array.isArray(updates) || updates.length !== 1 ||
      !Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error('Hermes must return exactly one hex update and one parsed price');
  }

  const updateHex = updates[0];
  const row = parsed[0];
  if (typeof updateHex !== 'string' || !/^(?:0x)?[0-9a-fA-F]+$/.test(updateHex) || updateHex.replace(/^0x/, '').length % 2 !== 0) {
    throw new Error('Hermes returned malformed update data');
  }
  if (!row || normalizeFeedId(String(row.id || '')) !== expectedFeed || !row.price) {
    throw new Error('Hermes returned a different price feed');
  }

  const price = BigInt(row.price.price || '0');
  const conf = BigInt(row.price.conf || '0');
  const expo = Number(row.price.expo);
  const publishTime = Number(row.price.publish_time);
  if (conf < 0n || !Number.isInteger(expo) || !Number.isSafeInteger(publishTime) || publishTime <= 0) {
    throw new Error('Hermes returned invalid parsed price metadata');
  }

  return {
    updateData: `0x${updateHex.replace(/^0x/, '')}`,
    feedId: expectedFeed,
    price,
    conf,
    expo,
    publishTime,
    priceE8: pythPriceToE8(price, expo),
  };
}
