import { assertWritesOpen } from './control.js';
// ============================================================
// trackrecord-v2-recorder — the chain-aware V2 writer/reader.
//
// Sits between the pure primitives (trackrecord-v2.ts) and the recorder
// endpoint. Everything here is V2-only: the endpoint calls this module when
// PROTOCOL_CHAIN selects Base/Base-Sepolia and keeps the v1 flow untouched for
// X Layer — so with PROTOCOL_CHAIN unset, none of this code runs in prod.
//
// Mode rules mirror the contract exactly (commitTrade/resolveTrade gates):
//   ATTESTED → declaredMode=0, empty updateData, msg.value MUST be 0.
//   VERIFIED → declaredMode=1, signed Pyth update, payable ≥ getUpdateFee
//              (contract refunds the excess, so we send a fixed small buffer).
// ============================================================

import { ethers } from 'ethers';
import type { ChainConfig } from './chains.js';
import { assertProviderChain } from './protocol-write-safety.js';
import {
  PriceMode,
  resolvePriceMode,
  buildHermesBenchmarkUrl,
  fetchSignedUpdate,
  toE8,
  TRACKRECORD_V2_ABI,
  PYTH_FEE_BUFFER_WEI,
  MIN_ENTRY_DELAY_SEC,
} from './trackrecord-v2.js';

const V2_IFACE = new ethers.Interface(TRACKRECORD_V2_ABI as unknown as string[]);

// Pre-flight tolerance bands. SAME env names as DeployBase._v2Params() so the
// backend's fail-fast check can never drift from what the contract enforces —
// change the env once and both sides move together.
const ENTRY_TOL_BPS = Number(process.env.V2_ENTRY_TOL_BPS || 100);
const EXIT_TOL_BPS = Number(process.env.V2_EXIT_TOL_BPS || 100);
// Same env name as DeployBase._v2Params — bounds the Hermes retry loop to the
// on-chain landing window.
const ENTRY_WINDOW_SEC = Number(process.env.V2_ENTRY_WINDOW_SEC || 60);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A5-1: fetch the anchor's first tick, retrying while Hermes has not yet
 *  served it (benchmarks can lag the instant by more than a second). Auth
 *  failures (401/403) fail fast — retrying cannot fix a missing key. The
 *  loop is bounded by a wall-clock deadline. */
async function fetchBenchmarkWithRetry(feedId: string, atSec: number, deadlineMs: number) {
  for (;;) {
    try {
      return await fetchSignedUpdate(buildHermesBenchmarkUrl(feedId, atSec));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/Hermes 40[13]/.test(msg)) throw err; // auth — retrying is pointless
      if (Date.now() >= deadlineMs) {
        throw new Error(`Hermes evidence for t=${atSec} unavailable before the entry window closed: ${msg}`);
      }
      await sleep(1000);
    }
  }
}

/** A5-1: the contract decides EntryInFuture with block.timestamp, not our
 *  clock. After a capped wall-clock sleep, wait until the RPC confirms that a
 *  mined block reached the anchor. A local-clock prediction is not sufficient:
 *  estimateGas executes against the latest block and would still revert while
 *  that block's timestamp is below entryAt. Bounded — never hangs. */
async function waitForAnchor(
  provider: ethers.Provider,
  entryAt: number,
  deadlineMs: number,
): Promise<void> {
  const wallWait = Math.min(
    Math.max((entryAt + 1) * 1000 - Date.now(), 0),
    (MIN_ENTRY_DELAY_SEC + 5) * 1000,
  );
  if (wallWait > 0) await sleep(wallWait);
  for (;;) {
    const latest = await provider.getBlock('latest');
    const chainTs = Number(latest!.timestamp);
    if (chainTs >= entryAt) return;
    if (Date.now() >= deadlineMs) {
      throw new Error(`chain clock (${chainTs}) never reached the entry anchor (${entryAt}) before the window closed`);
    }
    await sleep(1000);
  }
}

/** Reported price (float, quote units) → contract's uint96 1e8 fixed point. */
export function priceToE8(price: number): bigint {
  return BigInt(Math.round(price * 1e8));
}

/**
 * Pre-flight banding check: the contract rejects a reported entry/exit too far
 * from the oracle tick (entryToleranceBps/exitToleranceBps, 100 bps default).
 * Catch it here so a doomed tx never spends gas. Returns deviation in bps.
 */
export function deviationBps(reportedE8: bigint, oracleE8: bigint): number {
  if (oracleE8 <= 0n) return Number.MAX_SAFE_INTEGER;
  const diff = reportedE8 > oracleE8 ? reportedE8 - oracleE8 : oracleE8 - reportedE8;
  return Number((diff * 10_000n) / oracleE8);
}

export interface V2CommitParams {
  debateHash: string;
  symbol: string;            // canonical (resolvePriceMode output)
  agent: number;
  conviction: number;        // already uint8-normalized
  entryPrice: number;        // reported, quote units
  targetPrice: number;
  stopPrice: number;
}

export interface V2TxResult {
  txHash: string;
  mode: 'VERIFIED' | 'ATTESTED';
  /** Oracle tick used as evidence (VERIFIED only), 1e8 scale. */
  oraclePriceE8?: string;
  oraclePublishTime?: number;
  /** Nonce this tx consumed — follow-up txs from the same wallet should start
   *  at nonce+1 instead of re-reading 'pending' (the RPC may not have seen
   *  this tx yet, which silently dropped a side-effect on canary-002). */
  nonce: number;
}

async function recorderWallet(chain: ChainConfig, recorderKey: string): Promise<ethers.Wallet> {
  const provider = new ethers.JsonRpcProvider(chain.rpcUrl, chain.id, { staticNetwork: true });
  // Refuse to sign against an RPC answering for the wrong chain — same guard
  // the v1 paths carry (Codex 282b534).
  await assertProviderChain(provider, chain.id);
  return new ethers.Wallet(recorderKey, provider);
}

/**
 * Commit a prediction on V2. Resolves the mode from the symbol — the same
 * mapping the contract enforces on-chain (feedOf), so a mismatch reverts
 * ModeMismatch rather than silently landing in the wrong ledger.
 */
export async function commitV2(
  chain: ChainConfig,
  recorderKey: string,
  p: V2CommitParams,
): Promise<V2TxResult> {
  await assertWritesOpen('on-chain commitV2');
  const { mode, feedId } = resolvePriceMode(p.symbol);
  const wallet = await recorderWallet(chain, recorderKey);
  const contract = chain.contracts.trackRecord;
  if (!contract) throw new Error(`trackRecord address empty for ${chain.name}`);

  let updateData: string[] = [];
  let value = 0n;
  let oraclePriceE8: bigint | undefined;
  let oraclePublishTime: number | undefined;

  // A3-1/A4-1: two-step commit with a DERIVED FUTURE anchor. The announcement
  // fixes announcedAt on-chain; the anchor is announcedAt + MIN_ENTRY_DELAY_SEC
  // — strictly in the announce block's future, so its tick cannot exist (let
  // alone be known) when the anchor is fixed. The recorder then WAITS for the
  // anchor instant, fetches its first tick from Hermes, and commits within
  // entryWindowSec.
  let entryAt = 0;
  let announceNonce: number | undefined;
  if (mode === PriceMode.VERIFIED) {
    const annData = V2_IFACE.encodeFunctionData('announceCommit', [p.debateHash]);
    const [annGas, nonce0] = await Promise.all([
      wallet.estimateGas({ to: contract, data: annData }),
      wallet.provider!.getTransactionCount(wallet.address, 'pending'),
    ]);
    announceNonce = nonce0;
    const annTx = await wallet.sendTransaction({
      to: contract, data: annData, gasLimit: (annGas * 13n) / 10n, nonce: nonce0,
    });
    const annReceipt = await annTx.wait();
    if (!annReceipt) throw new Error(`announce transaction ${annTx.hash} was not mined`);
    // Some public RPCs briefly return null for a block immediately after they
    // return its receipt. The receipt is authoritative that the announce
    // landed; retry the block lookup instead of dereferencing null and leaving
    // a valid on-chain announcement stranded.
    let annBlock: ethers.Block | null = null;
    for (let attempt = 0; attempt < 10 && !annBlock; attempt++) {
      annBlock = await wallet.provider!.getBlock(annReceipt.blockNumber);
      if (!annBlock) await sleep(500);
    }
    if (!annBlock) {
      throw new Error(`announce transaction ${annTx.hash} mined, but block ${annReceipt.blockNumber} was unavailable after retries`);
    }
    entryAt = Number(annBlock.timestamp) + MIN_ENTRY_DELAY_SEC; // derived anchor
  }

  if (mode === PriceMode.VERIFIED && feedId) {
    // A5-1: everything below is bounded by one wall-clock deadline sized to
    // the landing window (minus margin to actually land the tx).
    const deadlineMs = Date.now() + (MIN_ENTRY_DELAY_SEC + ENTRY_WINDOW_SEC - 5) * 1000;
    await waitForAnchor(wallet.provider!, entryAt, deadlineMs);
    const update = await fetchBenchmarkWithRetry(feedId, entryAt, deadlineMs);
    updateData = [update.updateData];
    value = PYTH_FEE_BUFFER_WEI;
    oraclePriceE8 = toE8(update.price, update.expo);
    oraclePublishTime = update.publishTime;

    // Fail fast if the reported entry is outside the contract's tolerance band
    // — the tx would revert EntryOutOfBand on-chain.
    const dev = deviationBps(priceToE8(p.entryPrice), oraclePriceE8);
    if (dev > ENTRY_TOL_BPS) {
      throw new Error(
        `entry deviates ${dev} bps from oracle (${ethers.formatUnits(oraclePriceE8, 8)}) — exceeds tolerance`,
      );
    }
  }

  const data = V2_IFACE.encodeFunctionData('commitTrade', [
    p.debateHash,
    p.symbol,
    p.agent,
    p.conviction,
    priceToE8(p.entryPrice),
    priceToE8(p.targetPrice),
    priceToE8(p.stopPrice),
    mode,
    entryAt,
    updateData,
  ]);

  const gas = await wallet.estimateGas({ to: contract, data, value });
  // Chain from the announce nonce when one was consumed — re-reading
  // 'pending' right after a broadcast races the RPC (canary-002).
  const nonce = announceNonce !== undefined
    ? announceNonce + 1
    : await wallet.provider!.getTransactionCount(wallet.address, 'pending');
  const tx = await wallet.sendTransaction({
    to: contract,
    data,
    value,
    gasLimit: (gas * 13n) / 10n,
    nonce,
  });
  // A5-1: confirm inclusion before reporting success — a tx stuck in the
  // mempool (or reverted at inclusion) must never read as a recorded entry.
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error(`tx ${tx.hash} reverted on-chain`);

  return {
    txHash: tx.hash,
    mode: mode === PriceMode.VERIFIED ? 'VERIFIED' : 'ATTESTED',
    oraclePriceE8: oraclePriceE8?.toString(),
    oraclePublishTime,
    nonce,
  };
}

export interface V2ResolveParams {
  debateHash: string;
  symbol: string;            // canonical — decides the evidence path
  pnlBps: number;            // already integer bps
  result: number;            // contract Result enum
  exitPrice: number;         // reported, quote units
  /** Unix seconds of the declared exit. VERIFIED resolves fetch the Hermes
   *  benchmark update AT this instant, so it must be in the past and within
   *  the contract's maxExitLag of now. */
  exitAt: number;
}

export async function resolveV2(
  chain: ChainConfig,
  recorderKey: string,
  p: V2ResolveParams,
): Promise<V2TxResult> {
  await assertWritesOpen('on-chain resolveV2');
  const { mode, feedId } = resolvePriceMode(p.symbol);
  const wallet = await recorderWallet(chain, recorderKey);
  const contract = chain.contracts.trackRecord;
  if (!contract) throw new Error(`trackRecord address empty for ${chain.name}`);

  let updateData: string[] = [];
  let value = 0n;
  let oraclePriceE8: bigint | undefined;
  let oraclePublishTime: number | undefined;

  if (mode === PriceMode.VERIFIED && feedId) {
    // Benchmark update at the DECLARED exit instant — the contract checks the
    // update's publishTime against _exitAt, so latest-price would revert.
    const update = await fetchSignedUpdate(buildHermesBenchmarkUrl(feedId, p.exitAt));
    updateData = [update.updateData];
    value = PYTH_FEE_BUFFER_WEI;
    oraclePriceE8 = toE8(update.price, update.expo);
    oraclePublishTime = update.publishTime;

    const dev = deviationBps(priceToE8(p.exitPrice), oraclePriceE8);
    if (dev > EXIT_TOL_BPS) {
      throw new Error(
        `exit deviates ${dev} bps from oracle (${ethers.formatUnits(oraclePriceE8, 8)}) — exceeds tolerance`,
      );
    }
  }

  const data = V2_IFACE.encodeFunctionData('resolveTrade', [
    p.debateHash,
    p.pnlBps,
    p.result,
    priceToE8(p.exitPrice),
    BigInt(Math.floor(p.exitAt)),
    updateData,
  ]);

  const [gas, nonce] = await Promise.all([
    wallet.estimateGas({ to: contract, data, value }),
    wallet.provider!.getTransactionCount(wallet.address, 'pending'),
  ]);
  const tx = await wallet.sendTransaction({
    to: contract,
    data,
    value,
    gasLimit: (gas * 13n) / 10n,
    nonce,
  });
  // A5-1: confirm inclusion before reporting success — a tx stuck in the
  // mempool (or reverted at inclusion) must never read as a recorded entry.
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error(`tx ${tx.hash} reverted on-chain`);

  return {
    txHash: tx.hash,
    mode: mode === PriceMode.VERIFIED ? 'VERIFIED' : 'ATTESTED',
    oraclePriceE8: oraclePriceE8?.toString(),
    oraclePublishTime,
    nonce,
  };
}

export interface V2Stats {
  verifiedWinRate: number;      // percent, 2dp
  attestedWinRate: number;      // percent, 2dp
  totalTrades: number;
  totalCommitments: number;
  verified: {
    winRateBps: number;
    decided: number;
    resolved: number;
    expired: number;
    pending: number;
    resolutionBps: number;
  };
}

/**
 * Read the V2 scorecard. There is deliberately NO combined win rate — D-1
 * keeps VERIFIED and ATTESTED ledgers separate, and so does this reader.
 */
export async function readStatsV2(chain: ChainConfig): Promise<V2Stats> {
  const provider = new ethers.JsonRpcProvider(chain.rpcUrl, chain.id, { staticNetwork: true });
  const contract = chain.contracts.trackRecord;
  if (!contract) throw new Error(`trackRecord address empty for ${chain.name}`);

  const call = async (fn: string): Promise<ethers.Result> => {
    const raw = await provider.call({ to: contract, data: V2_IFACE.encodeFunctionData(fn) });
    return V2_IFACE.decodeFunctionResult(fn, raw);
  };

  const [verifiedWr, attestedWr, total, commits, scorecard] = await Promise.all([
    call('getVerifiedWinRate'),
    call('getAttestedWinRate'),
    call('totalTrades'),
    call('totalCommitments'),
    call('getVerifiedScorecard'),
  ]);

  return {
    verifiedWinRate: Number(verifiedWr[0]) / 100,
    attestedWinRate: Number(attestedWr[0]) / 100,
    totalTrades: Number(total[0]),
    totalCommitments: Number(commits[0]),
    verified: {
      winRateBps: Number(scorecard[0]),
      decided: Number(scorecard[1]),
      resolved: Number(scorecard[2]),
      expired: Number(scorecard[3]),
      pending: Number(scorecard[4]),
      resolutionBps: Number(scorecard[5]),
    },
  };
}
