// ============================================================
// canary-v2-sepolia — first REAL cycle against the mined V2 on Base Sepolia.
//
// Exercises the exact production recorder path (announce → wait for the
// derived anchor → real Hermes benchmark → commit; later: resolve with a
// real benchmark at the declared exit) against the REAL Pyth contract —
// the one class of confirmation mocks cannot give (A1-1's lesson).
//
// Usage (key stays in shell memory only — never in argv/history):
//   read -s BASE_SEPOLIA_RECORDER_KEY && export BASE_SEPOLIA_RECORDER_KEY
//   npx tsx scripts/canary-v2-sepolia.mts commit
//   ...wait >= minCommitAge (1h)...
//   npx tsx scripts/canary-v2-sepolia.mts resolve
//   npx tsx scripts/canary-v2-sepolia.mts status   (read-only, no key needed)
// ============================================================

import { readFileSync } from 'node:fs';
import { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes, formatUnits } from 'ethers';

// --- env wiring (before importing chain-aware modules) ---
process.env.PROTOCOL_CHAIN = 'base-sepolia';
process.env.BASE_SEPOLIA_TRACK_RECORD_ADDRESS ||= '0x4bfEF46d920fd67C68046901f591Fad0a2F7cadC';
process.env.BASE_SEPOLIA_RPC_URL ||= 'https://base-sepolia-rpc.publicnode.com';
if (!process.env.PYTH_HERMES_API_KEY) {
  // pull the key from the gitignored Vercel env snapshot at the main repo root
  try {
    const envFile = readFileSync('/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/.env.vercel.local', 'utf8');
    const m = envFile.match(/^PYTH_HERMES_API_KEY="?([^"\n]+)"?$/m);
    if (m) process.env.PYTH_HERMES_API_KEY = m[1];
  } catch { /* fall through — Hermes may still work if public */ }
}

const { commitV2, resolveV2, readStatsV2 } = await import('../api/_lib/trackrecord-v2-recorder.ts');
const { DEFAULT_CHAIN } = await import('../api/_lib/chains.ts');
const { VERIFIED_FEEDS, buildHermesBenchmarkUrl, fetchSignedUpdate, toE8 } = await import('../api/_lib/trackrecord-v2.ts');

const CANARY_ID = process.env.CANARY_ID || 'canary-v2-001';
const HASH = keccak256(toUtf8Bytes(CANARY_ID));
const TR = process.env.BASE_SEPOLIA_TRACK_RECORD_ADDRESS!;
const provider = new JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
const reader = new Contract(TR, [
  'function getCommitment(uint256) view returns (tuple(bytes32 debateHash, uint96 entryPrice, uint96 targetPrice, uint64 committedAt, uint96 stopPrice, address recorder, uint64 minResolveAt, uint8 agent, uint8 conviction, bool resolved, uint8 mode, uint16 entryWindowSec, uint16 exitWindowSec, uint24 maxExitLagSec, uint24 challengeWindowSec, uint16 entryTolBps, uint16 exitTolBps, uint16 confMaxBps, tuple(bytes32 feedId, int64 price, uint64 conf, int32 expo, uint64 publishTime) entryEvidence, string symbol))',
  'function commitIndex(bytes32) view returns (uint256)',
  'function totalCommitments() view returns (uint256)',
  'function winsVerified() view returns (uint256)',
  'function lossesVerified() view returns (uint256)',
  'function getVerifiedScorecard() view returns (uint256,uint256,uint256,uint256,uint256,uint256)',
], provider);

/** Current BTC price from the real Hermes (first tick at/after now-3). */
async function btcNowE8(): Promise<bigint> {
  const at = Math.floor(Date.now() / 1000) - 3;
  const u = await fetchSignedUpdate(buildHermesBenchmarkUrl(VERIFIED_FEEDS.BTC, at));
  return toE8(u.price, u.expo);
}

const mode = process.argv[2] || 'status';

if (mode === 'commit') {
  const key = process.env.BASE_SEPOLIA_RECORDER_KEY;
  if (!key) { console.error('export BASE_SEPOLIA_RECORDER_KEY first (read -s)'); process.exit(1); }
  console.log(`recorder: ${new Wallet(key).address}`);

  const px = Number(formatUnits(await btcNowE8(), 8));
  // Long BTC: stop -2%, target +2% — tight enough that either side can hit,
  // wide enough that the canary usually resolves on the declared exit.
  const entry = px, stop = px * 0.98, target = px * 1.02;
  console.log(`BTC (Hermes real): ${px.toFixed(2)} → entry ${entry.toFixed(2)} stop ${stop.toFixed(2)} target ${target.toFixed(2)}`);
  console.log(`hash: ${HASH} (${CANARY_ID})`);

  const t0 = Date.now();
  const res = await commitV2(DEFAULT_CHAIN, key, {
    debateHash: HASH, symbol: 'BTC', agent: 0, conviction: 7,
    entryPrice: entry, targetPrice: target, stopPrice: stop,
  });
  console.log(`\nCOMMIT OK in ${((Date.now() - t0) / 1000).toFixed(1)}s (announce + 10s anchor wait + commit)`);
  console.log(`  tx: ${res.txHash}`);
  console.log(`  mode: ${res.mode} | oracle entry: ${formatUnits(BigInt(res.oraclePriceE8!), 8)} | publishTime: ${res.oraclePublishTime}`);
  console.log(`\nresolve available after minCommitAge (1h): npx tsx scripts/canary-v2-sepolia.mts resolve`);
} else if (mode === 'resolve') {
  const key = process.env.BASE_SEPOLIA_RECORDER_KEY;
  if (!key) { console.error('export BASE_SEPOLIA_RECORDER_KEY first (read -s)'); process.exit(1); }

  const idx = await reader.commitIndex(HASH);
  if (idx === 0n) { console.error('no commitment for', CANARY_ID); process.exit(1); }
  const c = await reader.getCommitment(idx - 1n);
  const entryOracle = toE8(BigInt(c.entryEvidence.price), Number(c.entryEvidence.expo));
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec < Number(c.minResolveAt)) {
    console.error(`minResolveAt not reached — wait ${(Number(c.minResolveAt) - nowSec)}s more`);
    process.exit(1);
  }

  const exitAt = nowSec - 30; // declared exit: 30s ago, well inside maxExitLag(600)
  const u = await fetchSignedUpdate(buildHermesBenchmarkUrl(VERIFIED_FEEDS.BTC, exitAt));
  const exitOracle = toE8(u.price, u.expo);
  const pnlBps = Number((exitOracle - entryOracle) * 10_000n / entryOracle);
  const result = pnlBps > 0 ? 1 : pnlBps < 0 ? 2 : 4; // WIN / LOSS / BREAK_EVEN
  console.log(`entry ${formatUnits(entryOracle, 8)} → exit ${formatUnits(exitOracle, 8)} | pnl ${pnlBps} bps | result ${result === 1 ? 'WIN' : result === 2 ? 'LOSS' : 'BREAK_EVEN'}`);

  const res = await resolveV2(DEFAULT_CHAIN, key, {
    debateHash: HASH, symbol: 'BTC',
    pnlBps, result, exitPrice: Number(formatUnits(exitOracle, 8)), exitAt,
  });
  console.log(`RESOLVE OK — tx: ${res.txHash} | oracle exit pt: ${res.oraclePublishTime}`);
  const [wr, decided] = await reader.getVerifiedScorecard();
  console.log(`verified scorecard: winRate ${Number(wr) / 100}% over ${decided} decided`);
} else {
  const total = await reader.totalCommitments();
  const [wr, decided, resolved, expired, pending] = await reader.getVerifiedScorecard();
  console.log(`TrackRecordV2 @ ${TR} (Base Sepolia)`);
  console.log(`commitments: ${total} | verified: winRate ${Number(wr) / 100}% decided ${decided} resolved ${resolved} expired ${expired} pending ${pending}`);
  const idx = await reader.commitIndex(HASH);
  if (idx > 0n) {
    const c = await reader.getCommitment(idx - 1n);
    console.log(`${CANARY_ID}: resolved=${c.resolved} committedAt=${c.committedAt} minResolveAt=${c.minResolveAt} entry(pt=${c.entryEvidence.publishTime})`);
  } else {
    console.log(`${CANARY_ID}: not committed yet`);
  }
}
