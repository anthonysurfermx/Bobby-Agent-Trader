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
  // X Layer has 1s blocks and max batch size of 10.
  // Scan last 1800 blocks (~30min) using parallel waves.
  // 10 blocks/batch × 10 parallel = 100 blocks/wave × 18 waves = 1800 blocks
  const txs: OnChainTx[] = [];
  const windowBlocks = 600;
  const batchSize = 5;
  const parallelBatches = 4;
  const waves = Math.ceil(windowBlocks / (batchSize * parallelBatches));

  try {
    for (let wave = 0; wave < waves && txs.length < 25; wave++) {
      const waveStart = wave * batchSize * parallelBatches;
      const promises: Promise<void>[] = [];

      for (let p = 0; p < parallelBatches; p++) {
        const offset = waveStart + p * batchSize;
        if (offset >= windowBlocks) break;

        const batchCalls = [];
        for (let i = 0; i < batchSize; i++) {
          const bn = blockNumber - offset - i;
          if (bn <= 0) break;
          batchCalls.push({
            jsonrpc: '2.0',
            method: 'eth_getBlockByNumber',
            params: [`0x${bn.toString(16)}`, true],
            id: i + 1,
          });
        }
        if (batchCalls.length === 0) continue;

        promises.push(
          fetchBlockBatch(batchCalls)
            .then((blocks) => {
              for (const blockResult of blocks) {
                const block = blockResult?.result;
                if (!block?.transactions) continue;
                const blockTs = parseInt(String(block.timestamp), 16);
                const blockNum = parseInt(String(block.number), 16);
                for (const tx of block.transactions) {
                  if (String(tx.from || '').toLowerCase() !== TREASURY.toLowerCase()) continue;
                  const txTo = String(tx.to || '').toLowerCase();
                  if (!CONTRACT_NAMES[txTo]) continue;
                  txs.push({
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
            .catch(() => {}) // ignore individual batch failures
        );
      }

      await Promise.all(promises);
    }
  } catch (e) {
    console.warn('[ProtocolHeartbeat] fetchRecentTxs failed:', e instanceof Error ? e.message : e);
  }

  txs.sort((a, b) => b.blockNumber - a.blockNumber);
  return txs.slice(0, 25);
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
        throw new Error(`RPC ${res.status} from ${url}`);
      }
      const json = await res.json() as unknown;
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
        sbQuery('agent_commerce_events', 'select=id,tool_name,payment_status,created_at,payment_amount_wei,payer_address&order=created_at.desc&limit=5'),
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
          tool: e.tool_name,
          status: e.payment_status,
          payer: e.payer_address ? String(e.payer_address).slice(0, 10) + '...' : null,
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
