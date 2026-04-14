// ============================================================
// GET /api/bobby-protocol-stats
// Aggregated snapshot for the Bobby Protocol landing page.
// One request → all tickers, contracts, and on-chain live data.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { formatEther, Interface } from 'ethers';
import { countAgents } from './_lib/hardness-control-plane.js';
import {
  BOBBY_ADVERSARIAL_BOUNTIES,
  BOBBY_AGENT_ECONOMY,
  XLAYER_CHAIN_ID,
  XLAYER_RPC_URL,
  getEconomyStats,
  listRecentBounties,
  readBounty,
  readMinBounty,
  readNextBountyId,
} from './_lib/xlayer-payments.js';
import {
  BOBBY_AGENT_REGISTRY,
  BOBBY_CONVICTION_ORACLE,
  BOBBY_HARDNESS_REGISTRY,
  BOBBY_TRACK_RECORD,
  BOBBY_TREASURY,
} from './_lib/protocol-constants.js';

export const config = { maxDuration: 30 };

const CONVICTION_ORACLE = BOBBY_CONVICTION_ORACLE;
const TRACK_RECORD = BOBBY_TRACK_RECORD;
const HARDNESS_REGISTRY = BOBBY_HARDNESS_REGISTRY;
const AGENT_REGISTRY = BOBBY_AGENT_REGISTRY;

const ORACLE_INTERFACE = new Interface([
  'function symbolCount() view returns (uint256)',
]);

const HARDNESS_INTERFACE = new Interface([
  'function agentProfiles(address) view returns (bool registered, uint64 registeredAt, string metadataURI)',
]);

const TRACK_RECORD_INTERFACE = new Interface([
  'function totalTrades() view returns (uint256)',
  'function totalCommitments() view returns (uint256)',
  'function getWinRate() view returns (uint256)',
]);

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(XLAYER_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message || 'rpc error');
  return json.result as T;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error('[protocol-stats]', (err as Error).message);
    return fallback;
  }
}

const BOUNTY_DIMENSIONS = [
  'DATA_INTEGRITY',
  'ADVERSARIAL_QUALITY',
  'DECISION_LOGIC',
  'RISK_MANAGEMENT',
  'CALIBRATION_ALIGNMENT',
  'NOVELTY',
] as const;

type BountyDimensionSummary = {
  totalCount: number;
  openCount: number;
  avgRewardOkb: number | null;
  maxRewardOkb: number | null;
};

function emptyBountySummary(): Record<string, BountyDimensionSummary> {
  return Object.fromEntries(
    BOUNTY_DIMENSIONS.map((dimension) => [
      dimension,
      {
        totalCount: 0,
        openCount: 0,
        avgRewardOkb: null,
        maxRewardOkb: null,
      },
    ]),
  );
}

async function getBountySummary(nextBountyId: number): Promise<Record<string, BountyDimensionSummary>> {
  const summary = emptyBountySummary();
  const last = Math.max(0, nextBountyId - 1);

  if (last === 0) {
    return summary;
  }

  for (let start = 1; start <= last; start += 8) {
    const ids = Array.from({ length: Math.min(8, last - start + 1) }, (_, index) => start + index);
    const batch = await Promise.all(ids.map((id) => readBounty(id).catch(() => null)));

    for (const bounty of batch) {
      if (!bounty) continue;

      const dimension = bounty.dimension in summary ? bounty.dimension : null;
      if (!dimension) continue;

      const rewardOkb = Number(bounty.rewardOkb || 0);
      const current = summary[dimension];
      const totalReward = (current.avgRewardOkb ?? 0) * current.totalCount + rewardOkb;
      const nextTotalCount = current.totalCount + 1;

      summary[dimension] = {
        totalCount: nextTotalCount,
        openCount: current.openCount + (bounty.status === 'OPEN' ? 1 : 0),
        avgRewardOkb: totalReward / nextTotalCount,
        maxRewardOkb:
          current.maxRewardOkb === null ? rewardOkb : Math.max(current.maxRewardOkb, rewardOkb),
      };
    }
  }

  return summary;
}

async function getContractLastActivity(address: string): Promise<number | null> {
  // Search last 50,000 blocks (~28 hours) for activity
  try {
    const block = await rpcCall<string>('eth_blockNumber', []);
    const latest = Number.parseInt(String(block), 16);
    const fromBlock = `0x${Math.max(0, latest - 50000).toString(16)}`;
    const logs = await rpcCall<Array<{ blockNumber: string }>>('eth_getLogs', [
      { address, fromBlock, toBlock: 'latest' },
    ]);
    if (!logs?.length) return null;
    const last = logs[logs.length - 1];
    return Number.parseInt(String(last.blockNumber), 16);
  } catch {
    return null;
  }
}

async function getOracleStats() {
  const data = ORACLE_INTERFACE.encodeFunctionData('symbolCount');
  const raw = await rpcCall<string>('eth_call', [{ to: CONVICTION_ORACLE, data }, 'latest']);
  const [count] = ORACLE_INTERFACE.decodeFunctionResult('symbolCount', raw);
  return { symbolCount: count.toString() };
}

async function getTrackRecordStats() {
  const [totalTradesRaw, totalCommitmentsRaw, winRateRaw] = await Promise.all([
    rpcCall<string>('eth_call', [
      { to: TRACK_RECORD, data: TRACK_RECORD_INTERFACE.encodeFunctionData('totalTrades') },
      'latest',
    ]),
    rpcCall<string>('eth_call', [
      { to: TRACK_RECORD, data: TRACK_RECORD_INTERFACE.encodeFunctionData('totalCommitments') },
      'latest',
    ]),
    rpcCall<string>('eth_call', [
      { to: TRACK_RECORD, data: TRACK_RECORD_INTERFACE.encodeFunctionData('getWinRate') },
      'latest',
    ]),
  ]);
  const [totalTrades] = TRACK_RECORD_INTERFACE.decodeFunctionResult('totalTrades', totalTradesRaw);
  const [totalCommitments] = TRACK_RECORD_INTERFACE.decodeFunctionResult('totalCommitments', totalCommitmentsRaw);
  const [winRate] = TRACK_RECORD_INTERFACE.decodeFunctionResult('getWinRate', winRateRaw);
  return {
    totalTrades: totalTrades.toString(),
    totalCommitments: totalCommitments.toString(),
    winRateBps: winRate.toString(), // contract returns basis points (0-10000)
  };
}

async function getPricesFromIntel(baseUrl: string) {
  const res = await fetch(`${baseUrl}/api/bobby-intel`, {
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!res.ok) throw new Error(`intel ${res.status}`);
  const data = (await res.json()) as {
    briefing?: string;
    prices?: unknown[];
    xlayer?: unknown;
    regime?: unknown;
  };
  type NormalizedPrice = { symbol: string; price: number; change24h: number };
  let prices: NormalizedPrice[] = [];

  const normalize = (arr: unknown[]): NormalizedPrice[] =>
    arr
      .map((p) => {
        const obj = p as Record<string, unknown>;
        const sym = typeof obj.symbol === 'string' ? obj.symbol : null;
        const price = typeof obj.price === 'number' ? obj.price : Number(obj.price);
        // Accept both field names because bobby-intel returns change24h in
        // data.prices but change_24h_pct inside the briefing text block
        const rawChange =
          (obj as { change24h?: unknown }).change24h ??
          (obj as { change_24h_pct?: unknown }).change_24h_pct ??
          0;
        const change = typeof rawChange === 'number' ? rawChange : Number(rawChange);
        if (!sym || !Number.isFinite(price)) return null;
        return { symbol: sym, price, change24h: Number.isFinite(change) ? change : 0 };
      })
      .filter((p): p is NormalizedPrice => p !== null);

  if (Array.isArray(data.prices)) {
    prices = normalize(data.prices);
  } else if (data.briefing) {
    const match = data.briefing.match(/<LIVE_PRICES>\n(\[[\s\S]*?\])\n<\/LIVE_PRICES>/);
    if (match) {
      try {
        prices = normalize(JSON.parse(match[1]));
      } catch {}
    }
  }
  return {
    prices,
    regime: data.regime ?? null,
    xlayer: data.xlayer ?? null,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'bobbyprotocol.xyz';
  const baseUrl = `${proto}://${host}`;

  const [
    blockHexResult,
    treasuryHexResult,
    economyStats,
    oracleStats,
    trackRecordStats,
    bountyMin,
    bountyNextId,
    recentBounties,
    economyLastBlock,
    bountiesLastBlock,
    hardnessLastBlock,
    hardnessRegistered,
    agentCount,
    intel,
  ] = await Promise.all([
    safe(() => rpcCall<string>('eth_blockNumber', []), '0x0'),
    safe(
      () => rpcCall<string>('eth_getBalance', [BOBBY_TREASURY, 'latest']),
      '0x0'
    ),
    safe(getEconomyStats, {
      totalDebates: '0',
      totalMcpCalls: '0',
      totalSignalAccesses: '0',
      totalVolumeWei: '0',
      totalVolumeOkb: '0',
      totalPayments: '0',
    }),
    safe(getOracleStats, { symbolCount: '0' }),
    safe(getTrackRecordStats, { totalTrades: '0', totalCommitments: '0', winRateBps: '0' }),
    safe(readMinBounty, { minBountyWei: '0', minBountyOkb: '0' }),
    safe(readNextBountyId, 1),
    safe(() => listRecentBounties(6), []),
    safe(() => getContractLastActivity(BOBBY_AGENT_ECONOMY), null),
    safe(() => getContractLastActivity(BOBBY_ADVERSARIAL_BOUNTIES), null),
    safe(() => getContractLastActivity(HARDNESS_REGISTRY), null),
    safe(async () => {
      // Check if Bobby is registered on HardnessRegistry
      const data = HARDNESS_INTERFACE.encodeFunctionData('agentProfiles', [BOBBY_TREASURY]);
      const raw = await rpcCall<string>('eth_call', [{ to: HARDNESS_REGISTRY, data }, 'latest']);
      const [registered] = HARDNESS_INTERFACE.decodeFunctionResult('agentProfiles', raw);
      return registered;
    }, false),
    safe(countAgents, 0),
    safe(
      () => getPricesFromIntel(baseUrl),
      { prices: [], regime: null, xlayer: null }
    ),
  ]);

  const bountySummary = await safe(() => getBountySummary(bountyNextId), emptyBountySummary());

  const blockNumber = Number.parseInt(String(blockHexResult || '0x0'), 16) || 0;
  const treasuryWei = BigInt(treasuryHexResult || '0x0');

  // Keep paid MCP settlement separate from bounty escrow.
  const totalBountiesPosted = Math.max(0, bountyNextId - 1);
  const bountyEscrowOkb = totalBountiesPosted * 0.001;
  const economyVol = parseFloat(economyStats.totalVolumeOkb || '0');
  const protocolNotionalOkb = (economyVol + bountyEscrowOkb).toFixed(4);

  // Supabase debate + resolution stats (real activity beyond on-chain contracts)
  const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  let debateStats = { totalDebates: 0, resolved: 0, wins: 0, losses: 0, breakEven: 0, winRate: 0, pending: 0 };
  if (SB_KEY) {
    try {
      const [threadsRes, eventsRes] = await Promise.all([
        fetch(`${SB_URL}/rest/v1/forum_threads?select=resolution&entry_price=not.is.null`, {
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        }).then(r => r.ok ? r.json() : []),
        // Exclude demo traffic (meta.demo_source = 'playbooks_page') from public metrics
        fetch(`${SB_URL}/rest/v1/agent_events?select=id&or=(meta->>demo_source.is.null,meta->>demo_source.neq.playbooks_page)`, {
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'count=exact' },
        }).then(r => {
          const count = r.headers.get('content-range')?.split('/')[1];
          return count ? parseInt(count) : 0;
        }).catch(() => 0),
      ]);
      const threads = threadsRes as Array<{ resolution: string }>;
      const resolved = threads.filter(t => t.resolution !== 'pending');
      const wins = resolved.filter(t => t.resolution === 'win').length;
      const losses = resolved.filter(t => t.resolution === 'loss').length;
      const be = resolved.filter(t => t.resolution === 'break_even').length;
      debateStats = {
        totalDebates: threads.length,
        resolved: resolved.length,
        wins,
        losses,
        breakEven: be,
        winRate: resolved.length > 0 ? parseFloat(((wins / resolved.length) * 100).toFixed(1)) : 0,
        pending: threads.length - resolved.length,
      };
      (debateStats as any).harnessEvents = eventsRes;

      // Get latest on-chain tx timestamp to mark contracts as active
      const latestTxRes = await fetch(
        `${SB_URL}/rest/v1/agent_events?event_type=eq.onchain_tx&order=created_at.desc&limit=1&select=created_at`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      ).then(r => r.ok ? r.json() : []).catch(() => []);
      const latestOnchainTx = (latestTxRes as Array<{ created_at: string }>)[0];
      if (latestOnchainTx) {
        (debateStats as any).lastOnchainActivity = latestOnchainTx.created_at;
      }
    } catch { /* non-critical */ }
  }

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
  return res.status(200).json({
    ok: true,
    fetchedAt: new Date().toISOString(),
    chain: {
      id: XLAYER_CHAIN_ID,
      blockNumber,
      rpc: XLAYER_RPC_URL,
    },
    treasury: {
      address: BOBBY_TREASURY,
      balanceWei: treasuryWei.toString(),
      balanceOkb: formatEther(treasuryWei),
    },
    contracts: {
      agentEconomy: {
        address: BOBBY_AGENT_ECONOMY,
        stats: economyStats,
        lastActivityBlock: economyLastBlock,
      },
      convictionOracle: {
        address: CONVICTION_ORACLE,
        stats: oracleStats,
      },
      trackRecord: {
        address: TRACK_RECORD,
        stats: trackRecordStats,
      },
      adversarialBounties: {
        address: BOBBY_ADVERSARIAL_BOUNTIES,
        verified: true,
        minBounty: bountyMin,
        nextBountyId: bountyNextId,
        totalPosted: Math.max(0, bountyNextId - 1),
        lastActivityBlock: bountiesLastBlock,
      },
      hardnessRegistry: {
        address: HARDNESS_REGISTRY,
        agentRegistered: hardnessRegistered,
        lastActivityBlock: hardnessLastBlock,
      },
      agentRegistry: {
        address: AGENT_REGISTRY,
        type: 'ERC-721',
        agents: agentCount,
      },
    },
    protocolTotals: {
      mcpSettlementOkb: economyStats.totalVolumeOkb,
      mcpPayments: Number(economyStats.totalPayments || '0'),
      bountyEscrowOkb: bountyEscrowOkb.toFixed(4),
      bountyCount: totalBountiesPosted,
      protocolNotionalOkb,
      totalInteractions: Number(economyStats.totalPayments || '0') + totalBountiesPosted,
    },
    bounties: recentBounties,
    bountySummary,
    debateActivity: debateStats,
    market: {
      prices: intel.prices,
      regime: intel.regime,
      xlayer: intel.xlayer,
    },
  });
}
