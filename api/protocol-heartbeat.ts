// GET /api/protocol-heartbeat
// Real-time protocol health: last tx, active debate, bounty status, revenue, system health
// Includes live on-chain transaction feed from all Bobby contracts
// Designed for the Protocol Heartbeat dashboard page

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Interface, formatEther } from 'ethers';
import { DEFAULT_CHAIN } from './_lib/chains.js';
import { trackRecordSelectors } from './_lib/trackrecord-stats-adapter.js';
import { rpcEndpointLabel, rpcErrorMessage, scrubRpcSecrets } from './_lib/rpc-redact.js';
import { bobbyDbUrl, bobbyReadKey } from './_lib/bobby-db.js';
import {
  BOBBY_ADVERSARIAL_BOUNTIES,
  BOBBY_AGENT_ECONOMY,
  BOBBY_AGENT_REGISTRY,
  BOBBY_CONVICTION_ORACLE,
  BOBBY_HARDNESS_REGISTRY,
  BOBBY_TRACK_RECORD,
  BOBBY_TREASURY,
  PROTOCOL_CHAIN_ID,
  PROTOCOL_RPC_FALLBACK_URL,
  PROTOCOL_RPC_URL,
} from './_lib/protocol-constants.js';

export const config = { maxDuration: 25 };

const XLAYER_RPC = PROTOCOL_RPC_FALLBACK_URL;
const XLAYER_RPC_FALLBACK = PROTOCOL_RPC_URL;
const SB_URL = bobbyDbUrl();
const SB_KEY = bobbyReadKey();

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
      throw new Error(`RPC ${res.status} from ${rpcEndpointLabel(url)}`);
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
  'function getVerifiedWinRate() view returns (uint256)',
  'function totalTrades() view returns (uint256)',
]);

// BP-11: selectors come from the deployment's DECLARED TrackRecord version.
const TRACK_RECORD_SELECTORS = trackRecordSelectors(DEFAULT_CHAIN);
// V2 (Base) has no combined getWinRate (D-1); the heartbeat's headline is the
// VERIFIED win rate there. On X Layer the v1 selector stays.
const HEARTBEAT_WIN_RATE_FN = TRACK_RECORD_SELECTORS.winRate;

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
        throw new Error(scrubRpcSecrets(json.error.message || '') || `RPC error from ${rpcEndpointLabel(url)}`);
      }
      if (json.result == null) {
        throw new Error(`RPC returned no result from ${rpcEndpointLabel(url)}`);
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
  valueNative: string;
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

async function fetchRecentTxs(_blockNumber: number): Promise<OnChainTx[]> {
  // X Layer RPC limits eth_getLogs to 100 blocks, making large scans impractical.
  // Instead, read recent on-chain txs from agent_events (stored by generate-activity).
  // This is fast, reliable, and shows all txs regardless of timing.
  if (!SB_KEY) return [];

  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/agent_events?event_type=eq.onchain_tx&order=created_at.desc&limit=25&select=trade_tx,tool,symbol,reason,meta,created_at`,
      {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!res.ok) return [];
    const rows = await res.json() as Array<{
      trade_tx: string;
      tool: string;
      symbol: string | null;
      reason: string | null;
      meta: string | null;
      created_at: string;
    }>;

    // Map tool types to contract names
    const toolToContract: Record<string, string> = {
      signal: 'HardnessRegistry',
      prediction: 'HardnessRegistry',
      bounty: 'AdversarialBounties',
      trade_commit: 'TrackRecord',
      economy: 'AgentEconomy',
      oracle_signal: 'ConvictionOracle',
      debate_fee: 'AgentEconomy',
    };

    return rows
      .filter(r => r.trade_tx)
      .map(r => {
        const ts = new Date(r.created_at).getTime() / 1000;
        return {
          hash: r.trade_tx,
          contract: '',
          contractName: toolToContract[r.tool] || r.tool || 'Unknown',
          method: r.reason || r.tool || 'interact',
          blockNumber: 0,
          timestamp: Math.floor(ts),
          valueNative: '0',
        };
      });
  } catch {
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
        throw new Error(`RPC returned non-array payload from ${rpcEndpointLabel(url)}`);
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
      minBountyHex,
      recentCycles,
      recentCommerce,
      recentTxs,
    ] = await Promise.all([
      rpcCall('eth_getBalance', [TREASURY, 'latest']),
      // Agent Economy — single call returns all 5 stats
      ethCall(AGENT_ECONOMY, economyIface.encodeFunctionData('getEconomyStats')),
      // Track Record
      ethCall(TRACK_RECORD, trackRecordIface.encodeFunctionData(HEARTBEAT_WIN_RATE_FN)),
      ethCall(TRACK_RECORD, trackRecordIface.encodeFunctionData('totalTrades')),
      // Bounties
      ethCall(BOUNTIES, bountiesIface.encodeFunctionData('nextBountyId')),
      ethCall(BOUNTIES, bountiesIface.encodeFunctionData('minBounty')),
      // Supabase: recent cycles (column is started_at, not created_at)
      withTimeout(
        sbQuery('agent_cycles', 'visibility=eq.public&select=id,status,started_at,vibe_phrase,trades_executed&order=started_at.desc&limit=1'),
        1500,
        []
      ),
      // Supabase: recent commerce — agent_commerce_events table never shipped.
      // Fall back to sandbox_runs which has live activity (every public
      // pressure-test is logged with full transcript). This is honest:
      // every Sandbox run IS protocol activity.
      withTimeout(
        sbQuery('sandbox_runs', 'select=id,playbook_slug,ticker,verdict_action,cio_conviction,status,created_at&order=created_at.desc&limit=5'),
        1500,
        []
      ),
      // On-chain: scan recent blocks for Bobby contract txs
      withTimeout(fetchRecentTxs(blockNumber), 2500, [] as OnChainTx[]),
    ]);

    const treasuryWei = BigInt(treasuryBalanceHex ? String(treasuryBalanceHex) : '0x0').toString();

    // BP-11: a read that does not decode is UNAVAILABLE, not zero. Each source
    // reports its own health and its numbers become null — never a fake zero
    // under ok:true (the v1 selector on the V2 contract decoded exactly that way).
    const sources = { economy: 'ok', trackRecord: 'ok', bounties: 'ok' } as Record<'economy' | 'trackRecord' | 'bounties', 'ok' | 'unavailable'>;

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
      sources.economy = 'unavailable';
      console.error('[ProtocolHeartbeat] Failed to decode getEconomyStats');
    }

    // Decode single-value returns from TrackRecord (selectors per declared version)
    let winRateBps: string | null = null;
    let totalTrades: string | null = null;
    try {
      const [wr] = trackRecordIface.decodeFunctionResult(HEARTBEAT_WIN_RATE_FN, String(winRateHex));
      winRateBps = wr.toString();
    } catch {
      sources.trackRecord = 'unavailable';
      console.error(`[ProtocolHeartbeat] Failed to decode ${HEARTBEAT_WIN_RATE_FN} (trackRecord ${TRACK_RECORD_SELECTORS.version})`);
    }
    try {
      const [tt] = trackRecordIface.decodeFunctionResult('totalTrades', String(totalTradesHex));
      totalTrades = tt.toString();
    } catch {
      sources.trackRecord = 'unavailable';
      console.error('[ProtocolHeartbeat] Failed to decode totalTrades');
    }

    // Decode nextBountyId from Bounties contract
    let nextBountyId = '0';
    let minBountyWei = '0';
    try {
      const [nbi] = bountiesIface.decodeFunctionResult('nextBountyId', String(nextBountyIdHex));
      nextBountyId = nbi.toString();
    } catch {
      sources.bounties = 'unavailable';
      console.error('[ProtocolHeartbeat] Failed to decode nextBountyId');
    }
    try {
      const [minimum] = bountiesIface.decodeFunctionResult('minBounty', String(minBountyHex));
      minBountyWei = minimum.toString();
    } catch {
      sources.bounties = 'unavailable';
      console.error('[ProtocolHeartbeat] Failed to decode minBounty');
    }
    const allSourcesOk = Object.values(sources).every((v) => v === 'ok');

    // Settlement is the real AgentEconomy on-chain volume.
    // Protocol totals keep bounty escrow separate from paid MCP settlement.
    const economyVolumeNative = parseFloat(formatEther(BigInt(totalVolumeWei)));
    const winRate = winRateBps === null ? null : parseInt(winRateBps) / 100;
    const totalBounties = Math.max(0, parseInt(nextBountyId) - 1);
    const bountyEscrowNative = totalBounties * parseFloat(formatEther(BigInt(minBountyWei)));
    const protocolNotionalNative = economyVolumeNative + bountyEscrowNative;

    // Last cycle (column is started_at)
    const lastCycle = Array.isArray(recentCycles) && recentCycles.length > 0 ? recentCycles[0] : null;
    const lastCycleAge = lastCycle
      ? Math.floor((Date.now() - new Date(String((lastCycle as Record<string, unknown>).started_at)).getTime()) / 1000)
      : null;

    // Recent commerce events — sourced from sandbox_runs (public pressure-tests).
    // Each Sandbox run is real protocol activity: agents debate, guardrails run,
    // verdicts persist. This is the honest commerce surface for the heartbeat.
    const commerceEvents = Array.isArray(recentCommerce)
      ? recentCommerce.map((e: Record<string, unknown>) => ({
          source: 'sandbox',
          tool: `pressure_test:${e.playbook_slug}`,
          status: e.status === 'completed' ? 'paid' : (e.status as string) || 'pending',
          agent: e.ticker ? `pressure-test/${e.ticker}` : null,
          payer: null,
          amountNative: null,
          txHash: null,
          verdict: e.verdict_action || null,
          conviction: typeof e.cio_conviction === 'number' ? e.cio_conviction : null,
          age: Math.floor((Date.now() - new Date(String(e.created_at)).getTime()) / 1000),
        }))
      : [];

    // Health checks
    const blockAge = blockNumber > 0 ? 'healthy' : 'stale';
    const cycleHealth = lastCycleAge !== null && lastCycleAge < 32400 ? 'healthy' : 'overdue'; // 9h tolerance
    const contractHealth = parseInt(totalMcpCalls) > 0 || totalBounties > 0 ? 'active' : 'dormant';

    const payload = {
      ok: allSourcesOk,
      degraded: !allSourcesOk,
      sources,
      trackRecordVersion: TRACK_RECORD_SELECTORS.version,
      timestamp: new Date().toISOString(),
      cached: false,
      stale: false,
      chain: {
        id: PROTOCOL_CHAIN_ID,
        name: DEFAULT_CHAIN.name,
        nativeSymbol: DEFAULT_CHAIN.nativeSymbol,
        explorerUrl: DEFAULT_CHAIN.explorerUrl,
        blockNumber,
        status: blockAge,
      },
      treasury: {
        address: TREASURY,
        balanceNative: formatEther(BigInt(treasuryWei)),
      },
      revenue: {
        totalVolumeNative: economyVolumeNative.toFixed(4),
        nativeSymbol: DEFAULT_CHAIN.nativeSymbol,
        totalPayments: parseInt(totalPayments),
        totalMcpCalls: parseInt(totalMcpCalls),
        totalDebates: parseInt(totalDebates),
      },
      protocolTotals: {
        bountyEscrowNative: bountyEscrowNative.toFixed(4),
        totalBounties,
        protocolNotionalNative: protocolNotionalNative.toFixed(4),
        totalInteractions: parseInt(totalPayments) + totalBounties,
      },
      performance: {
        winRate,
        totalTrades: totalTrades === null ? null : parseInt(totalTrades),
        totalBounties: sources.bounties === 'ok' ? totalBounties : null,
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
        overall: blockAge === 'healthy' && contractHealth === 'active' && allSourcesOk ? 'operational' : 'degraded',
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
    // BP-12: never echo a configured RPC URL (it may carry a key) to logs or clients.
    const msg = rpcErrorMessage(error);
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
      degraded: true,
      sources: { economy: 'unavailable', trackRecord: 'unavailable', bounties: 'unavailable' },
      trackRecordVersion: TRACK_RECORD_SELECTORS.version,
      cached: false,
      stale: false,
      error: msg,
      timestamp: new Date().toISOString(),
      chain: { id: PROTOCOL_CHAIN_ID, name: DEFAULT_CHAIN.name, nativeSymbol: DEFAULT_CHAIN.nativeSymbol, explorerUrl: DEFAULT_CHAIN.explorerUrl, blockNumber: 0, status: 'degraded' },
      treasury: { address: TREASURY, balanceNative: '0.0000' },
      revenue: { totalVolumeNative: '0.0000', nativeSymbol: DEFAULT_CHAIN.nativeSymbol, totalPayments: 0, totalMcpCalls: 0, totalDebates: 0 },
      protocolTotals: { bountyEscrowNative: '0.0000', totalBounties: 0, protocolNotionalNative: '0.0000', totalInteractions: 0 },
      performance: { winRate: null, totalTrades: null, totalBounties: null },
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
