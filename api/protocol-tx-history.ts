import type { VercelRequest, VercelResponse } from '@vercel/node';
import { formatEther } from 'ethers';
import {
  BOBBY_ADVERSARIAL_BOUNTIES,
  BOBBY_AGENT_ECONOMY,
  BOBBY_AGENT_REGISTRY,
  BOBBY_CONVICTION_ORACLE,
  BOBBY_HARDNESS_REGISTRY,
  BOBBY_TRACK_RECORD,
  BOBBY_TREASURY,
  XLAYER_RPC_FALLBACK_URL,
  XLAYER_RPC_URL,
} from './_lib/protocol-constants.js';

export const config = { maxDuration: 25 };

const XLAYER_RPC = XLAYER_RPC_FALLBACK_URL;
const XLAYER_RPC_FALLBACK = XLAYER_RPC_URL;

const AGENT_ECONOMY = BOBBY_AGENT_ECONOMY;
const BOUNTIES = BOBBY_ADVERSARIAL_BOUNTIES;
const TRACK_RECORD = BOBBY_TRACK_RECORD;
const HARDNESS_REGISTRY = BOBBY_HARDNESS_REGISTRY;
const CONVICTION_ORACLE = BOBBY_CONVICTION_ORACLE;
const AGENT_REGISTRY = BOBBY_AGENT_REGISTRY;
const TREASURY = BOBBY_TREASURY;

// Earliest known Bobby protocol deployment block on X Layer from forge broadcasts.
const PROTOCOL_ACTIVITY_START_BLOCK = 0x34775f3;

const CONTRACT_NAMES: Record<string, string> = {
  [AGENT_ECONOMY.toLowerCase()]: 'AgentEconomy',
  [BOUNTIES.toLowerCase()]: 'AdversarialBounties',
  [TRACK_RECORD.toLowerCase()]: 'TrackRecord',
  [HARDNESS_REGISTRY.toLowerCase()]: 'HardnessRegistry',
  [CONVICTION_ORACLE.toLowerCase()]: 'ConvictionOracle',
  [AGENT_REGISTRY.toLowerCase()]: 'AgentRegistry',
};

const METHOD_LABELS: Record<string, Record<string, string>> = {
  [HARDNESS_REGISTRY.toLowerCase()]: {
    '788e': 'publishSignal',
    '0cdc': 'publishSignal',
    '2672': 'commitPrediction',
    '2d2a': 'registerAgent',
    '7f19': 'registerService',
  },
  [BOUNTIES.toLowerCase()]: {
    '02ed': 'postBounty',
    '1cd3': 'submitChallenge',
  },
  [TRACK_RECORD.toLowerCase()]: {
    'f8dd': 'commitTrade',
    '7fc0': 'resolveTrade',
  },
  [AGENT_ECONOMY.toLowerCase()]: {
    '45d2': 'payDebateFee',
    'a784': 'payMCPCall',
  },
  [CONVICTION_ORACLE.toLowerCase()]: {
    '5e39': 'publishSignal',
  },
};

interface RpcBlockTx {
  hash: string;
  from?: string;
  to?: string;
  input?: string;
  value?: string;
}

interface RpcBlock {
  number?: string;
  timestamp?: string;
  transactions?: RpcBlockTx[];
}

interface OnChainTx {
  hash: string;
  contract: string;
  contractName: string;
  method: string;
  blockNumber: number;
  timestamp: number | null;
  valueOkb: string;
}

let txHistoryCache = new Map<
  string,
  {
    payload: Record<string, unknown>;
    storedAt: number;
  }
>();

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const urls = [XLAYER_RPC, XLAYER_RPC_FALLBACK];
  let lastError: Error | null = null;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
      });

      if (!res.ok) {
        throw new Error(`RPC ${res.status} from ${url}`);
      }

      const json = await res.json() as { result?: unknown; error?: { message?: string } };
      if (json.error) {
        throw new Error(json.error.message || `RPC error from ${url}`);
      }
      if (json.result == null) {
        throw new Error(`RPC returned no result from ${url}`);
      }

      return json.result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error('RPC call failed');
}

async function fetchBlockBatch(calls: unknown[]): Promise<Array<{ result?: RpcBlock }>> {
  const urls = [XLAYER_RPC, XLAYER_RPC_FALLBACK];
  let lastError: Error | null = null;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(calls),
      });

      if (!res.ok) {
        throw new Error(`Block batch RPC ${res.status} from ${url}`);
      }

      const json = await res.json() as unknown;
      if (!Array.isArray(json)) {
        throw new Error(`Block batch RPC returned non-array payload from ${url}`);
      }

      return json as Array<{ result?: RpcBlock }>;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error('Block batch RPC failed');
}

function identifyMethod(to: string, input: string): string {
  const methods = METHOD_LABELS[to.toLowerCase()] || {};
  const selector = (input || '0x').slice(2, 6).toLowerCase();
  for (const [prefix, label] of Object.entries(methods)) {
    if (selector.startsWith(prefix)) return label;
  }
  return 'interact';
}

// X Layer RPC caps eth_getLogs at 100 blocks per call. We scan a window of
// recent blocks in parallel chunks of 100, then batch-fetch the unique txs
// the logs refer to. This is O(events) — not O(blocks) like the old
// block-by-block scanner, which was timing out past ~2M blocks of gap.
const LOGS_CHUNK_SIZE = 100;
const MAX_PARALLEL_CHUNKS = 40;      // 40 × 100 = 4000 blocks ≈ 3.3h of X Layer
const CONTRACT_ADDRESSES = Object.keys(CONTRACT_NAMES); // lowercase

async function fetchHistoricalTxPage(
  startBlock: number,
  limit: number,
): Promise<{ items: OnChainTx[]; nextCursor: number | null; done: boolean }> {
  // Scan window: [windowFrom, startBlock], clamped to the protocol genesis.
  const windowFrom = Math.max(
    PROTOCOL_ACTIVITY_START_BLOCK,
    startBlock - LOGS_CHUNK_SIZE * MAX_PARALLEL_CHUNKS + 1,
  );

  // Build 100-block chunks, newest first.
  const chunks: Array<{ from: number; to: number }> = [];
  for (let to = startBlock; to >= windowFrom; to -= LOGS_CHUNK_SIZE) {
    chunks.push({ from: Math.max(windowFrom, to - LOGS_CHUNK_SIZE + 1), to });
  }

  // Parallel getLogs over chunks. Each returns the logs emitted by any of
  // the 6 Bobby contracts in that 100-block slice.
  const logResults = await Promise.allSettled(
    chunks.map(({ from, to }) =>
      rpcCall('eth_getLogs', [
        {
          fromBlock: `0x${from.toString(16)}`,
          toBlock: `0x${to.toString(16)}`,
          address: CONTRACT_ADDRESSES,
        },
      ]),
    ),
  );

  // If every chunk failed, surface the first error — something is wrong.
  if (logResults.every((r) => r.status === 'rejected')) {
    throw new Error('Unable to load logs from X Layer RPC');
  }

  // Dedupe tx hashes across all logs (one tx often emits multiple logs).
  const uniqueTxHashes = new Set<string>();
  for (const r of logResults) {
    if (r.status !== 'fulfilled' || !Array.isArray(r.value)) continue;
    for (const log of r.value as Array<{ transactionHash?: string }>) {
      if (log?.transactionHash) uniqueTxHashes.add(log.transactionHash);
    }
  }

  if (uniqueTxHashes.size === 0) {
    return {
      items: [],
      nextCursor: windowFrom > PROTOCOL_ACTIVITY_START_BLOCK ? windowFrom - 1 : null,
      done: windowFrom <= PROTOCOL_ACTIVITY_START_BLOCK,
    };
  }

  // Batch-fetch the unique transactions. 20 per RPC batch is a conservative
  // fit for X Layer; we issue multiple batches in parallel if needed.
  const TX_BATCH_SIZE = 20;
  const hashes = Array.from(uniqueTxHashes);
  const txBatches: unknown[][] = [];
  for (let i = 0; i < hashes.length; i += TX_BATCH_SIZE) {
    txBatches.push(
      hashes.slice(i, i + TX_BATCH_SIZE).map((hash, idx) => ({
        jsonrpc: '2.0',
        method: 'eth_getTransactionByHash',
        params: [hash],
        id: idx + 1,
      })),
    );
  }
  const txResults = await Promise.allSettled(txBatches.map((b) => fetchBlockBatch(b)));
  const txs: Array<RpcBlockTx & { blockNumber?: string }> = [];
  for (const r of txResults) {
    if (r.status !== 'fulfilled') continue;
    for (const entry of r.value) {
      const tx = (entry as { result?: RpcBlockTx & { blockNumber?: string } }).result;
      if (tx) txs.push(tx);
    }
  }

  // Filter: only Treasury-originated interactions with known contracts.
  const relevant = txs.filter((tx) => {
    if (String(tx.from || '').toLowerCase() !== TREASURY.toLowerCase()) return false;
    return Boolean(CONTRACT_NAMES[String(tx.to || '').toLowerCase()]);
  });

  // Batch-fetch block timestamps for the unique blocks we actually need.
  const blockNumbers = Array.from(
    new Set(relevant.map((t) => t.blockNumber).filter(Boolean) as string[]),
  );
  const blockTsMap = new Map<string, number>();
  if (blockNumbers.length > 0) {
    const calls = blockNumbers.map((bn, i) => ({
      jsonrpc: '2.0',
      method: 'eth_getBlockByNumber',
      params: [bn, false],
      id: i + 1,
    }));
    try {
      const blockRes = await fetchBlockBatch(calls);
      for (const entry of blockRes) {
        const block = (entry as { result?: RpcBlock }).result;
        if (block?.number && block?.timestamp) {
          blockTsMap.set(block.number, parseInt(String(block.timestamp), 16));
        }
      }
    } catch {
      // Non-fatal — timestamps become null for affected items.
    }
  }

  const items: OnChainTx[] = relevant.map((tx) => {
    const txTo = String(tx.to || '').toLowerCase();
    const blockNumHex = tx.blockNumber ?? '';
    return {
      hash: tx.hash,
      contract: txTo,
      contractName: CONTRACT_NAMES[txTo],
      method: identifyMethod(txTo, tx.input || '0x'),
      blockNumber: blockNumHex ? parseInt(blockNumHex, 16) : 0,
      timestamp: blockTsMap.get(blockNumHex) ?? null,
      valueOkb: formatEther(BigInt(tx.value || '0x0')),
    };
  });

  items.sort((a, b) => {
    if (b.blockNumber !== a.blockNumber) return b.blockNumber - a.blockNumber;
    return (b.timestamp ?? 0) - (a.timestamp ?? 0);
  });

  return {
    items: items.slice(0, limit),
    nextCursor: windowFrom > PROTOCOL_ACTIVITY_START_BLOCK ? windowFrom - 1 : null,
    done: windowFrom <= PROTOCOL_ACTIVITY_START_BLOCK,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const latestBlockHex = await rpcCall('eth_blockNumber', []);
    const latestBlock = parseInt(String(latestBlockHex), 16);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);

    const rawCursor = req.query.cursor;
    const parsedCursor = typeof rawCursor === 'string' ? Number(rawCursor) : latestBlock;
    const cursor = Number.isFinite(parsedCursor) ? Math.min(parsedCursor, latestBlock) : latestBlock;
    const cacheKey = `${cursor}:${limit}`;

    const page = await fetchHistoricalTxPage(cursor, limit);
    const payload = {
      ok: true,
      cached: false,
      degraded: false,
      latestBlock,
      startBlock: PROTOCOL_ACTIVITY_START_BLOCK,
      cursor,
      count: page.items.length,
      done: page.done,
      nextCursor: page.nextCursor,
      items: page.items,
    };

    txHistoryCache.set(cacheKey, {
      payload,
      storedAt: Date.now(),
    });

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ProtocolTxHistory]', message);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const rawCursor = req.query.cursor;
    const parsedCursor = typeof rawCursor === 'string' ? Number(rawCursor) : null;
    const cacheKey = `${parsedCursor ?? 'latest'}:${limit}`;
    const cached = txHistoryCache.get(cacheKey);

    if (cached) {
      res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=120');
      return res.status(200).json({
        ...cached.payload,
        cached: true,
        degraded: true,
        error: message,
      });
    }

    return res.status(200).json({
      ok: false,
      cached: false,
      degraded: true,
      error: message,
      latestBlock: 0,
      startBlock: PROTOCOL_ACTIVITY_START_BLOCK,
      cursor: parsedCursor ?? 0,
      count: 0,
      done: false,
      nextCursor: null,
      items: [],
    });
  }
}
