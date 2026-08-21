// ============================================================
// canary-v2-complete — closes the matrix regardless of market direction.
//
// The 002/003 run stalled because ETH (+15%) and SOL (+11%) both rallied:
// a long never dips to a LOSS and never touches its stop, so the LOSS and
// stop-breach scenarios can't fire. This driver is direction-robust:
//
//   1. Resolve the pending 002 (ETH) and 003 (SOL) with their REAL oracle
//      result (both WINs in an up-market) — VERIFIED resolve for ETH+SOL.
//   2. Commit 005: a tight-stop LONG (stop −4 bps). At the tick level even a
//      pumping market wiggles that much within minutes → a real breach.
//   3. Resolve 005 WIN at a higher exit, then challengeStopBreach with the
//      breach tick → WIN→LOSS reclassification on-chain. That single cycle
//      delivers BOTH the challenge demo AND a VERIFIED LOSS (the reclassified
//      trade lands in the LOSS bucket) — no fake loss, a real oracle breach.
//
// Resumable: re-derives from on-chain state + a JSON checkpoint.
//
// Usage:  read -s BASE_SEPOLIA_RECORDER_KEY && export BASE_SEPOLIA_RECORDER_KEY
//         npx tsx scripts/canary-v2-complete.mts run
//         npx tsx scripts/canary-v2-complete.mts status
// ============================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Contract, Interface, JsonRpcProvider, Network, Wallet, keccak256, toUtf8Bytes, formatUnits } from 'ethers';

process.env.PROTOCOL_CHAIN = 'base-sepolia';
process.env.BASE_SEPOLIA_TRACK_RECORD_ADDRESS ||= '0x4bfEF46d920fd67C68046901f591Fad0a2F7cadC';
// publicnode was reliable for the original 002/003/004 commits; drpc raced on
// getBlock (null block right after announce). Use publicnode for the recorder.
process.env.BASE_SEPOLIA_RPC_URL ||= 'https://base-sepolia-rpc.publicnode.com';

const MAIN_ENV = '/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/.env.vercel.local';
function envFromSnapshot(name: string): string | undefined {
  try { return readFileSync(MAIN_ENV, 'utf8').match(new RegExp(`^${name}="?([^"\n]+)"?$`, 'm'))?.[1]; } catch { return undefined; }
}
process.env.PYTH_HERMES_API_KEY ||= envFromSnapshot('PYTH_HERMES_API_KEY') || '';

const { commitV2, resolveV2 } = await import('../api/_lib/trackrecord-v2-recorder.ts');
const { DEFAULT_CHAIN } = await import('../api/_lib/chains.ts');
const { VERIFIED_FEEDS, buildHermesBenchmarkUrl, fetchSignedUpdate, toE8, PYTH_FEE_BUFFER_WEI } = await import('../api/_lib/trackrecord-v2.ts');

const TR = process.env.BASE_SEPOLIA_TRACK_RECORD_ADDRESS!;
const NET = new Network('base-sepolia', 84532);
const RPCS = ['https://base-sepolia.drpc.org', 'https://base-sepolia-rpc.publicnode.com', 'https://sepolia.base.org'];
function provider(): JsonRpcProvider { return new JsonRpcProvider(RPCS[0], NET, { staticNetwork: NET }); }
const prov = provider();

const LOG = '.ai/overnight/2026-08-21-canary-complete.log';
const STATE = '.ai/overnight/canary-complete-state.json';
mkdirSync(dirname(LOG), { recursive: true });
function log(m: string) { const l = `[${new Date().toISOString()}] ${m}`; console.log(l); try { writeFileSync(LOG, l + '\n', { flag: 'a' }); } catch { /* */ } }

interface St { breachTs?: number; resolve002?: string; resolve003?: string; commit005?: string; breach005?: number; resolve005?: string; challenge005?: string; }
function load(): St { try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return {}; } }
function save(s: St) { writeFileSync(STATE, JSON.stringify(s, null, 2)); }

const IFACE = new Interface([
  'function challengeStopBreach(bytes32 _debateHash, uint64 _anchorTs, bytes[] _breachUpdateData) payable',
  'error NoBreach()', 'error AlreadyChallenged()', 'error ChallengeNotApplicable()', 'error ChallengeAnchorOutOfRange()',
]);
const reader = new Contract(TR, [
  'function commitIndex(bytes32) view returns (uint256)',
  'function tradeIndex(bytes32) view returns (uint256)',
  'function getCommitment(uint256) view returns (tuple(bytes32 debateHash, uint96 entryPrice, uint96 targetPrice, uint64 committedAt, uint96 stopPrice, address recorder, uint64 minResolveAt, uint8 agent, uint8 conviction, bool resolved, uint8 mode, uint16 entryWindowSec, uint16 exitWindowSec, uint24 maxExitLagSec, uint24 challengeWindowSec, uint16 entryTolBps, uint16 exitTolBps, uint16 confMaxBps, tuple(bytes32 feedId, int64 price, uint64 conf, int32 expo, uint64 publishTime) entryEvidence, string symbol))',
  'function getTrade(uint256) view returns (tuple(bytes32 debateHash, uint96 entryPrice, uint96 exitPrice, uint64 committedAt, uint64 resolvedAt, address recorder, uint8 agent, uint8 conviction, uint8 result, uint8 mode, int256 pnlBps, uint64 exitAt, uint64 challengeDeadline, bool stopChallenged, tuple(bytes32 feedId, int64 price, uint64 conf, int32 expo, uint64 publishTime) entryEvidence, tuple(bytes32 feedId, int64 price, uint64 conf, int32 expo, uint64 publishTime) exitEvidence, string symbol))',
  'function getVerifiedScorecard() view returns (uint256,uint256,uint256,uint256,uint256,uint256)',
  'function getCoverage(uint8) view returns (uint256,uint256,uint256)',
], prov);

const CHALLENGE = { id: 'canary-v2-005-challenge', symbol: 'BTC', stopPct: 0.9996, targetPct: 1.02 }; // stop −4 bps
const hashOf = (id: string) => keccak256(toUtf8Bytes(id));
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
const POLL = 20;
const DEADLINE = Date.now() + 4 * 3600 * 1000;

async function tick(symbol: string) {
  const at = Math.floor(Date.now() / 1000) - 5;
  const u = await fetchSignedUpdate(buildHermesBenchmarkUrl(VERIFIED_FEEDS[symbol], at));
  return { e8: toE8(u.price, u.expo), publishTime: u.publishTime };
}
async function commitment(id: string) { const idx: bigint = await reader.commitIndex(hashOf(id)); return idx === 0n ? null : reader.getCommitment(idx - 1n); }
function entryOracleE8(c: any): bigint { return toE8(BigInt(c.entryEvidence.price), Number(c.entryEvidence.expo)); }

/** Resolve a pending long VERIFIED cycle with its REAL oracle result. */
async function resolveReal(key: string, id: string, symbol: string, st: St, stKey: keyof St) {
  const c = await commitment(id);
  if (!c) { log(`${id}: no existe, skip`); return; }
  if (c.resolved) { log(`${id}: ya resuelto ✓`); return; }
  const now = Math.floor(Date.now() / 1000);
  if (now < Number(c.minResolveAt)) { log(`${id}: minResolveAt no alcanzado (faltan ${Number(c.minResolveAt) - now}s)`); return; }
  const entryE8 = entryOracleE8(c);
  const t = await tick(symbol);
  const pnlBps = Number(((t.e8 - entryE8) * 10_000n) / entryE8);
  const result = pnlBps > 0 ? 1 : pnlBps < 0 ? 2 : 4; // WIN/LOSS/BE
  log(`${id}: resolviendo REAL ${symbol} entry ${formatUnits(entryE8, 8)} → exit ${formatUnits(t.e8, 8)} (${pnlBps} bps, ${result === 1 ? 'WIN' : result === 2 ? 'LOSS' : 'BE'})`);
  const res = await resolveV2(DEFAULT_CHAIN, key, { debateHash: hashOf(id), symbol, pnlBps: pnlBps === 0 ? 1 : pnlBps, result, exitPrice: Number(formatUnits(t.e8, 8)), exitAt: t.publishTime });
  (st[stKey] as string) = res.txHash; save(st);
  log(`${id}: RESOLVE OK ${res.txHash}`);
}

async function sendChallenge(key: string, anchorTs: number, st: St) {
  const wallet = new Wallet(key, prov);
  const u = await fetchSignedUpdate(buildHermesBenchmarkUrl(VERIFIED_FEEDS.BTC, anchorTs));
  const data = IFACE.encodeFunctionData('challengeStopBreach', [hashOf(CHALLENGE.id), anchorTs, [u.updateData]]);
  const gas = await wallet.estimateGas({ to: TR, data, value: PYTH_FEE_BUFFER_WEI });
  const tx = await wallet.sendTransaction({ to: TR, data, value: PYTH_FEE_BUFFER_WEI, gasLimit: (gas * 13n) / 10n });
  const rcpt = await tx.wait();
  if (!rcpt || rcpt.status !== 1) throw new Error(`challenge ${tx.hash} reverted`);
  st.challenge005 = tx.hash; save(st);
  log(`CHALLENGE OK ${tx.hash} — breach tick ${formatUnits(toE8(u.price, u.expo), 8)} @ ${u.publishTime} → reclasifica WIN→LOSS`);
}

async function scorecard(): Promise<string> {
  const [wr, dec, res, exp, pen] = await reader.getVerifiedScorecard();
  const [ar, ae, ap] = await reader.getCoverage(0);
  return `VERIFIED winRate ${Number(wr) / 100}% decided ${dec} resolved ${res} expired ${exp} pending ${pen} | ATTESTED resolved ${ar} pending ${ap}`;
}

const mode = process.argv[2] || 'status';
if (mode === 'status') { log(`@${TR} — ${await scorecard()}`); process.exit(0); }

const rawKey = (process.env.BASE_SEPOLIA_RECORDER_KEY || envFromSnapshot('BASE_SEPOLIA_RECORDER_KEY') || '').trim();
// Normalize: tolerate a pasted key with/without 0x, stray whitespace/newline.
const key = rawKey && /^(0x)?[0-9a-fA-F]{64}$/.test(rawKey) ? (rawKey.startsWith('0x') ? rawKey : '0x' + rawKey) : '';
if (!key) {
  log(`ABORT: recorder key inválida (len=${rawKey.length}). Debe ser 64 hex (con o sin 0x). Re-corre: read -s BASE_SEPOLIA_RECORDER_KEY ; export BASE_SEPOLIA_RECORDER_KEY`);
  process.exit(1);
}
const recorderAddr = new Wallet(key).address;
log(`recorder ${recorderAddr}`);
const st = load();

// --- Step 1: resolve the stranded 002/003 with their real result
await resolveReal(key, 'canary-v2-002', 'ETH', st, 'resolve002');
await resolveReal(key, 'canary-v2-003', 'SOL', st, 'resolve003');

// --- Step 2: commit the tight-stop challenge cycle (if not yet)
if (!(await commitment(CHALLENGE.id))) {
  const t = await tick(CHALLENGE.symbol);
  const px = Number(formatUnits(t.e8, 8));
  log(`${CHALLENGE.id}: committing ${CHALLENGE.symbol} long @ ~${px.toFixed(2)} stop ${(px * CHALLENGE.stopPct).toFixed(2)} (−4bps) target ${(px * CHALLENGE.targetPct).toFixed(2)}`);
  const res = await commitV2(DEFAULT_CHAIN, key, { debateHash: hashOf(CHALLENGE.id), symbol: CHALLENGE.symbol, agent: 0, conviction: 7, entryPrice: px, targetPrice: px * CHALLENGE.targetPct, stopPrice: px * CHALLENGE.stopPct });
  st.commit005 = res.txHash; save(st);
  log(`${CHALLENGE.id}: COMMIT OK ${res.txHash} | oracle ${formatUnits(BigInt(res.oraclePriceE8!), 8)} pt=${res.oraclePublishTime}`);
} else log(`${CHALLENGE.id}: ya comiteado`);

// --- Step 3: watch for a breach, resolve WIN, then challenge → WIN→LOSS
let done = false;
let lastHb = 0;
while (!done) {
  if (Date.now() > DEADLINE) { log(`DEADLINE 4h — status: ${JSON.stringify(st)}. Re-run to continue.`); break; }
  try {
    const c = await commitment(CHALLENGE.id);
    if (c) {
      const entryE8 = entryOracleE8(c);
      const stopE8 = BigInt(c.stopPrice);
      const now = Math.floor(Date.now() / 1000);
      const t = await tick('BTC');
      // record the first breach tick (price <= stop) after entry
      if (!st.breach005 && t.e8 <= stopE8) { st.breach005 = t.publishTime; save(st); log(`${CHALLENGE.id}: BREACH ${formatUnits(t.e8, 8)} <= stop ${formatUnits(stopE8, 8)} @ ${t.publishTime}`); }
      if (c.resolved && st.challenge005) { done = true; }
      else if (st.breach005 && !c.resolved && now >= Number(c.minResolveAt)) {
        // resolve WIN at current (up) price, then challenge the breach
        const pnlBps = Number(((t.e8 - entryE8) * 10_000n) / entryE8);
        if (pnlBps >= 2) {
          log(`${CHALLENGE.id}: resolviendo WIN (+${pnlBps} bps) para luego reclasificar`);
          const res = await resolveV2(DEFAULT_CHAIN, key, { debateHash: hashOf(CHALLENGE.id), symbol: 'BTC', pnlBps, result: 1, exitPrice: Number(formatUnits(t.e8, 8)), exitAt: t.publishTime });
          st.resolve005 = res.txHash; save(st);
          log(`${CHALLENGE.id}: RESOLVE WIN ${res.txHash} — challenging breach @ ${st.breach005}`);
          await sendChallenge(key, st.breach005, st);
          done = true;
        } else {
          // price not up enough for a clean WIN — challenge the PENDING commitment (also → LOSS)
          log(`${CHALLENGE.id}: precio no da WIN limpio — challenge del PENDING @ ${st.breach005}`);
          await sendChallenge(key, st.breach005, st);
          done = true;
        }
      }
    }
  } catch (e) { log(`loop error (retry): ${(e as Error).message?.slice(0, 160)}`); }
  if (Date.now() - lastHb > 5 * 60 * 1000) { lastHb = Date.now(); log(`heartbeat — breach=${!!st.breach005} | ${await scorecard().catch(() => 'read fail')}`); }
  await sleep(POLL);
}

log(`FINAL — ${await scorecard()}`);
log(`state: ${JSON.stringify(load())}`);
