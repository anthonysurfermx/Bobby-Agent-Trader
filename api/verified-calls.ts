// Base Sepolia canary ledger. The bundled historical events were checked
// against successful receipts from the official Base Sepolia RPC. PublicNode
// prunes these old log ranges, so we reconcile the proof snapshot with live
// contract storage instead of scanning millions of blocks on each request.
import { Contract, Interface, JsonRpcProvider, formatUnits } from 'ethers';
import canarySnapshot from './_lib/verified-calls-canary.json' with { type: 'json' };
import { rpcErrorMessage } from './_lib/rpc-redact.js';

export const config = { maxDuration: 30 };

const CHAIN_ID = 84532;
const CONTRACT = process.env.VERIFIED_CALLS_ADDRESS || '0x4bfEF46d920fd67C68046901f591Fad0a2F7cadC';
const RPC = process.env.VERIFIED_CALLS_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';
const EXPLORER = 'https://sepolia.basescan.org';
const BLOCKSCOUT = 'https://base-sepolia.blockscout.com';
const RECEIPT_RPC = 'https://sepolia.base.org';
const MAX_COMMITMENT_TTL = 30 * 24 * 60 * 60;
const TTL_MS = 30_000;
const MAX_CALLS = 50; // this endpoint is the frozen canary, not a bulk indexer

const EVENTS = new Interface([
  'event TradeCommitted(uint256 indexed commitId, string symbol, uint8 indexed agent, uint8 conviction, uint256 entryPrice, bytes32 indexed debateHash, uint8 mode, bytes32 feedId, uint256 entryOraclePrice1e8, uint64 entryPublishTime, uint64 entryAt)',
  'event TradeResolved(uint256 indexed tradeId, string symbol, uint8 indexed agent, uint8 result, int256 pnlBps, uint8 conviction, bytes32 indexed debateHash, uint8 mode, uint64 exitAt, uint256 exitOraclePrice1e8, uint64 exitPublishTime)',
  'event TradeReclassified(uint256 indexed tradeId, bytes32 indexed debateHash, uint8 oldResult, uint8 newResult, int256 oldPnlBps, int256 newPnlBps, string reason)',
  'event StopBreachChallenged(bytes32 indexed debateHash, address indexed challenger, uint64 breachPublishTime, uint256 breachPrice1e8, bool wasResolved)',
  'event CommitmentExpired(uint256 indexed commitId, bytes32 indexed debateHash, string symbol)',
]);
const READS = [
  'function getVerifiedScorecard() view returns (uint256 winRateBps, uint256 decided, uint256 resolved, uint256 expired, uint256 pending, uint256 resolutionBps)',
  'function getAttestedWinRate() view returns (uint256)',
  'function totalCommitments() view returns (uint256)',
  'function totalTrades() view returns (uint256)',
  'function getCoverage(uint8 mode) view returns (uint256 resolved, uint256 expired, uint256 pending)',
  'function getCommitment(uint256) view returns (tuple(bytes32 debateHash, uint96 entryPrice, uint96 targetPrice, uint64 committedAt, uint96 stopPrice, address recorder, uint64 minResolveAt, uint8 agent, uint8 conviction, bool resolved, uint8 mode, uint16 entryWindowSec, uint16 exitWindowSec, uint24 maxExitLagSec, uint24 challengeWindowSec, uint16 entryTolBps, uint16 exitTolBps, uint16 confMaxBps, tuple(bytes32 feedId, int64 price, uint64 conf, int32 expo, uint64 publishTime) entryEvidence, string symbol))',
  'function getTrade(uint256) view returns (tuple(bytes32 debateHash, uint96 entryPrice, uint96 exitPrice, uint64 committedAt, uint64 resolvedAt, address recorder, uint8 agent, uint8 conviction, uint8 result, uint8 mode, int256 pnlBps, uint64 exitAt, uint64 challengeDeadline, bool stopChallenged, tuple(bytes32 feedId, int64 price, uint64 conf, int32 expo, uint64 publishTime) entryEvidence, tuple(bytes32 feedId, int64 price, uint64 conf, int32 expo, uint64 publishTime) exitEvidence, string symbol))',
];
const RESULTS = ['PENDING', 'WIN', 'LOSS', 'EXPIRED', 'BREAK_EVEN'];
const MODES = ['ATTESTED', 'VERIFIED'];

export interface LedgerLog {
  blockNumber: number;
  logIndex: number;
  transactionHash: string;
  topics: string[];
  data: string;
}
interface CallRow {
  debateHash: string; symbol: string; mode: string; conviction: number;
  committedAt: string | null; commitTx: string | null;
  entryOraclePrice: string | null; entryPublishTime: number | null;
  result: string; pnlBps: number | null; resolveTx: string | null;
  exitOraclePrice: string | null; exitPublishTime: number | null;
  reclassified: boolean; reclassifyReason: string | null;
  challengeTx: string | null; challenger: string | null;
  challengeDeadline: number | null; challengeable: boolean;
}
interface Score { winRateBps: number; resolved: number; expired: number; pending: number; decided?: number }
interface ChainState {
  total: number; totalTrades: number; commitments: any[]; trades: any[];
  verified: Score; attested: Score;
}

let cache: { at: number; body: unknown } | null = null;
function requireProof(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(`ledger integrity: ${reason}`);
}
function equal(a: string, b: string) { return a.toLowerCase() === b.toLowerCase(); }
async function within<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error('ledger read timed out')), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function readBounded<T>(count: number, read: (id: number) => Promise<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < count; start += 10) {
    rows.push(...await Promise.all(Array.from({ length: Math.min(10, count - start) }, (_, offset) => read(start + offset))));
  }
  return rows;
}
function oraclePrice(evidence: any): string {
  const price = BigInt(evidence.price);
  const shift = Number(evidence.expo) + 8;
  return formatUnits(shift >= 0 ? price * 10n ** BigInt(shift) : price / 10n ** BigInt(-shift), 8);
}

/** Replay event proofs and check every claim against current on-chain storage. */
export function assembleLedger(logs: LedgerLog[], state: ChainState, nowSec = Math.floor(Date.now() / 1000)): CallRow[] {
  const rows = new Map<string, CallRow>();
  const commitIds = new Set<number>();
  const tradeIds = new Set<number>();
  for (const log of [...logs].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)) {
    requireProof(Number.isInteger(log.blockNumber) && Number.isInteger(log.logIndex) && /^0x[0-9a-f]{64}$/i.test(log.transactionHash), 'invalid event location');
    const event = EVENTS.parseLog({ topics: log.topics, data: log.data });
    if (!event) continue;
    const args = event.args;
    const hash = String(args.debateHash).toLowerCase();
    if (event.name === 'TradeCommitted') {
      const id = Number(args.commitId);
      requireProof(!commitIds.has(id) && !rows.has(hash), 'duplicate commitment');
      requireProof(id >= 0 && id < state.total && equal(String(args.debateHash), String(state.commitments[id]?.debateHash || '')), 'commitment ID differs from chain');
      commitIds.add(id);
      rows.set(hash, {
        debateHash: args.debateHash, symbol: args.symbol,
        mode: MODES[Number(args.mode)] ?? String(args.mode), conviction: Number(args.conviction),
        committedAt: null, commitTx: log.transactionHash,
        entryOraclePrice: null, entryPublishTime: null, result: 'PENDING', pnlBps: null,
        resolveTx: null, exitOraclePrice: null, exitPublishTime: null,
        reclassified: false, reclassifyReason: null, challengeTx: null, challenger: null,
        challengeDeadline: null, challengeable: false,
      });
      continue;
    }
    const row = rows.get(hash);
    requireProof(row, `${event.name} without a commitment`);
    if (event.name === 'TradeResolved') {
      const id = Number(args.tradeId);
      requireProof(!tradeIds.has(id) && !row.resolveTx, 'duplicate resolution');
      requireProof(id >= 0 && id < state.totalTrades && equal(String(args.debateHash), String(state.trades[id]?.debateHash || '')), 'trade ID differs from chain');
      tradeIds.add(id);
      row.result = RESULTS[Number(args.result)] ?? String(args.result);
      row.pnlBps = Number(args.pnlBps);
      row.resolveTx = log.transactionHash;
    } else if (event.name === 'TradeReclassified') {
      row.result = RESULTS[Number(args.newResult)] ?? String(args.newResult);
      row.pnlBps = Number(args.newPnlBps);
      row.reclassified = true;
      row.reclassifyReason = args.reason;
    } else if (event.name === 'StopBreachChallenged') {
      requireProof(!row.challengeTx, 'duplicate challenge');
      row.challengeTx = log.transactionHash;
      row.challenger = args.challenger;
    } else if (event.name === 'CommitmentExpired') row.result = 'EXPIRED';
  }

  requireProof(rows.size === state.total && commitIds.size === state.total, 'commitment count differs from chain');
  requireProof(tradeIds.size === state.totalTrades, 'resolution count differs from chain');
  for (let id = 0; id < state.total; id++) requireProof(commitIds.has(id), `missing commitment ${id}`);
  for (let id = 0; id < state.totalTrades; id++) requireProof(tradeIds.has(id), `missing trade ${id}`);
  const trades = new Map(state.trades.map((trade) => [String(trade.debateHash).toLowerCase(), trade]));
  requireProof(trades.size === state.totalTrades, 'duplicate trade hash');

  const calls = state.commitments.map((commitment) => {
    const row = rows.get(String(commitment.debateHash).toLowerCase());
    requireProof(row, 'commitment hash differs from chain');
    requireProof(row.symbol === commitment.symbol && row.mode === MODES[Number(commitment.mode)]
      && row.conviction === Number(commitment.conviction), 'commitment fields differ from chain');
    const trade = trades.get(String(commitment.debateHash).toLowerCase());
    requireProof(Boolean(trade) === Boolean(commitment.resolved), 'resolution state differs from chain');
    row.committedAt = new Date(Number(commitment.committedAt) * 1000).toISOString();
    if (row.mode === 'VERIFIED') {
      row.entryOraclePrice = oraclePrice(commitment.entryEvidence);
      row.entryPublishTime = Number(commitment.entryEvidence.publishTime);
    }
    if (trade) {
      requireProof(Boolean(row.resolveTx) && row.result === RESULTS[Number(trade.result)]
        && row.pnlBps === Number(trade.pnlBps), 'trade fields differ from chain');
      requireProof(trade.symbol === row.symbol && Number(trade.mode) === Number(commitment.mode)
        && Number(trade.committedAt) === Number(commitment.committedAt), 'trade provenance differs from commitment');
      requireProof(Boolean(row.challengeTx) === Boolean(trade.stopChallenged), 'challenge state differs from chain');
      if (row.mode === 'VERIFIED' && row.result !== 'EXPIRED') {
        row.exitOraclePrice = oraclePrice(trade.exitEvidence);
        row.exitPublishTime = Number(trade.exitEvidence.publishTime);
      }
      const deadline = Number(trade.challengeDeadline);
      row.challengeDeadline = deadline > 0 ? deadline : null;
      row.challengeable = row.mode === 'VERIFIED' && !trade.stopChallenged
        && (row.result === 'WIN' || row.result === 'BREAK_EVEN') && deadline >= nowSec;
    } else {
      requireProof(!row.resolveTx && !row.challengeTx && row.result === 'PENDING', 'pending row has a terminal event');
      const deadline = Number(commitment.committedAt) + MAX_COMMITMENT_TTL;
      row.challengeDeadline = row.mode === 'VERIFIED' ? deadline : null;
      row.challengeable = row.mode === 'VERIFIED' && deadline >= nowSec;
    }
    return row;
  });

  for (const mode of MODES) {
    const subset = calls.filter((row) => row.mode === mode);
    const resolved = subset.filter((row) => row.result !== 'PENDING' && row.result !== 'EXPIRED').length;
    const expired = subset.filter((row) => row.result === 'EXPIRED').length;
    const pending = subset.filter((row) => row.result === 'PENDING').length;
    const decided = subset.filter((row) => row.result === 'WIN' || row.result === 'LOSS').length;
    const wins = subset.filter((row) => row.result === 'WIN').length;
    const score = mode === 'VERIFIED' ? state.verified : state.attested;
    requireProof(score.resolved === resolved && score.expired === expired && score.pending === pending, `${mode} coverage differs from chain`);
    requireProof(score.winRateBps === (decided ? Math.floor(wins * 10_000 / decided) : 0), `${mode} win rate differs from chain`);
    if (mode === 'VERIFIED') requireProof(score.decided === decided, 'verified decided count differs from chain');
  }
  return calls.sort((a, b) => (b.committedAt || '').localeCompare(a.committedAt || ''));
}

export async function readChain(): Promise<ChainState> {
  const provider = new JsonRpcProvider(RPC);
  requireProof(Number((await provider.getNetwork()).chainId) === CHAIN_ID, 'RPC is on the wrong chain');
  const reader = new Contract(CONTRACT, READS, provider);
  const [verified, attestedWr, count, tradeCount, attestedCoverage] = await Promise.all([
    reader.getVerifiedScorecard(), reader.getAttestedWinRate(), reader.totalCommitments(),
    reader.totalTrades(), reader.getCoverage(0),
  ]);
  const total = Number(count), totalTrades = Number(tradeCount);
  requireProof(total <= MAX_CALLS && totalTrades <= total, 'canary exceeds reader limit');
  const [commitments, trades] = await Promise.all([
    readBounded(total, (id) => reader.getCommitment(id)),
    readBounded(totalTrades, (id) => reader.getTrade(id)),
  ]);
  return {
    total, totalTrades, commitments, trades,
    verified: { winRateBps: Number(verified.winRateBps), decided: Number(verified.decided),
      resolved: Number(verified.resolved), expired: Number(verified.expired), pending: Number(verified.pending) },
    attested: { winRateBps: Number(attestedWr), resolved: Number(attestedCoverage.resolved),
      expired: Number(attestedCoverage.expired), pending: Number(attestedCoverage.pending) },
  };
}

export async function readIndexerLogs(): Promise<LedgerLog[]> {
  const url = new URL(`/api/v2/addresses/${CONTRACT}/logs`, BLOCKSCOUT);
  const logs: LedgerLog[] = [];
  const deadline = Date.now() + 11_000;
  for (let page = 0; page < 20; page++) {
    requireProof(Date.now() < deadline, 'indexer read timed out');
    const response = await fetch(url, { signal: AbortSignal.timeout(Math.max(1, Math.min(6_000, deadline - Date.now()))) });
    requireProof(response.ok, `indexer HTTP ${response.status}`);
    const data = await response.json() as { items?: any[]; next_page_params?: Record<string, string | number> | null };
    requireProof(Array.isArray(data.items), 'invalid indexer page');
    for (const item of data.items) {
      requireProof(equal(String(item.address?.hash || ''), CONTRACT) && Array.isArray(item.topics), 'wrong indexer contract');
      logs.push({ blockNumber: Number(item.block_number), logIndex: Number(item.index),
        transactionHash: String(item.transaction_hash), topics: item.topics.filter((topic: unknown) => typeof topic === 'string'),
        data: String(item.data) });
    }
    if (!data.next_page_params) return logs;
    url.search = new URLSearchParams(Object.entries(data.next_page_params).map(([key, value]) => [key, String(value)])).toString();
  }
  throw new Error('ledger integrity: indexer pagination limit');
}

export async function verifyReceipts(logs: LedgerLog[]): Promise<void> {
  const relevant = logs.filter((log) => EVENTS.parseLog({ topics: log.topics, data: log.data }));
  const hashes = [...new Set(relevant.map((log) => log.transactionHash.toLowerCase()))];
  const receipts = await Promise.all(hashes.map(async (hash) => {
    const response = await fetch(RECEIPT_RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [hash] }),
      signal: AbortSignal.timeout(7_000) });
    requireProof(response.ok, `receipt RPC HTTP ${response.status}`);
    const data = await response.json() as { result?: any; error?: unknown };
    requireProof(!data.error && data.result?.status === '0x1', 'missing successful receipt');
    return data.result;
  }));
  for (const log of relevant) {
    const receipt = receipts.find((item) => equal(item.transactionHash, log.transactionHash));
    const proof = receipt?.logs?.find((item: any) => Number.parseInt(item.logIndex, 16) === log.logIndex && equal(item.address, CONTRACT));
    requireProof(proof && Number.parseInt(proof.blockNumber, 16) === log.blockNumber
      && equal(proof.data, log.data) && proof.topics.length === log.topics.length
      && proof.topics.every((topic: string, index: number) => equal(topic, log.topics[index])),
    'indexer event differs from transaction receipt');
  }
}

export default async function handler(_req: any, res: any) {
  try {
    if (cache && Date.now() - cache.at < TTL_MS) {
      res.setHeader('Cache-Control', 'public, s-maxage=30');
      return res.status(200).json(cache.body);
    }
    const state = await within(readChain(), 8_000);
    let calls: CallRow[];
    try {
      requireProof(canarySnapshot.chainId === CHAIN_ID && equal(canarySnapshot.contract, CONTRACT), 'snapshot contract differs');
      calls = assembleLedger(canarySnapshot.logs, state);
    } catch {
      // If new writes alter the frozen canary, refresh proofs from the indexer.
      // Reject partial pages, invalid receipts or any storage mismatch.
      const logs = await readIndexerLogs();
      await verifyReceipts(logs);
      calls = assembleLedger(logs, state);
    }
    const body = { chain: { id: CHAIN_ID, name: 'Base Sepolia', canary: true }, contract: CONTRACT,
      explorer: EXPLORER,
      scorecard: { verified: state.verified, attested: state.attested, totalCommitments: state.total },
      calls, fetchedAt: new Date().toISOString() };
    cache = { at: Date.now(), body };
    res.setHeader('Cache-Control', 'public, s-maxage=30');
    return res.status(200).json(body);
  } catch (error) {
    console.error('[VerifiedCalls]', rpcErrorMessage(error));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'verified calls temporarily unavailable' });
  }
}
