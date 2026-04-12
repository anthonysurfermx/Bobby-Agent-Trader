// GET /api/protocol-heartbeat
// Real-time protocol health: last tx, active debate, bounty status, revenue, system health
// Designed for the Protocol Heartbeat dashboard page

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 15 };

const XLAYER_RPC = 'https://xlayerrpc.okx.com';
const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

// Contract addresses
const AGENT_ECONOMY = '0xD9540D770C8aF67e9E6412C92D78E34bc11ED871';
const BOUNTIES = '0xa8005ab465a0e02cb14824cd0e7630391fba673d';
const TRACK_RECORD = '0xF841b428E6d743187D7BE2242eccC1078fdE2395';
const TREASURY = '0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea';

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

function decodeSingleUint(hex: string): string {
  if (!hex || hex === '0x' || hex.length < 66) return '0';
  return BigInt('0x' + hex.slice(2, 66)).toString();
}

function weiToOkb(wei: string): string {
  const n = BigInt(wei);
  const whole = n / BigInt(1e18);
  const frac = n % BigInt(1e18);
  const fracStr = frac.toString().padStart(18, '0').slice(0, 4);
  return `${whole}.${fracStr}`;
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Parallel fetch all data
    const [
      blockHex,
      treasuryBalanceHex,
      totalDebatesHex,
      totalMcpCallsHex,
      totalVolumeHex,
      totalPaymentsHex,
      winRateHex,
      totalTradesHex,
      nextBountyIdHex,
      lastActivityHex,
      recentCycles,
      recentCommerce,
    ] = await Promise.all([
      // Chain state
      rpcCall('eth_blockNumber', []),
      rpcCall('eth_getBalance', [TREASURY, 'latest']),
      // Agent Economy
      ethCall(AGENT_ECONOMY, '0x' + 'e4aed057'.padEnd(8, '0')), // totalDebates()
      ethCall(AGENT_ECONOMY, '0x' + 'c9b2e522'.padEnd(8, '0')), // totalMcpCalls()
      ethCall(AGENT_ECONOMY, '0x' + '5e615a50'.padEnd(8, '0')), // totalVolumeWei()
      ethCall(AGENT_ECONOMY, '0x' + '0ab143ab'.padEnd(8, '0')), // totalPayments()
      // Track Record
      ethCall(TRACK_RECORD, '0x' + '7ec1e4f9'.padEnd(8, '0')), // winRateBps()
      ethCall(TRACK_RECORD, '0x' + 'c4e41b22'.padEnd(8, '0')), // totalTrades()
      // Bounties
      ethCall(BOUNTIES, '0x' + 'e7e0ee96'.padEnd(8, '0')), // nextBountyId()
      ethCall(AGENT_ECONOMY, '0x' + 'bfd80e73'.padEnd(8, '0')), // lastActivityBlock()
      // Supabase: recent cycles
      sbQuery('agent_cycles', 'select=id,status,created_at,vibe_phrase,trades_executed&order=created_at.desc&limit=1'),
      // Supabase: recent commerce
      sbQuery('agent_commerce_events', 'select=id,tool_name,payment_status,created_at,payment_amount_wei,payer_address&order=created_at.desc&limit=5'),
    ]);

    const blockNumber = parseInt(String(blockHex), 16);
    const treasuryWei = BigInt(String(treasuryBalanceHex) || '0').toString();
    const totalDebates = decodeSingleUint(String(totalDebatesHex));
    const totalMcpCalls = decodeSingleUint(String(totalMcpCallsHex));
    const totalVolumeWei = decodeSingleUint(String(totalVolumeHex));
    const totalPayments = decodeSingleUint(String(totalPaymentsHex));
    const winRateBps = decodeSingleUint(String(winRateHex));
    const totalTrades = decodeSingleUint(String(totalTradesHex));
    const nextBountyId = decodeSingleUint(String(nextBountyIdHex));
    const lastActivityBlock = decodeSingleUint(String(lastActivityHex));

    // Calculate revenue
    const volumeOkb = weiToOkb(totalVolumeWei);
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
        balanceOkb: weiToOkb(treasuryWei),
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
      contracts: {
        agentEconomy: { address: AGENT_ECONOMY, lastActivityBlock: parseInt(lastActivityBlock) },
        bounties: { address: BOUNTIES, totalPosted: totalBounties },
        trackRecord: { address: TRACK_RECORD },
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ProtocolHeartbeat] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
