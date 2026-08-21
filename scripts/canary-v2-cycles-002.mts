// ============================================================
// canary-v2-cycles-002 — completes the Sepolia canary matrix after the
// canary-v2-001 BTC WIN: a real LOSS, a real stop-breach challenge, the
// ATTESTED (v1) route, and the NoBreach negative — all against the mined
// V2 with real Hermes evidence, via the production recorder path.
//
//   002  ETH long ±2%      → resolve LOSS on the first oracle dip after 1h
//   003  SOL long stop-15bp → breach watch → resolve WIN → challenge
//                             reclassifies WIN→LOSS (fallback: challenge
//                             the pending commitment if price never recovers)
//   004  OKB ATTESTED      → v1 route alive + D-1 ledgers never mix
//   neg  staticCall challenge with a non-breaching anchor → NoBreach
//
// Resumable: every step re-derives from on-chain state + a local JSON
// checkpoint, so re-running after a crash continues where it left off.
//
// Usage:  npx tsx scripts/canary-v2-cycles-002.mts run     (long-running)
//         npx tsx scripts/canary-v2-cycles-002.mts status  (read-only)
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { Contract, Interface, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes, formatUnits, formatEther } from 'ethers';

// --- env wiring (before importing chain-aware modules) — same as canary-v2-sepolia ---
process.env.PROTOCOL_CHAIN = 'base-sepolia';
process.env.BASE_SEPOLIA_TRACK_RECORD_ADDRESS ||= '0x4bfEF46d920fd67C68046901f591Fad0a2F7cadC';
process.env.BASE_SEPOLIA_RPC_URL ||= 'https://base-sepolia-rpc.publicnode.com';

const MAIN_ENV = '/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/.env.vercel.local';
function envFromSnapshot(name: string): string | undefined {
  try {
    const m = readFileSync(MAIN_ENV, 'utf8').match(new RegExp(`^${name}="?([^"\n]+)"?$`, 'm'));
    return m?.[1];
  } catch { return undefined; }
}
process.env.PYTH_HERMES_API_KEY ||= envFromSnapshot('PYTH_HERMES_API_KEY') || '';

const { commitV2, resolveV2 } = await import('../api/_lib/trackrecord-v2-recorder.ts');
const { DEFAULT_CHAIN } = await import('../api/_lib/chains.ts');
const { VERIFIED_FEEDS, buildHermesBenchmarkUrl, fetchSignedUpdate, toE8, PYTH_FEE_BUFFER_WEI } = await import('../api/_lib/trackrecord-v2.ts');

const TR = process.env.BASE_SEPOLIA_TRACK_RECORD_ADDRESS!;
const provider = new JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);

const LOG_PATH = '.ai/overnight/2026-08-18-canary-cycles-002.log';
const STATE_PATH = '.ai/overnight/canary-cycles-002-state.json';
mkdirSync(dirname(LOG_PATH), { recursive: true });

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { writeFileSync(LOG_PATH, line + '\n', { flag: 'a' }); } catch { /* log must never kill the run */ }
}

interface CycleState {
  breachTs?: number;        // SOL breach tick publishTime (challenge anchor)
  breachPx?: string;        // 1e8, for the report
  noBreachChecked?: boolean;
  challengeTx?: string;
  resolveTx?: string;
  commitTx?: string;
}
type State = Record<string, CycleState>;
function loadState(): State {
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); } catch { return {}; }
}
function saveState(s: State) { writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); }

const IFACE = new Interface([
  'function challengeStopBreach(bytes32 _debateHash, uint64 _anchorTs, bytes[] _breachUpdateData) payable',
  'error NoBreach()',
  'error AlreadyChallenged()',
  'error ChallengeNotApplicable()',
  'error ChallengeAnchorOutOfRange()',
]);
const reader = new Contract(TR, [
  'function getCommitment(uint256) view returns (tuple(bytes32 debateHash, uint96 entryPrice, uint96 targetPrice, uint64 committedAt, uint96 stopPrice, address recorder, uint64 minResolveAt, uint8 agent, uint8 conviction, bool resolved, uint8 mode, uint16 entryWindowSec, uint16 exitWindowSec, uint24 maxExitLagSec, uint24 challengeWindowSec, uint16 entryTolBps, uint16 exitTolBps, uint16 confMaxBps, tuple(bytes32 feedId, int64 price, uint64 conf, int32 expo, uint64 publishTime) entryEvidence, string symbol))',
  'function commitIndex(bytes32) view returns (uint256)',
  'function tradeIndex(bytes32) view returns (uint256)',
  'function totalCommitments() view returns (uint256)',
  'function getVerifiedScorecard() view returns (uint256,uint256,uint256,uint256,uint256,uint256)',
  'function getAttestedWinRate() view returns (uint256)',
  'function getCoverage(uint8) view returns (uint256,uint256,uint256)',
], provider);

const CYCLES = {
  loss:      { id: 'canary-v2-002', symbol: 'ETH', stopPct: 0.98,   targetPct: 1.02 },
  challenge: { id: 'canary-v2-003', symbol: 'SOL', stopPct: 0.9985, targetPct: 1.02 }, // stop -15 bps
  attested:  { id: 'canary-v2-004-attested', symbol: 'OKB' },
} as const;
const hashOf = (id: string) => keccak256(toUtf8Bytes(id));

const POLL_SEC = 25;
const RUN_DEADLINE_MS = Date.now() + 10 * 3600 * 1000; // give up after 10h and report
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

/** Freshest oracle tick for a verified symbol (benchmark at now-5). */
async function tickNow(symbol: string) {
  const at = Math.floor(Date.now() / 1000) - 5;
  const u = await fetchSignedUpdate(buildHermesBenchmarkUrl(VERIFIED_FEEDS[symbol], at));
  return { e8: toE8(u.price, u.expo), publishTime: u.publishTime };
}

async function okbPrice(): Promise<number> {
  try {
    const r = await fetch('https://www.okx.com/api/v5/market/ticker?instId=OKB-USDT');
    const j = (await r.json()) as { data?: Array<{ last?: string }> };
    const px = Number(j.data?.[0]?.last);
    if (Number.isFinite(px) && px > 0) return px;
  } catch { /* fall through */ }
  return 0;
}

async function commitment(id: string) {
  const idx: bigint = await reader.commitIndex(hashOf(id));
  if (idx === 0n) return null;
  return await reader.getCommitment(idx - 1n);
}

async function ensureCommitted(key: string, state: State) {
  for (const c of [CYCLES.loss, CYCLES.challenge] as const) {
    if (await commitment(c.id)) { log(`${c.id}: already committed`); continue; }
    const t = await tickNow(c.symbol);
    const px = Number(formatUnits(t.e8, 8));
    log(`${c.id}: committing ${c.symbol} long @ ~${px.toFixed(4)} stop ${(px * c.stopPct).toFixed(4)} target ${(px * c.targetPct).toFixed(4)}`);
    const res = await commitV2(DEFAULT_CHAIN, key, {
      debateHash: hashOf(c.id), symbol: c.symbol, agent: 0, conviction: 7,
      entryPrice: px, targetPrice: px * c.targetPct, stopPrice: px * c.stopPct,
    });
    (state[c.id] ||= {}).commitTx = res.txHash;
    saveState(state);
    log(`${c.id}: COMMIT OK ${res.txHash} | oracle ${formatUnits(BigInt(res.oraclePriceE8!), 8)} pt=${res.oraclePublishTime}`);
  }
  const a = CYCLES.attested;
  if (!(await commitment(a.id))) {
    const px = await okbPrice();
    if (px === 0) { log(`${a.id}: OKX ticker unavailable — skipping ATTESTED commit this pass`); }
    else {
      log(`${a.id}: committing OKB ATTESTED @ ${px} (OKX spot)`);
      const res = await commitV2(DEFAULT_CHAIN, key, {
        debateHash: hashOf(a.id), symbol: a.symbol, agent: 0, conviction: 5,
        entryPrice: px, targetPrice: px * 1.03, stopPrice: px * 0.97,
      });
      (state[a.id] ||= {}).commitTx = res.txHash;
      saveState(state);
      log(`${a.id}: COMMIT OK ${res.txHash} (mode ${res.mode})`);
    }
  } else log(`${a.id}: already committed`);
}

/** staticCall the challenge with a non-breaching anchor — must revert NoBreach. */
async function noBreachNegative(key: string, state: State) {
  const st = (state[CYCLES.challenge.id] ||= {});
  if (st.noBreachChecked) return;
  const c = await commitment(CYCLES.challenge.id);
  if (!c) return;
  const anchor = Number(c.entryEvidence.publishTime); // first tick at/after entry = entry tick: above stop by construction
  const u = await fetchSignedUpdate(buildHermesBenchmarkUrl(VERIFIED_FEEDS.SOL, anchor));
  const data = IFACE.encodeFunctionData('challengeStopBreach', [hashOf(CYCLES.challenge.id), anchor, [u.updateData]]);
  try {
    await provider.call({ to: TR, data, value: PYTH_FEE_BUFFER_WEI, from: new Wallet(key).address });
    log('NEGATIVE TEST FAILED: non-breaching challenge did NOT revert — investigate before mainnet');
  } catch (e: unknown) {
    const err = e as { data?: string; info?: { error?: { data?: string } } };
    const revertData: string = err?.data ?? err?.info?.error?.data ?? '';
    const parsed = typeof revertData === 'string' && revertData.startsWith('0x') ? IFACE.parseError(revertData) : null;
    if (parsed?.name === 'NoBreach') {
      log('negative test PASSED: challenge with non-breaching anchor reverts NoBreach()');
      st.noBreachChecked = true;
      saveState(state);
    } else {
      log(`negative test: reverted but could not decode as NoBreach (${parsed?.name ?? revertData.slice(0, 10)}) — will retry`);
    }
  }
}

async function sendChallenge(key: string, anchorTs: number, state: State) {
  const st = (state[CYCLES.challenge.id] ||= {});
  const wallet = new Wallet(key, provider);
  const u = await fetchSignedUpdate(buildHermesBenchmarkUrl(VERIFIED_FEEDS.SOL, anchorTs));
  const data = IFACE.encodeFunctionData('challengeStopBreach', [hashOf(CYCLES.challenge.id), anchorTs, [u.updateData]]);
  const gas = await wallet.estimateGas({ to: TR, data, value: PYTH_FEE_BUFFER_WEI });
  const tx = await wallet.sendTransaction({ to: TR, data, value: PYTH_FEE_BUFFER_WEI, gasLimit: (gas * 13n) / 10n });
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error(`challenge tx ${tx.hash} reverted`);
  st.challengeTx = tx.hash;
  saveState(state);
  log(`CHALLENGE OK ${tx.hash} — breach tick ${formatUnits(toE8(u.price, u.expo), 8)} @ ${u.publishTime}`);
}

async function scorecard(): Promise<string> {
  const [wr, decided, resolved, expired, pending] = await reader.getVerifiedScorecard();
  const [ar, ae, ap] = await reader.getCoverage(0);
  const attWr = await reader.getAttestedWinRate();
  return `verified: winRate ${Number(wr) / 100}% decided ${decided} resolved ${resolved} expired ${expired} pending ${pending} | attested: winRate ${Number(attWr) / 100}% resolved ${ar} expired ${ae} pending ${ap}`;
}

// ---------------------------------------------------------------- main
const mode = process.argv[2] || 'status';

if (mode === 'status') {
  log(`TrackRecordV2 @ ${TR} — ${await scorecard()}`);
  for (const id of [CYCLES.loss.id, CYCLES.challenge.id, CYCLES.attested.id]) {
    const c = await commitment(id);
    log(`${id}: ${c ? `committed=${c.committedAt} resolved=${c.resolved}` : 'not committed'}`);
  }
  process.exit(0);
}

const key = process.env.BASE_SEPOLIA_RECORDER_KEY || envFromSnapshot('BASE_SEPOLIA_RECORDER_KEY');
if (!key) { console.error('recorder key not found (env or snapshot)'); process.exit(1); }
const recorderAddr = new Wallet(key).address;
const bal = await provider.getBalance(recorderAddr);
log(`recorder ${recorderAddr} balance ${formatEther(bal)} ETH (Sepolia)`);
// Base Sepolia gas runs ~0.006 gwei; the full matrix (~7 tx) costs <0.00004 ETH.
// 0.0003 ETH is ~8x that with real margin — the old 0.002 floor was far too high.
if (bal < 300_000_000_000_000n) { log('ABORT: recorder below 0.0003 ETH — top up Sepolia gas first'); process.exit(1); }

const state = loadState();
await ensureCommitted(key, state);
await noBreachNegative(key, state);

// -------- watch loop: LOSS dip (ETH), breach + recovery (SOL), ATTESTED (1h)
let done = { loss: false, challenge: false, attested: false };
let lastHeartbeat = 0;

while (!(done.loss && done.challenge && done.attested)) {
  if (Date.now() > RUN_DEADLINE_MS) { log(`DEADLINE after 10h — status: ${JSON.stringify(done)}. Re-run to continue.`); break; }
  const now = Math.floor(Date.now() / 1000);

  try {
    // ---- 002 ETH LOSS
    if (!done.loss) {
      const c = await commitment(CYCLES.loss.id);
      if (c?.resolved) { done.loss = true; log(`${CYCLES.loss.id}: resolved ✓`); }
      else if (c && now >= Number(c.minResolveAt)) {
        const entryE8 = toE8(BigInt(c.entryEvidence.price), Number(c.entryEvidence.expo));
        const t = await tickNow('ETH');
        const pnlBps = Number(((t.e8 - entryE8) * 10_000n) / entryE8);
        // −2 bps floor: the contract requires the result to match the SIGN of
        // its own integer pnl — stay clear of the 0-bps rounding boundary.
        if (pnlBps <= -2) {
          log(`${CYCLES.loss.id}: dip found ${formatUnits(t.e8, 8)} < entry ${formatUnits(entryE8, 8)} (${pnlBps} bps) — resolving LOSS`);
          const res = await resolveV2(DEFAULT_CHAIN, key, {
            debateHash: hashOf(CYCLES.loss.id), symbol: 'ETH',
            pnlBps, result: 2, // LOSS
            exitPrice: Number(formatUnits(t.e8, 8)), exitAt: t.publishTime,
          });
          (state[CYCLES.loss.id] ||= {}).resolveTx = res.txHash;
          saveState(state);
          done.loss = true;
          log(`${CYCLES.loss.id}: RESOLVE LOSS OK ${res.txHash}`);
        }
      }
    }

    // ---- 003 SOL breach watch + WIN + challenge
    if (!done.challenge) {
      const st = (state[CYCLES.challenge.id] ||= {});
      const c = await commitment(CYCLES.challenge.id);
      if (c) {
        const entryE8 = toE8(BigInt(c.entryEvidence.price), Number(c.entryEvidence.expo));
        const stopE8 = BigInt(c.stopPrice);
        if (c.resolved && st.challengeTx) { done.challenge = true; }
        else {
          const t = await tickNow('SOL');
          if (!st.breachTs && t.e8 <= stopE8) {
            st.breachTs = t.publishTime;
            st.breachPx = t.e8.toString();
            saveState(state);
            log(`${CYCLES.challenge.id}: BREACH observed ${formatUnits(t.e8, 8)} <= stop ${formatUnits(stopE8, 8)} @ ${t.publishTime}`);
          }
          const recoveryBps = Number(((t.e8 - entryE8) * 10_000n) / entryE8);
          if (st.breachTs && !c.resolved && now >= Number(c.minResolveAt) && recoveryBps >= 2) {
            // recovery above entry → resolve WIN, then reclassify via challenge
            log(`${CYCLES.challenge.id}: recovery ${formatUnits(t.e8, 8)} > entry — resolving WIN (+${recoveryBps} bps) to exercise reclassification`);
            const res = await resolveV2(DEFAULT_CHAIN, key, {
              debateHash: hashOf(CYCLES.challenge.id), symbol: 'SOL',
              pnlBps: recoveryBps, result: 1, // WIN
              exitPrice: Number(formatUnits(t.e8, 8)), exitAt: t.publishTime,
            });
            st.resolveTx = res.txHash;
            saveState(state);
            log(`${CYCLES.challenge.id}: RESOLVE WIN OK ${res.txHash} — challenging stop breach @ ${st.breachTs}`);
            await sendChallenge(key, st.breachTs, state);
            done.challenge = true;
          } else if (st.breachTs && !c.resolved && now >= Number(c.minResolveAt) + 4 * 3600) {
            // 4h without recovery → exercise the pending-challenge branch instead
            log(`${CYCLES.challenge.id}: no recovery 4h past minResolve — challenging the PENDING commitment`);
            await sendChallenge(key, st.breachTs, state);
            done.challenge = true;
          }
        }
      }
    }

    // ---- 004 OKB ATTESTED resolve
    if (!done.attested) {
      const c = await commitment(CYCLES.attested.id);
      if (c?.resolved) { done.attested = true; log(`${CYCLES.attested.id}: resolved ✓`); }
      else if (c && now >= Number(c.minResolveAt)) {
        const px = await okbPrice();
        if (px > 0) {
          // Same integer math as _checkAttestedCoherence, on e8 ints, so the
          // result we declare always matches the sign the contract derives.
          const entryE8 = BigInt(c.entryPrice);
          const exitE8 = BigInt(Math.round(px * 1e8));
          const pnlBps = Number(((exitE8 - entryE8) * 10_000n) / entryE8);
          const entry = Number(formatUnits(entryE8, 8));
          const result = pnlBps > 0 ? 1 : pnlBps < 0 ? 2 : 4;
          log(`${CYCLES.attested.id}: resolving ATTESTED ${entry} → ${px} (${pnlBps} bps, ${result === 1 ? 'WIN' : result === 2 ? 'LOSS' : 'BE'})`);
          const res = await resolveV2(DEFAULT_CHAIN, key, {
            debateHash: hashOf(CYCLES.attested.id), symbol: 'OKB',
            pnlBps, result, exitPrice: px, exitAt: now - 30,
          });
          (state[CYCLES.attested.id] ||= {}).resolveTx = res.txHash;
          saveState(state);
          done.attested = true;
          log(`${CYCLES.attested.id}: RESOLVE OK ${res.txHash}`);
        }
      } else if (!c) {
        // OKX ticker was down at commit time — retry the commit
        await ensureCommitted(key, state);
      }
    }
  } catch (e) {
    log(`loop error (will retry): ${(e as Error).message?.slice(0, 300)}`);
  }

  if (Date.now() - lastHeartbeat > 5 * 60 * 1000) {
    lastHeartbeat = Date.now();
    log(`heartbeat — ${JSON.stringify(done)} | ${await scorecard().catch(() => 'scorecard read failed')}`);
  }
  await sleep(POLL_SEC);
}

log(`FINAL — ${await scorecard()}`);
log(`state: ${JSON.stringify(loadState())}`);
