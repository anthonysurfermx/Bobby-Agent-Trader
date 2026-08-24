// ============================================================
// snapshot-xlayer-trackrecord — immutable archive of the X Layer track record.
//
// Cutover §2: the 2,038-commitment history is the proof; it must not depend on
// the X Layer RPC answering forever. This exports the on-chain state to a
// versioned JSON in the repo BEFORE the flip. READ-ONLY — eth_call only, no
// keys, no writes.
//
// Everything is anchored to a single block number so any third party can
// re-derive every number from an X Layer archive node at that block.
//
// Run: npx tsx scripts/snapshot-xlayer-trackrecord.mts
// Output: docs/archive/xlayer-trackrecord-snapshot.json (stable path — the
// snapshot is re-runnable until the flip freezes it; git history versions it)
// ============================================================

import { writeFileSync, mkdirSync } from 'node:fs';
import { Contract, JsonRpcProvider } from 'ethers';

const RPC = process.env.XLAYER_RPC_URL || 'https://rpc.xlayer.tech';
const TRACK_RECORD = '0xF841b428E6d743187D7BE2242eccC1078fdE2395';
const CONVICTION_ORACLE = '0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A';
const AGENT_ECONOMY = '0xD9540D770C8aF67e9E6412C92D78E34bc11ED871';

const ABI = [
  'function getWinRate() view returns (uint256)',
  'function totalTrades() view returns (uint256)',
  'function totalCommitments() view returns (uint256)',
  'function pendingCount() view returns (uint256)',
  'function wins() view returns (uint256)',
  'function losses() view returns (uint256)',
  'function totalPnlBps() view returns (int256)',
  'function getAgentStats(uint8 _agent) view returns (uint256 _wins, uint256 _losses, uint256 _total, uint256 _winRate)',
  'function getRecentTrades(uint256 _count) view returns (tuple(bytes32 debateHash, uint96 entryPrice, uint96 exitPrice, uint64 committedAt, uint64 resolvedAt, address recorder, uint8 agent, uint8 conviction, uint8 result, int256 pnlBps, string symbol)[])',
];
const ECONOMY_ABI = [
  'function getEconomyStats() view returns (uint256 _totalDebates, uint256 _totalMCPCalls, uint256 _totalSignalAccesses, uint256 _totalVolume, uint256 _totalPayments)',
];

const AGENTS = ['CIO', 'ALPHA', 'REDTEAM'] as const;
const RESULTS = ['PENDING', 'WIN', 'LOSS', 'EXPIRED', 'BREAK_EVEN'] as const;

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== 196) throw new Error(`expected X Layer (196), RPC answered ${net.chainId}`);

  // Anchor: every call below is pinned to this block.
  const block = await provider.getBlock('latest');
  if (!block) throw new Error('no latest block');
  const tag = { blockTag: block.number };

  const tr = new Contract(TRACK_RECORD, ABI, provider);
  const economy = new Contract(AGENT_ECONOMY, ECONOMY_ABI, provider);

  const [winRate, totalTrades, totalCommitments, pendingCount, wins, losses, totalPnlBps] =
    await Promise.all([
      tr.getWinRate(tag), tr.totalTrades(tag), tr.totalCommitments(tag),
      tr.pendingCount(tag), tr.wins(tag), tr.losses(tag), tr.totalPnlBps(tag),
    ]);

  const agents: Record<string, unknown> = {};
  for (let i = 0; i < AGENTS.length; i++) {
    const [aWins, aLosses, aTotal, aWinRate] = await tr.getAgentStats(i, tag);
    agents[AGENTS[i]] = {
      wins: Number(aWins), losses: Number(aLosses),
      total: Number(aTotal), winRateBps: Number(aWinRate),
    };
  }

  // Last MAX_RECENT (100) resolved trades, full detail. The complete history
  // beyond that remains re-derivable on-chain at the anchored block — this is
  // the human-readable tail, not the proof itself.
  const recent = (await tr.getRecentTrades(100, tag)).map((t: Record<string, unknown>) => ({
    debateHash: String(t.debateHash),
    symbol: String(t.symbol),
    agent: AGENTS[Number(t.agent)] ?? String(t.agent),
    conviction: Number(t.conviction),
    result: RESULTS[Number(t.result)] ?? String(t.result),
    entryPriceE8: String(t.entryPrice),
    exitPriceE8: String(t.exitPrice),
    pnlBps: String(t.pnlBps),
    committedAt: Number(t.committedAt),
    resolvedAt: Number(t.resolvedAt),
    recorder: String(t.recorder),
  }));

  let economyStats: unknown = null;
  try {
    const [d, m, s, v, p] = await economy.getEconomyStats(tag);
    economyStats = {
      totalDebates: Number(d), totalMCPCalls: Number(m),
      totalSignalAccesses: Number(s), totalVolumeWei: String(v), totalPayments: Number(p),
    };
  } catch { /* economy stats are auxiliary — the track record is the point */ }

  const snapshot = {
    meta: {
      description: 'Immutable archive of the Bobby Protocol track record on X Layer, exported before the Base cutover. All values are re-derivable on-chain at the anchored block.',
      chainId: 196,
      chainName: 'X Layer',
      rpc: RPC,
      anchorBlock: block.number,
      anchorBlockHash: block.hash,
      anchorTimestamp: block.timestamp,
      anchorTimeISO: new Date(block.timestamp * 1000).toISOString(),
      contracts: { trackRecord: TRACK_RECORD, convictionOracle: CONVICTION_ORACLE, agentEconomy: AGENT_ECONOMY },
      explorer: `https://www.oklink.com/xlayer/address/${TRACK_RECORD}`,
    },
    totals: {
      totalCommitments: Number(totalCommitments),
      totalTrades: Number(totalTrades),
      pendingCount: Number(pendingCount),
      wins: Number(wins),
      losses: Number(losses),
      winRateBps: Number(winRate),
      totalPnlBps: String(totalPnlBps),
    },
    agents,
    economy: economyStats,
    recentTrades: recent,
  };

  mkdirSync('docs/archive', { recursive: true });
  const out = 'docs/archive/xlayer-trackrecord-snapshot.json';
  writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`snapshot → ${out}`);
  console.log(`  block ${block.number} (${snapshot.meta.anchorTimeISO})`);
  console.log(`  commitments=${snapshot.totals.totalCommitments} trades=${snapshot.totals.totalTrades} wins=${snapshot.totals.wins} losses=${snapshot.totals.losses} winRateBps=${snapshot.totals.winRateBps}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
