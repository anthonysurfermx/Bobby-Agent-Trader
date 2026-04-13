// GET /api/protocol-heartbeat
// Real-time protocol health: last tx, active debate, bounty status, revenue, system health
// Includes live on-chain transaction feed from all Bobby contracts
// Designed for the Protocol Heartbeat dashboard page

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Interface, formatEther } from 'ethers';

export const config = { maxDuration: 25 };

const XLAYER_RPC = 'https://xlayerrpc.okx.com';
const XLAYER_RPC_FALLBACK = 'https://rpc.xlayer.tech';
const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

// Contract addresses
const AGENT_ECONOMY = '0xD9540D770C8aF67e9E6412C92D78E34bc11ED871';
const BOUNTIES = '0xa8005ab465a0e02cb14824cd0e7630391fba673d';
const TRACK_RECORD = '0xF841b428E6d743187D7BE2242eccC1078fdE2395';
const HARDNESS_REGISTRY = '0xD89c1721CD760984a31dE0325fD96cD27bB31040';
const CONVICTION_ORACLE = process.env.BOBBY_ORACLE_ADDRESS || '0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A';
const TREASURY = '0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea';

// Contract name map for tx feed
const CONTRACT_NAMES: Record<string, string> = {
  [AGENT_ECONOMY.toLowerCase()]: 'AgentEconomy',
  [BOUNTIES.toLowerCase()]: 'AdversarialBounties',
  [TRACK_RECORD.toLowerCase()]: 'TrackRecord',
  [HARDNESS_REGISTRY.toLowerCase()]: 'HardnessRegistry',
  [CONVICTION_ORACLE.toLowerCase()]: 'ConvictionOracle',
};

// Method selectors for labeling txs
const METHOD_LABELS: Record<string, Record<string, string>> = {
  [HARDNESS_REGISTRY.toLowerCase()]: {
    '0x': 'registerAgent',
    '5a8e': 'publishSignal',
    'c186': 'commitPrediction',
    '3f60': 'registerService',
  },
  [BOUNTIES.toLowerCase()]: {
    '89e0': 'postBounty',
    '5656': 'submitChallenge',
  },
  [TRACK_RECORD.toLowerCase()]: {
    '6c83': 'commitTrade',
    'f7b1': 'resolveTrade',
  },
  [AGENT_ECONOMY.toLowerCase()]: {
    '3fba': 'payDebateFee',
    'f0a5': 'payMCPCall',
  },
  [CONVICTION_ORACLE.toLowerCase()]: {
    '7bfc': 'publishSignal',
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
  const res = await fetch(XLAYER_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  const json = await res.json() as { result: unknown };
  return json.result;
}

async function ethCall(to: string, data: string): Promise<string> {
  return (await rpcCall('eth_call', [{ to, data }, 'latest'])) as string;
}

async function sbQuery(table: string, query: string): Promise<unknown[]> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!res.ok) return [];
    return await res.json();
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
  // Scan last 600 blocks (~30 min on X Layer with ~3s blocks)
  // Uses batch JSON-RPC: 6 batches of 100 blocks = 6 RPC calls
  const txs: OnChainTx[] = [];
  const totalBlocks = 600;
  const batchSize = 100;

  try {
    for (let offset = 0; offset < totalBlocks && txs.length < 25; offset += batchSize) {
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
      if (batchCalls.length === 0) break;

      const batchRes = await fetch(XLAYER_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchCalls),
      });

      if (!batchRes.ok) {
        // Try fallback RPC
        const fallbackRes = await fetch(XLAYER_RPC_FALLBACK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batchCalls),
        });
        if (!fallbackRes.ok) break;
        const fallbackData = await fallbackRes.json();
        processBlockBatch(fallbackData as Array<{ result: any }>, txs);
      } else {
        const batchData = await batchRes.json();
        processBlockBatch(batchData as Array<{ result: any }>, txs);
      }
    }
  } catch (e) {
    console.warn('[ProtocolHeartbeat] fetchRecentTxs failed:', e instanceof Error ? e.message : e);
  }

  txs.sort((a, b) => b.blockNumber - a.blockNumber);
  return txs.slice(0, 25);
}

function processBlockBatch(results: Array<{ result: any }>, txs: OnChainTx[]) {
  for (const blockResult of results) {
    const block = blockResult?.result;
    if (!block || !block.transactions) continue;
    const blockTs = parseInt(String(block.timestamp), 16);
    const blockNum = parseInt(String(block.number), 16);

    for (const tx of block.transactions) {
      const from = String(tx.from || '').toLowerCase();
      const to = String(tx.to || '').toLowerCase();

      if (from !== TREASURY.toLowerCase()) continue;
      if (!CONTRACT_NAMES[to]) continue;

      txs.push({
        hash: tx.hash,
        contract: to,
        contractName: CONTRACT_NAMES[to] || 'Unknown',
        method: identifyMethod(to, tx.input || '0x'),
        blockNumber: blockNum,
        timestamp: blockTs,
        valueOkb: formatEther(BigInt(tx.value || '0x0')),
      });
    }
  }
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
      sbQuery('agent_cycles', 'select=id,status,created_at,vibe_phrase,trades_executed&order=created_at.desc&limit=1'),
      // Supabase: recent commerce
      sbQuery('agent_commerce_events', 'select=id,tool_name,payment_status,created_at,payment_amount_wei,payer_address&order=created_at.desc&limit=5'),
      // On-chain: scan recent blocks for Bobby contract txs
      fetchRecentTxs(blockNumber),
    ]);

    const treasuryWei = BigInt(String(treasuryBalanceHex) || '0').toString();

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

    // Calculate revenue
    const volumeOkb = formatEther(BigInt(totalVolumeWei));
    const winRate = parseInt(winRateBps) / 100;
    const totalBounties = Math.max(0, parseInt(nextBountyId) - 1);

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
    const contractHealth = parseInt(totalMcpCalls) > 0 ? 'active' : 'dormant';

    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=10');
    return res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString(),
      chain: {
        id: 196,
        blockNumber,
        status: blockAge,
      },
      treasury: {
        address: TREASURY,
        balanceOkb: formatEther(BigInt(treasuryWei)),
      },
      revenue: {
        totalVolumeOkb: volumeOkb,
        totalPayments: parseInt(totalPayments),
        totalMcpCalls: parseInt(totalMcpCalls),
        totalDebates: parseInt(totalDebates),
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
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ProtocolHeartbeat] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
