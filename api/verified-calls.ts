// ============================================================
// api/verified-calls.ts — the public, verifiable calls ledger.
//
// Reads BobbyTrackRecordV2 on Base Sepolia (canary) straight from chain:
// every call with its commit/resolve/challenge tx hashes, Pyth evidence
// (price + publishTime), mode (VERIFIED/ATTESTED), result and pnl. This is
// mainnet-announcement blocker #2 (Kimi red-team v3): proofs, not a dashboard.
// Re-point via env when mainnet ships.
// ============================================================
import { Contract, Interface, JsonRpcProvider, formatUnits } from 'ethers';

export const config = { maxDuration: 30 };

const RPC = process.env.BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';
const TR = process.env.BASE_SEPOLIA_TRACK_RECORD_ADDRESS || '0x4bfEF46d920fd67C68046901f591Fad0a2F7cadC';
const DEPLOY_BLOCK = Number(process.env.BASE_SEPOLIA_TRACK_RECORD_BLOCK || 45644200);
const EXPLORER = 'https://sepolia.basescan.org';
const TTL_MS = 60_000;
const LOG_CHUNK = 40_000;

const EVENTS = new Interface([
  'event TradeCommitted(uint256 indexed commitId, string symbol, uint8 indexed agent, uint8 conviction, uint256 entryPrice, bytes32 indexed debateHash, uint8 mode, bytes32 feedId, uint256 entryOraclePrice1e8, uint64 entryPublishTime, uint64 entryAt)',
  'event TradeResolved(uint256 indexed tradeId, string symbol, uint8 indexed agent, uint8 result, int256 pnlBps, uint8 conviction, bytes32 indexed debateHash, uint8 mode, uint64 exitAt, uint256 exitOraclePrice1e8, uint64 exitPublishTime)',
  'event TradeReclassified(uint256 indexed tradeId, bytes32 indexed debateHash, uint8 oldResult, uint8 newResult, int256 oldPnlBps, int256 newPnlBps, string reason)',
  'event StopBreachChallenged(bytes32 indexed debateHash, address indexed challenger, uint64 breachPublishTime, uint256 breachPrice1e8, bool wasResolved)',
  'event CommitmentExpired(uint256 indexed commitId, bytes32 indexed debateHash, string symbol)',
]);

const READS = [
  'function getVerifiedScorecard() view returns (uint256 winRateBps, uint256 decided, uint256 resolved, uint256 expired, uint256 pending)',
  'function getAttestedWinRate() view returns (uint256)',
  'function totalCommitments() view returns (uint256)',
  'function getCoverage(uint8 mode) view returns (uint256 resolved, uint256 expired, uint256 pending)',
];

const RESULT = ['PENDING', 'WIN', 'LOSS', 'EXPIRED', 'BREAK_EVEN'];
const MODE = ['ATTESTED', 'VERIFIED'];

interface CallRow {
  debateHash: string;
  symbol: string;
  mode: string;
  conviction: number;
  committedAt: string | null;      // ISO from block timestamp
  commitTx: string | null;
  entryOraclePrice: string | null; // decimal string (VERIFIED only)
  entryPublishTime: number | null;
  result: string;
  pnlBps: number | null;
  resolveTx: string | null;
  exitOraclePrice: string | null;
  exitPublishTime: number | null;
  reclassified: boolean;
  reclassifyReason: string | null;
  challengeTx: string | null;
  challenger: string | null;
}

let cache: { at: number; body: unknown } | null = null;

async function getLogsChunked(provider: JsonRpcProvider, from: number, to: number) {
  const all: Array<{ topics: readonly string[]; data: string; transactionHash: string; blockNumber: number }> = [];
  for (let start = from; start <= to; start += LOG_CHUNK) {
    const end = Math.min(start + LOG_CHUNK - 1, to);
    const logs = await provider.getLogs({ address: TR, fromBlock: start, toBlock: end });
    all.push(...logs);
  }
  return all;
}

export default async function handler(req: any, res: any) {
  try {
    if (cache && Date.now() - cache.at < TTL_MS) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return res.status(200).json(cache.body);
    }

    const provider = new JsonRpcProvider(RPC);
    const reader = new Contract(TR, READS, provider);
    const latest = await provider.getBlockNumber();

    const [logs, scorecard, attestedWr, total, attCoverage] = await Promise.all([
      getLogsChunked(provider, DEPLOY_BLOCK, latest),
      reader.getVerifiedScorecard(),
      reader.getAttestedWinRate(),
      reader.totalCommitments(),
      reader.getCoverage(0),
    ]);

    const byHash = new Map<string, CallRow>();
    const blockTimes = new Map<number, number>();
    const needBlocks = new Set<number>();

    const parsed = logs
      .map((log) => {
        try { return { log, ev: EVENTS.parseLog({ topics: [...log.topics], data: log.data }) }; }
        catch { return null; }
      })
      .filter((x): x is NonNullable<typeof x> => !!x && !!x.ev);

    for (const { log, ev } of parsed) {
      if (ev!.name === 'TradeCommitted') needBlocks.add(log.blockNumber);
    }
    await Promise.all(
      [...needBlocks].map(async (bn) => {
        const b = await provider.getBlock(bn);
        if (b) blockTimes.set(bn, Number(b.timestamp));
      }),
    );

    for (const { log, ev } of parsed) {
      const a = ev!.args;
      if (ev!.name === 'TradeCommitted') {
        const mode = MODE[Number(a.mode)] ?? String(a.mode);
        byHash.set(a.debateHash, {
          debateHash: a.debateHash,
          symbol: a.symbol,
          mode,
          conviction: Number(a.conviction),
          committedAt: blockTimes.has(log.blockNumber)
            ? new Date(blockTimes.get(log.blockNumber)! * 1000).toISOString()
            : null,
          commitTx: log.transactionHash,
          entryOraclePrice: mode === 'VERIFIED' ? formatUnits(a.entryOraclePrice1e8, 8) : null,
          entryPublishTime: mode === 'VERIFIED' ? Number(a.entryPublishTime) : null,
          result: 'PENDING',
          pnlBps: null,
          resolveTx: null,
          exitOraclePrice: null,
          exitPublishTime: null,
          reclassified: false,
          reclassifyReason: null,
          challengeTx: null,
          challenger: null,
        });
      } else if (ev!.name === 'TradeResolved') {
        const row = byHash.get(a.debateHash);
        if (!row) continue;
        row.result = RESULT[Number(a.result)] ?? String(a.result);
        row.pnlBps = Number(a.pnlBps);
        row.resolveTx = log.transactionHash;
        if (row.mode === 'VERIFIED') {
          row.exitOraclePrice = formatUnits(a.exitOraclePrice1e8, 8);
          row.exitPublishTime = Number(a.exitPublishTime);
        }
      } else if (ev!.name === 'TradeReclassified') {
        const row = byHash.get(a.debateHash);
        if (!row) continue;
        row.result = RESULT[Number(a.newResult)] ?? String(a.newResult);
        row.pnlBps = Number(a.newPnlBps);
        row.reclassified = true;
        row.reclassifyReason = a.reason;
      } else if (ev!.name === 'StopBreachChallenged') {
        const row = byHash.get(a.debateHash);
        if (!row) continue;
        row.challengeTx = log.transactionHash;
        row.challenger = a.challenger;
      } else if (ev!.name === 'CommitmentExpired') {
        const row = byHash.get(a.debateHash);
        if (row) row.result = 'EXPIRED';
      }
    }

    const body = {
      chain: { id: 84532, name: 'Base Sepolia', canary: true },
      contract: TR,
      explorer: EXPLORER,
      scorecard: {
        verified: {
          winRateBps: Number(scorecard.winRateBps),
          decided: Number(scorecard.decided),
          resolved: Number(scorecard.resolved),
          expired: Number(scorecard.expired),
          pending: Number(scorecard.pending),
        },
        attested: {
          winRateBps: Number(attestedWr),
          resolved: Number(attCoverage.resolved),
          expired: Number(attCoverage.expired),
          pending: Number(attCoverage.pending),
        },
        totalCommitments: Number(total),
      },
      calls: [...byHash.values()].sort((x, y) => (y.committedAt || '').localeCompare(x.committedAt || '')),
      fetchedAt: new Date().toISOString(),
    };

    cache = { at: Date.now(), body };
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(body);
  } catch (e) {
    console.error('[VerifiedCalls]', e);
    return res.status(502).json({ error: 'onchain read failed' });
  }
}
