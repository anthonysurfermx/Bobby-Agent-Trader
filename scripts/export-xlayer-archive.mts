// ============================================================
// export-xlayer-archive — immutable snapshot of the X Layer v1 track record.
//
// Cutover step 11 (docs/audit/xlayer-to-base-cutover-sequence.md §2): the
// proof must not depend on the X Layer RPC answering forever. This exports
// the FULL ledger (every commitment + every trade) plus the aggregate stats,
// all read at a single pinned block, to a versioned JSON in docs/archive/.
//
// Read-only: eth_call only, no keys, no transactions.
//
// Usage:
//   npx tsx scripts/export-xlayer-archive.mts            # snapshot at latest block
//   XLAYER_RPC=<url> npx tsx scripts/export-xlayer-archive.mts
//
// Run once now for the provisional archive and AGAIN under
// PROTOCOL_CUTOVER_FREEZE (step 11) for the final one — the filename is
// pinned to the block number, so both runs coexist.
// ============================================================

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ethers } from 'ethers';

const RPC = process.env.XLAYER_RPC || 'https://rpc.xlayer.tech';
const CHAIN_ID = 196;

// Deployed X Layer addresses (chains.ts defaults — the archive pins them).
const TRACK_RECORD = process.env.XLAYER_TRACK_RECORD_ADDRESS || '0xF841b428E6d743187D7BE2242eccC1078fdE2395';
const CONVICTION_ORACLE = '0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A';
const AGENT_ECONOMY = '0xD9540D770C8aF67e9E6412C92D78E34bc11ED871';
const TREASURY = '0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea';

// Field order verified against the DEPLOYED contract (commitments(0) decoded
// by hand 2026-08-21) — matches contracts/src/BobbyTrackRecord.sol structs.
const ABI = [
  'function totalCommitments() view returns (uint256)',
  'function totalTrades() view returns (uint256)',
  'function wins() view returns (uint256)',
  'function losses() view returns (uint256)',
  'function getWinRate() view returns (uint256)',
  'function totalPnlBps() view returns (int256)',
  'function pendingCount() view returns (uint256)',
  'function getDecidedCount() view returns (uint256)',
  'function getAgentStats(uint8 _agent) view returns (uint256 _wins, uint256 _losses, uint256 _total, uint256 _winRate)',
  'function commitments(uint256) view returns (bytes32 debateHash, uint96 entryPrice, uint96 targetPrice, uint64 committedAt, uint96 stopPrice, address recorder, uint64 minResolveAt, uint8 agent, uint8 conviction, bool resolved, string symbol)',
  'function trades(uint256) view returns (bytes32 debateHash, uint96 entryPrice, uint96 exitPrice, uint64 committedAt, uint64 resolvedAt, address recorder, uint8 agent, uint8 conviction, uint8 result, int256 pnlBps, string symbol)',
];

const ECONOMY_ABI = [
  'function getEconomyStats() view returns (uint256 _totalDebates, uint256 _totalMCPCalls, uint256 _totalSignalAccesses, uint256 _totalVolume, uint256 _totalPayments)',
];

const AGENT_NAMES = ['cio', 'alpha', 'redteam'] as const;
const RESULT_NAMES = ['pending', 'win', 'loss', 'expired', 'break_even'] as const;

async function mapWithConcurrency<T>(
  count: number,
  limit: number,
  fn: (i: number) => Promise<T>,
): Promise<T[]> {
  const out = new Array<T>(count);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, count) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= count) return;
      out[i] = await fn(i);
      if (i > 0 && i % 250 === 0) console.log(`  ...${i}/${count}`);
    }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== CHAIN_ID) {
    throw new Error(`RPC answered chain ${net.chainId}, expected ${CHAIN_ID}`);
  }

  // Pin every read to one block so the snapshot is internally consistent.
  const block = await provider.getBlock('latest');
  if (!block) throw new Error('could not fetch latest block');
  const blockTag = block.number;
  console.log(`Snapshotting X Layer track record at block ${blockTag} (${new Date(block.timestamp * 1000).toISOString()})`);

  const track = new ethers.Contract(TRACK_RECORD, ABI, provider);
  const economy = new ethers.Contract(AGENT_ECONOMY, ECONOMY_ABI, provider);

  const [totalCommitments, totalTrades, wins, losses, winRateBps, totalPnlBps, pending] =
    await Promise.all([
      track.totalCommitments({ blockTag }),
      track.totalTrades({ blockTag }),
      track.wins({ blockTag }),
      track.losses({ blockTag }),
      track.getWinRate({ blockTag }),
      track.totalPnlBps({ blockTag }),
      track.pendingCount({ blockTag }),
    ]);

  // getDecidedCount() postdates the deployed X Layer bytecode — optional.
  let decided: bigint | null = null;
  try {
    decided = await track.getDecidedCount({ blockTag });
  } catch {
    console.warn('getDecidedCount() not present on deployed contract (expected on X Layer v1) — deriving from wins+losses');
  }

  let agents: Array<Record<string, string | number>> = [];
  try {
    agents = await Promise.all(
      AGENT_NAMES.map(async (name, i) => {
        const s = await track.getAgentStats(i, { blockTag });
        return { agent: name, wins: Number(s[0]), losses: Number(s[1]), total: Number(s[2]), winRateBps: Number(s[3]) };
      }),
    );
  } catch {
    console.warn('getAgentStats() unavailable on deployed contract — omitting per-agent stats');
  }

  let economyStats: Record<string, string | number> | null = null;
  try {
    const e = await economy.getEconomyStats({ blockTag });
    economyStats = {
      totalDebates: Number(e[0]),
      totalMCPCalls: Number(e[1]),
      totalSignalAccesses: Number(e[2]),
      totalVolumeWei: e[3].toString(),
      totalPayments: Number(e[4]),
    };
  } catch {
    console.warn('economy stats unavailable (non-critical)');
  }

  const nCommits = Number(totalCommitments);
  const nTrades = Number(totalTrades);

  console.log(`Exporting ${nCommits} commitments...`);
  const commitments = await mapWithConcurrency(nCommits, 8, async (i) => {
    const c = await track.commitments(i, { blockTag });
    return {
      index: i,
      debateHash: c.debateHash,
      symbol: c.symbol,
      agent: AGENT_NAMES[Number(c.agent)] ?? Number(c.agent),
      conviction: Number(c.conviction),
      entryPrice1e8: c.entryPrice.toString(),
      targetPrice1e8: c.targetPrice.toString(),
      stopPrice1e8: c.stopPrice.toString(),
      committedAt: Number(c.committedAt),
      minResolveAt: Number(c.minResolveAt),
      recorder: c.recorder,
      resolved: c.resolved,
    };
  });

  console.log(`Exporting ${nTrades} trades...`);
  const trades = await mapWithConcurrency(nTrades, 8, async (i) => {
    const t = await track.trades(i, { blockTag });
    return {
      index: i,
      debateHash: t.debateHash,
      symbol: t.symbol,
      agent: AGENT_NAMES[Number(t.agent)] ?? Number(t.agent),
      conviction: Number(t.conviction),
      entryPrice1e8: t.entryPrice.toString(),
      exitPrice1e8: t.exitPrice.toString(),
      committedAt: Number(t.committedAt),
      resolvedAt: Number(t.resolvedAt),
      recorder: t.recorder,
      result: RESULT_NAMES[Number(t.result)] ?? Number(t.result),
      pnlBps: t.pnlBps.toString(),
    };
  });

  const payload = {
    meta: {
      description: 'Immutable archive of the Bobby Protocol v1 track record on X Layer, exported before the Base cutover. Read-only evidence: every commitment and resolved trade as stored on-chain.',
      chainId: CHAIN_ID,
      chainName: 'X Layer',
      rpc: RPC,
      block: blockTag,
      blockTimestamp: block.timestamp,
      blockTimestampIso: new Date(block.timestamp * 1000).toISOString(),
      contracts: {
        trackRecord: TRACK_RECORD,
        convictionOracle: CONVICTION_ORACLE,
        agentEconomy: AGENT_ECONOMY,
        treasury: TREASURY,
      },
      explorer: `https://www.oklink.com/xlayer/address/${TRACK_RECORD}`,
    },
    stats: {
      totalCommitments: nCommits,
      totalTrades: nTrades,
      wins: Number(wins),
      losses: Number(losses),
      winRateBps: Number(winRateBps),
      totalPnlBps: Number(totalPnlBps),
      pendingCount: Number(pending),
      decidedCount: decided !== null ? Number(decided) : Number(wins) + Number(losses),
      byAgent: agents,
    },
    economy: economyStats,
    commitments,
    trades,
  };

  const json = JSON.stringify(payload, null, 2);
  const sha256 = createHash('sha256').update(json).digest('hex');

  const dir = resolve('docs/archive');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `xlayer-track-record-block-${blockTag}.json`);
  writeFileSync(file, json);
  writeFileSync(`${file}.sha256`, `${sha256}  ${file.split('/').pop()}\n`);

  console.log(`\nArchive written: ${file}`);
  console.log(`sha256: ${sha256}`);
  console.log(`Commitments: ${nCommits} | Trades: ${nTrades} | Win rate: ${Number(winRateBps) / 100}%`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
