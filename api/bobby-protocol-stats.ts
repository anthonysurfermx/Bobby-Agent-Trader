// ============================================================
// GET /api/bobby-protocol-stats
// Aggregated snapshot for the Bobby Protocol landing page.
// One request → all tickers, contracts, and on-chain live data.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { formatEther, Interface } from 'ethers';
import {
  BOBBY_ADVERSARIAL_BOUNTIES,
  BOBBY_AGENT_ECONOMY,
  XLAYER_CHAIN_ID,
  XLAYER_RPC_URL,
  getEconomyStats,
  listRecentBounties,
  readMinBounty,
  readNextBountyId,
} from './_lib/xlayer-payments.js';

export const config = { maxDuration: 30 };

const BOBBY_TREASURY = '0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea';
const CONVICTION_ORACLE = '0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A';
const TRACK_RECORD = '0xF841b428E6d743187D7BE2242eccC1078fdE2395';

const ORACLE_INTERFACE = new Interface([
  'function getStats() view returns (uint256,uint256,uint256)',
]);

const TRACK_RECORD_INTERFACE = new Interface([
  'function getStats() view returns (uint256,uint256,uint256)',
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

async function getContractLastActivity(address: string): Promise<number | null> {
  try {
    const block = await rpcCall<string>('eth_blockNumber', []);
    const latest = Number.parseInt(String(block), 16);
    const fromBlock = `0x${Math.max(0, latest - 5000).toString(16)}`;
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
  const data = ORACLE_INTERFACE.encodeFunctionData('getStats');
  const raw = await rpcCall<string>('eth_call', [{ to: CONVICTION_ORACLE, data }, 'latest']);
  const decoded = ORACLE_INTERFACE.decodeFunctionResult('getStats', raw);
  return {
    totalPredictions: decoded[0].toString(),
    totalResolved: decoded[1].toString(),
    totalCorrect: decoded[2].toString(),
  };
}

async function getTrackRecordStats() {
  const data = TRACK_RECORD_INTERFACE.encodeFunctionData('getStats');
  const raw = await rpcCall<string>('eth_call', [{ to: TRACK_RECORD, data }, 'latest']);
  const decoded = TRACK_RECORD_INTERFACE.decodeFunctionResult('getStats', raw);
  return {
    totalCommitted: decoded[0].toString(),
    totalRevealed: decoded[1].toString(),
    totalTrades: decoded[2].toString(),
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
  let prices: Array<{ symbol: string; price: number; change_24h_pct: number }> = [];
  if (Array.isArray(data.prices)) {
    prices = data.prices as typeof prices;
  } else if (data.briefing) {
    const match = data.briefing.match(/<LIVE_PRICES>\n(\[[\s\S]*?\])\n<\/LIVE_PRICES>/);
    if (match) {
      try {
        prices = JSON.parse(match[1]);
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
    safe(getOracleStats, { totalPredictions: '0', totalResolved: '0', totalCorrect: '0' }),
    safe(getTrackRecordStats, { totalCommitted: '0', totalRevealed: '0', totalTrades: '0' }),
    safe(readMinBounty, { minBountyWei: '0', minBountyOkb: '0' }),
    safe(readNextBountyId, 1),
    safe(() => listRecentBounties(6), []),
    safe(() => getContractLastActivity(BOBBY_AGENT_ECONOMY), null),
    safe(() => getContractLastActivity(BOBBY_ADVERSARIAL_BOUNTIES), null),
    safe(
      () => getPricesFromIntel(baseUrl),
      { prices: [], regime: null, xlayer: null }
    ),
  ]);

  const blockNumber = Number.parseInt(String(blockHexResult || '0x0'), 16) || 0;
  const treasuryWei = BigInt(treasuryHexResult || '0x0');

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
    },
    bounties: recentBounties,
    market: {
      prices: intel.prices,
      regime: intel.regime,
      xlayer: intel.xlayer,
    },
  });
}
