// ============================================================
// GET /api/reputation
// Public reputation endpoint — on-chain track record + economy
// stats for Bobby Protocol. Any agent can query this to assess
// Bobby's credibility before consuming paid tools.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Interface } from 'ethers';
import {
  BOBBY_AGENT_ECONOMY,
  BOBBY_ADVERSARIAL_BOUNTIES,
  XLAYER_CHAIN_ID,
  XLAYER_RPC_URL,
  getEconomyStats,
  readMinBounty,
  readNextBountyId,
} from './_lib/xlayer-payments.js';

export const config = { maxDuration: 15 };

const CONVICTION_ORACLE = '0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A';
const TRACK_RECORD = '0xF841b428E6d743187D7BE2242eccC1078fdE2395';

const ORACLE_INTERFACE = new Interface([
  'function symbolCount() view returns (uint256)',
]);

const TRACK_RECORD_INTERFACE = new Interface([
  'function totalTrades() view returns (uint256)',
  'function totalCommitments() view returns (uint256)',
  'function getWinRate() view returns (uint256)',
  'function wins() view returns (uint256)',
  'function losses() view returns (uint256)',
  'function totalPnlBps() view returns (int256)',
  'function pendingCount() view returns (uint256)',
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
    console.error('[reputation]', (err as Error).message);
    return fallback;
  }
}

async function callView(to: string, iface: Interface, fn: string) {
  const data = iface.encodeFunctionData(fn);
  const raw = await rpcCall<string>('eth_call', [{ to, data }, 'latest']);
  return iface.decodeFunctionResult(fn, raw)[0];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const [
    totalTrades,
    totalCommitments,
    winRateBps,
    wins,
    losses,
    totalPnlBps,
    pendingCount,
    symbolCount,
    economyStats,
    bountyMin,
    bountyNextId,
  ] = await Promise.all([
    safe(() => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, 'totalTrades'), BigInt(0)),
    safe(() => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, 'totalCommitments'), BigInt(0)),
    safe(() => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, 'getWinRate'), BigInt(0)),
    safe(() => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, 'wins'), BigInt(0)),
    safe(() => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, 'losses'), BigInt(0)),
    safe(() => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, 'totalPnlBps'), BigInt(0)),
    safe(() => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, 'pendingCount'), BigInt(0)),
    safe(() => callView(CONVICTION_ORACLE, ORACLE_INTERFACE, 'symbolCount'), BigInt(0)),
    safe(getEconomyStats, {
      totalDebates: '0',
      totalMcpCalls: '0',
      totalSignalAccesses: '0',
      totalVolumeWei: '0',
      totalVolumeOkb: '0',
      totalPayments: '0',
    }),
    safe(readMinBounty, { minBountyWei: '0', minBountyOkb: '0' }),
    safe(readNextBountyId, 1),
  ]);

  const winRate = Number(winRateBps) / 100;
  const pnlPct = Number(totalPnlBps) / 100;
  const totalBounties = Math.max(0, bountyNextId - 1);

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  return res.status(200).json({
    ok: true,
    protocol: 'Bobby Protocol',
    version: '3.0.0',
    chain: { id: XLAYER_CHAIN_ID, name: 'X Layer', rpc: XLAYER_RPC_URL },
    fetchedAt: new Date().toISOString(),

    reputation: {
      winRate,
      winRateRaw: winRateBps.toString(),
      totalTrades: Number(totalTrades),
      totalCommitments: Number(totalCommitments),
      pendingResolution: Number(pendingCount),
      wins: Number(wins),
      losses: Number(losses),
      cumulativePnlBps: Number(totalPnlBps),
      cumulativePnlPct: pnlPct,
    },

    oracle: {
      address: CONVICTION_ORACLE,
      symbolsTracked: Number(symbolCount),
    },

    economy: {
      address: BOBBY_AGENT_ECONOMY,
      totalDebates: Number(economyStats.totalDebates),
      totalMcpCalls: Number(economyStats.totalMcpCalls),
      totalSignalAccesses: Number(economyStats.totalSignalAccesses),
      totalVolumeOkb: economyStats.totalVolumeOkb,
      totalPayments: Number(economyStats.totalPayments),
    },

    bounties: {
      address: BOBBY_ADVERSARIAL_BOUNTIES,
      verified: true,
      totalPosted: totalBounties,
      minBountyOkb: bountyMin.minBountyOkb,
    },

    contracts: {
      trackRecord: TRACK_RECORD,
      convictionOracle: CONVICTION_ORACLE,
      agentEconomy: BOBBY_AGENT_ECONOMY,
      adversarialBounties: BOBBY_ADVERSARIAL_BOUNTIES,
    },

    links: {
      skillMd: 'https://bobbyprotocol.xyz/skill.md',
      mcpEndpoint: 'https://bobbyprotocol.xyz/api/mcp-http',
      judgeManifest: 'https://bobbyprotocol.xyz/ai-judge-manifest.json',
      submission: 'https://bobbyprotocol.xyz/submission',
      github: 'https://github.com/anthonysurfermx/Bobby-Agent-Trader',
    },
  });
}
