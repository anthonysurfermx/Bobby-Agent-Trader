// GET /api/protocol-heartbeat
// Real-time protocol health: last tx, active debate, bounty status, revenue, system health
// Includes live on-chain transaction feed from all Bobby contracts
// Designed for the Protocol Heartbeat dashboard page

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Interface, formatEther } from 'ethers';
import {
  BOBBY_ADVERSARIAL_BOUNTIES,
  BOBBY_AGENT_ECONOMY,
  BOBBY_AGENT_REGISTRY,
  BOBBY_CONVICTION_ORACLE,
  BOBBY_HARDNESS_REGISTRY,
  BOBBY_TRACK_RECORD,
  BOBBY_TREASURY,
  XLAYER_CHAIN_ID,
  XLAYER_RPC_FALLBACK_URL,
  XLAYER_RPC_URL,
} from './_lib/protocol-constants.js';

export const config = { maxDuration: 25 };

const XLAYER_RPC = XLAYER_RPC_FALLBACK_URL;
const XLAYER_RPC_FALLBACK = XLAYER_RPC_URL;
const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const AGENT_ECONOMY = BOBBY_AGENT_ECONOMY;
const BOUNTIES = BOBBY_ADVERSARIAL_BOUNTIES;
const TRACK_RECORD = BOBBY_TRACK_RECORD;
const HARDNESS_REGISTRY = BOBBY_HARDNESS_REGISTRY;
const CONVICTION_ORACLE = BOBBY_CONVICTION_ORACLE;
const AGENT_REGISTRY = BOBBY_AGENT_REGISTRY;
const TREASURY = BOBBY_TREASURY;

let heartbeatCache:
  | {
      payload: Record<string, unknown>;
      storedAt: number;
    }
  | null = null;

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout(url: string, body: unknown, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`RPC ${res.status} from ${url}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Contract name map for tx feed
const CONTRACT_NAMES: Record<string, string> = {
  [AGENT_ECONOMY.toLowerCase()]: 'AgentEconomy',
  [BOUNTIES.toLowerCase()]: 'AdversarialBounties',
  [TRACK_RECORD.toLowerCase()]: 'TrackRecord',
  [HARDNESS_REGISTRY.toLowerCase()]: 'HardnessRegistry',
  [CONVICTION_ORACLE.toLowerCase()]: 'ConvictionOracle',
  [AGENT_REGISTRY.toLowerCase()]: 'AgentRegistry',
};

// Method selectors for labeling txs (computed from contract ABIs via ethers)
const METHOD_LABELS: Record<string, Record<string, string>> = {
  [HARDNESS_REGISTRY.toLowerCase()]: {
    '788e': 'publishSignal',
    '0cdc': 'publishSignal', // legacy 4-arg selector
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

// ABI interfaces — source of truth for function selectors
const economyIface = new Interface([
  'function getEconomyStats() view returns (uint256, uint256, uint256, uint256, uint256)',
]);

const trackRecordIface = new Interface([
  'function getWinRate() view returns (uint256)',
  'function totalTrades() view returns (uint256)',
]);

const bountiesIface = new Interface([
  'function nextBountyId() view returns (uint256)',
  'function minBounty() view returns (uint96)',
]);

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const urls = [XLAYER_RPC, XLAYER_RPC_FALLBACK];
  let lastError: Error | null = null;

  for (const url of urls) {
    try {
      const json = await fetchJsonWithTimeout(
        url,
        { jsonrpc: '2.0', method, params, id: 1 },
        2000
      ) as { result?: unknown; error?: { message?: string } };
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

async function ethCall(to: string, data: string): Promise<string> {
  return (await rpcCall('eth_call', [{ to, data }, 'latest'])) as string;
}

async function sbQuery(table: string, query: string): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!res.ok) return [];
    return await res.json() as Record<string, unknown>[];
  } catch { return []; }
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

function identifyMethod(to: string, input: string): string {
  const methods = METHOD_LABELS[to.toLowerCase()] || {};
  const selector = (input || '0x').slice(2, 6).toLowerCase();
  for (const [prefix, label] of Object.entries(methods)) {
    if (prefix === '0x') continue;
    if (selector.startsWith(prefix)) return label;
  }
  return 'interact';
}

async function fetchRecentTxs(blockNumber: number): Promise<OnChainTx[]> {
  // Use eth_getLogs to find all contract interactions in one query.
  // Much faster than scanning block-by-block.
  // Window: 20,000 blocks (~6 hours) to capture cron-activity batches.
  const txs: OnChainTx[] = [];
  const windowBlocks = 20000;
  const fromBlock = `0x${Math.max(0, blockNumber - windowBlocks).toString(16)}`;
  const contractAddresses = Object.keys(CONTRACT_NAMES);

  try {
    // Query logs from all 6 contracts in parallel
    const logPromises = contractAddresses.map(addr =>
      fetchJsonWithTimeout(XLAYER_RPC, {
        jsonrpc: '2.0', id: 1,
        method: 'eth_getLogs',
        params: [{ address: addr, fromBlock, toBlock: 'latest' }],
      }, 5000).catch(() => ({ result: [] })) as Promise<{ result?: Array<{ transactionHash: string; blockNumber: string; address: string }> }>
    );

    const logResults = await Promise.all(logPromises);

    // Collect unique tx hashes with their contract info
    const seenHashes = new Set<string>();
    for (const logRes of logResults) {
      const logs = (logRes as { result?: unknown[] }).result || [];
      for (const log of logs as Array<{ transactionHash: string; blockNumber: string; address: string }>) {
        const hash = log.transactionHash;
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);
        const addr = String(log.address).toLowerCase();
        const blockNum = parseInt(String(log.blockNumber), 16);
        txs.push({
          hash,
          contract: addr,
          contractName: CONTRACT_NAMES[addr] || 'Unknown',
          method: 'interact', // will be enriched below
          blockNumber: blockNum,
          timestamp: null,
          valueOkb: '0',
        });
      }
    }

    // Enrich top 25 txs with method labels and timestamps
    txs.sort((a, b) => b.blockNumber - a.blockNumber);
    const top = txs.slice(0, 25);

    if (top.length > 0) {
      // Batch fetch tx details for method identification
      const txDetailCalls = top.map((t, i) => ({
        jsonrpc: '2.0', id: i + 1,
        method: 'eth_getTransactionByHash',
        params: [t.hash],
      }));

      try {
        const detailRes = await fetchJsonWithTimeout(XLAYER_RPC, txDetailCalls, 5000) as Array<{ result?: { input?: string; value?: string; from?: string; blockNumber?: string } }>;
        const details = Array.isArray(detailRes) ? detailRes : [detailRes];
        for (let i = 0; i < details.length && i < top.length; i++) {
          const d = details[i]?.result;
          if (!d) continue;
          top[i].method = identifyMethod(top[i].contract, d.input || '0x');
          top[i].valueOkb = formatEther(BigInt(d.value || '0x0'));
        }
      } catch { /* non-critical — method labels stay as 'interact' */ }

      // Get timestamps from block numbers (batch)
      const uniqueBlocks = [...new Set(top.map(t => t.blockNumber))].slice(0, 10);
      const blockCalls = uniqueBlocks.map((bn, i) => ({
        jsonrpc: '2.0', id: i + 1,
        method: 'eth_getBlockByNumber',
        params: [`0x${bn.toString(16)}`, false],
      }));
      try {
        const blockRes = await fetchJsonWithTimeout(XLAYER_RPC, blockCalls, 3000) as Array<{ result?: { timestamp?: string; number?: string } }>;
        const blockTimestamps = new Map<number, number>();
        const results = Array.isArray(blockRes) ? blockRes : [blockRes];
        for (const br of results) {
          if (br?.result?.number && br?.result?.timestamp) {
            blockTimestamps.set(parseInt(String(br.result.number), 16), parseInt(String(br.result.timestamp), 16));
          }
        }
        for (const t of top) {
          t.timestamp = blockTimestamps.get(t.blockNumber) ?? null;
        }
      } catch { /* non-critical */ }
    }

    return top;
  } catch (e) {
    console.warn('[ProtocolHeartbeat] fetchRecentTxs failed:', e instanceof Error ? e.message : e);
    return [];
  }
}

async function fetchBlockBatch(calls: unknown[]): Promise<Array<{ result?: RpcBlock }>> {
  const urls = [XLAYER_RPC, XLAYER_RPC_FALLBACK];
  let lastError: Error | null = null;

  for (const url of urls) {
    try {
      const json = await fetchJsonWithTimeout(url, calls, 2500) as unknown;
      if (!Array.isArray(json)) {
        throw new Error(`RPC returned non-array payload from ${url}`);
      }
      return json as Array<{ result?: RpcBlock }>;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error('Block batch RPC failed');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Phase 1: Get block number first (needed for tx scan range)
    const blockHex = await rpcCall('eth_blockNumber', []);
    const blockNumber = parseInt(String(blockHex), 16);

    // Phase 2: Parallel fetch all data — use ethers Interface for correct selector encoding
    const [
      treasuryBalanceHex,
      economyStatsHex,
      winRateHex,
      totalTradesHex,
      nextBountyIdHex,
      recentCycles,
      recentCommerce,
      recentTxs,
    ] = await Promise.all([
      rpcCall('eth_getBalance', [TREASURY, 'latest']),
      // Agent Economy — single call returns all 5 stats
      ethCall(AGENT_ECONOMY, economyIface.encodeFunctionData('getEconomyStats')),
      // Track Record
      ethCall(TRACK_RECORD, trackRecordIface.encodeFunctionData('getWinRate')),
      ethCall(TRACK_RECORD, trackRecordIface.encodeFunctionData('totalTrades')),
      // Bounties
      ethCall(BOUNTIES, bountiesIface.encodeFunctionData('nextBountyId')),
      // Supabase: recent cycles
      withTimeout(
        sbQuery('agent_cycles', 'select=id,status,created_at,vibe_phrase,trades_executed&order=created_at.desc&limit=1'),
        1500,
        []
      ),
      // Supabase: recent commerce
      withTimeout(
        sbQuery('agent_commerce_events', 'select=id,source,tool_name,payment_status,created_at,payment_amount_wei,payment_tx_hash,payer_address,external_agent&order=created_at.desc&limit=5'),
        1500,
        []
      ),
      // On-chain: scan recent blocks for Bobby contract txs
      withTimeout(fetchRecentTxs(blockNumber), 2500, [] as OnChainTx[]),
    ]);

    const treasuryWei = BigInt(treasuryBalanceHex ? String(treasuryBalanceHex) : '0x0').toString();

    // Decode getEconomyStats() — returns (totalDebates, totalMcpCalls, totalSignalAccesses, totalVolume, totalPayments)
    let totalDebates = '0';
    let totalMcpCalls = '0';
    let totalVolumeWei = '0';
    let totalPayments = '0';
    try {
      const decoded = economyIface.decodeFunctionResult('getEconomyStats', String(economyStatsHex));
      totalDebates = decoded[0].toString();
      totalMcpCalls = decoded[1].toString();
      // decoded[2] = totalSignalAccesses (not used in response but available)
      totalVolumeWei = decoded[3].toString();
      totalPayments = decoded[4].toString();
    } catch {
      console.error('[ProtocolHeartbeat] Failed to decode getEconomyStats');
    }

    // Decode single-value returns from TrackRecord
    let winRateBps = '0';
    let totalTrades = '0';
    try {
      const [wr] = trackRecordIface.decodeFunctionResult('getWinRate', String(winRateHex));
      winRateBps = wr.toString();
    } catch {
      console.error('[ProtocolHeartbeat] Failed to decode getWinRate');
    }
    try {
      const [tt] = trackRecordIface.decodeFunctionResult('totalTrades', String(totalTradesHex));
      totalTrades = tt.toString();
    } catch {
      console.error('[ProtocolHeartbeat] Failed to decode totalTrades');
    }

    // Decode nextBountyId from Bounties contract
    let nextBountyId = '0';
    try {
      const [nbi] = bountiesIface.decodeFunctionResult('nextBountyId', String(nextBountyIdHex));
      nextBountyId = nbi.toString();
    } catch {
      console.error('[ProtocolHeartbeat] Failed to decode nextBountyId');
    }

    // Settlement is the real AgentEconomy on-chain volume.
    // Protocol totals keep bounty escrow separate from paid MCP settlement.
    const economyVolumeOkb = parseFloat(formatEther(BigInt(totalVolumeWei)));
    const winRate = parseInt(winRateBps) / 100;
    const totalBounties = Math.max(0, parseInt(nextBountyId) - 1);
    const bountyEscrowOkb = totalBounties * 0.001;
    const protocolNotionalOkb = economyVolumeOkb + bountyEscrowOkb;

    // Last cycle
    const lastCycle = Array.isArray(recentCycles) && recentCycles.length > 0 ? recentCycles[0] : null;
    const lastCycleAge = lastCycle
      ? Math.floor((Date.now() - new Date(String((lastCycle as Record<string, unknown>).created_at)).getTime()) / 1000)
      : null;

    // Recent commerce events
    const commerceEvents = Array.isArray(recentCommerce)
      ? recentCommerce.map((e: Record<string, unknown>) => ({
          source: e.source || 'mcp',
          tool: e.tool_name,
          status: e.payment_status,
          agent: e.external_agent || null,
          payer: e.payer_address ? String(e.payer_address).slice(0, 10) + '...' : null,
          amountOkb: e.payment_amount_wei ? formatEther(BigInt(String(e.payment_amount_wei))) : null,
          txHash: e.payment_tx_hash || null,
          age: Math.floor((Date.now() - new Date(String(e.created_at)).getTime()) / 1000),
        }))
      : [];

    // Health checks
    const blockAge = blockNumber > 0 ? 'healthy' : 'stale';
    const cycleHealth = lastCycleAge !== null && lastCycleAge < 32400 ? 'healthy' : 'overdue'; // 9h tolerance
    const contractHealth = parseInt(totalMcpCalls) > 0 || totalBounties > 0 ? 'active' : 'dormant';

    const payload = {
      ok: true,
      timestamp: new Date().toISOString(),
      cached: false,
      stale: false,
      chain: {
        id: XLAYER_CHAIN_ID,
        blockNumber,
        status: blockAge,
      },
      treasury: {
        address: TREASURY,
        balanceOkb: formatEther(BigInt(treasuryWei)),
      },
      revenue: {
        totalVolumeOkb: economyVolumeOkb.toFixed(4),
        totalPayments: parseInt(totalPayments),
        totalMcpCalls: parseInt(totalMcpCalls),
        totalDebates: parseInt(totalDebates),
      },
      protocolTotals: {
        bountyEscrowOkb: bountyEscrowOkb.toFixed(4),
        totalBounties,
        protocolNotionalOkb: protocolNotionalOkb.toFixed(4),
        totalInteractions: parseInt(totalPayments) + totalBounties,
      },
      performance: {
        winRate,
        totalTrades: parseInt(totalTrades),
        totalBounties,
      },
      lastCycle: lastCycle ? {
        id: (lastCycle as Record<string, unknown>).id,
        status: (lastCycle as Record<string, unknown>).status,
        vibe: (lastCycle as Record<string, unknown>).vibe_phrase,
        tradesExecuted: (lastCycle as Record<string, unknown>).trades_executed,
        ageSeconds: lastCycleAge,
      } : null,
      recentCommerce: commerceEvents,
      health: {
        chain: blockAge,
        cycle: cycleHealth,
        contracts: contractHealth,
        overall: blockAge === 'healthy' && contractHealth === 'active' ? 'operational' : 'degraded',
      },
      recentTxs: recentTxs as OnChainTx[],
      contracts: {
        agentEconomy: { address: AGENT_ECONOMY },
        bounties: { address: BOUNTIES, totalPosted: totalBounties },
        trackRecord: { address: TRACK_RECORD },
        hardnessRegistry: { address: HARDNESS_REGISTRY },
        convictionOracle: { address: CONVICTION_ORACLE },
        agentRegistry: { address: AGENT_REGISTRY },
      },
    };

    heartbeatCache = {
      payload,
      storedAt: Date.now(),
    };

    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=10');
    return res.status(200).json(payload);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ProtocolHeartbeat] Error:', msg);

    if (heartbeatCache) {
      res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=30');
      return res.status(200).json({
        ...heartbeatCache.payload,
        cached: true,
        stale: true,
        error: msg,
        health: {
          ...(heartbeatCache.payload.health as Record<string, unknown>),
          overall: 'degraded',
        },
      });
    }

    return res.status(200).json({
      ok: false,
      cached: false,
      stale: false,
      error: msg,
      timestamp: new Date().toISOString(),
      chain: { id: XLAYER_CHAIN_ID, blockNumber: 0, status: 'degraded' },
      treasury: { address: TREASURY, balanceOkb: '0.0000' },
      revenue: { totalVolumeOkb: '0.0000', totalPayments: 0, totalMcpCalls: 0, totalDebates: 0 },
      protocolTotals: { bountyEscrowOkb: '0.0000', totalBounties: 0, protocolNotionalOkb: '0.0000', totalInteractions: 0 },
      performance: { winRate: 0, totalTrades: 0, totalBounties: 0 },
      lastCycle: null,
      recentCommerce: [],
      recentTxs: [],
      health: {
        chain: 'degraded',
        cycle: 'degraded',
        contracts: 'degraded',
        overall: 'degraded',
      },
      contracts: {
        agentEconomy: { address: AGENT_ECONOMY },
        bounties: { address: BOUNTIES, totalPosted: 0 },
        trackRecord: { address: TRACK_RECORD },
        hardnessRegistry: { address: HARDNESS_REGISTRY },
        convictionOracle: { address: CONVICTION_ORACLE },
        agentRegistry: { address: AGENT_REGISTRY },
      },
    });
  }
}
