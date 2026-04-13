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

async function fetchHistoricalTxPage(
  startBlock: number,
  limit: number,
): Promise<{ items: OnChainTx[]; nextCursor: number | null; done: boolean }> {
  const items: OnChainTx[] = [];
  let cursor = startBlock;
  const batchSize = 5;
  const parallelBatches = 3;

  while (cursor >= PROTOCOL_ACTIVITY_START_BLOCK && items.length < limit) {
    const requests: Promise<void>[] = [];
    let blocksQueued = 0;

    for (let batchIndex = 0; batchIndex < parallelBatches; batchIndex++) {
      const batchCalls = [];

      for (let offset = 0; offset < batchSize; offset++) {
        const blockNumber = cursor - (batchIndex * batchSize + offset);
        if (blockNumber < PROTOCOL_ACTIVITY_START_BLOCK) break;

        batchCalls.push({
          jsonrpc: '2.0',
          method: 'eth_getBlockByNumber',
          params: [`0x${blockNumber.toString(16)}`, true],
          id: offset + 1,
        });
      }

      if (batchCalls.length === 0) break;
      blocksQueued += batchCalls.length;

      requests.push(
        fetchBlockBatch(batchCalls)
          .then(async (data) => {
            for (const blockResult of data) {
              const block = blockResult?.result;
              if (!block?.transactions?.length) continue;

              const blockTs = block.timestamp ? parseInt(String(block.timestamp), 16) : null;
              const blockNum = block.number ? parseInt(String(block.number), 16) : 0;

              for (const tx of block.transactions) {
                if (String(tx.from || '').toLowerCase() !== TREASURY.toLowerCase()) continue;

                const txTo = String(tx.to || '').toLowerCase();
                if (!CONTRACT_NAMES[txTo]) continue;

                items.push({
                  hash: tx.hash,
                  contract: txTo,
                  contractName: CONTRACT_NAMES[txTo],
                  method: identifyMethod(txTo, tx.input || '0x'),
                  blockNumber: blockNum,
                  timestamp: blockTs,
                  valueOkb: formatEther(BigInt(tx.value || '0x0')),
                });
              }
            }
          })
      );
    }

    if (blocksQueued === 0) break;

    const settled = await Promise.allSettled(requests);
    if (settled.every((result) => result.status === 'rejected')) {
      throw new Error('Unable to load block history from X Layer RPC');
    }

    cursor -= blocksQueued;
  }

  items.sort((a, b) => {
    if (b.blockNumber !== a.blockNumber) return b.blockNumber - a.blockNumber;
    return (b.timestamp ?? 0) - (a.timestamp ?? 0);
  });

  return {
    items: items.slice(0, limit),
    nextCursor: cursor >= PROTOCOL_ACTIVITY_START_BLOCK ? cursor : null,
    done: cursor < PROTOCOL_ACTIVITY_START_BLOCK,
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
