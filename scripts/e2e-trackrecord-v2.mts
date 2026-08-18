// ============================================================
// E2E harness for the TrackRecord recorder — BOTH chain paths, no testnet.
//
// Orchestrator (no args): boots two anvil nodes + a local Hermes stub, deploys
// MockPyth + BobbyTrackRecordV2 (chain 84532) and v1 BobbyTrackRecord (chain
// 196), then spawns itself once per scenario with the env each path needs —
// the endpoint reads PROTOCOL_CHAIN at module load, so each scenario must be
// its own process.
//
//   --run=v2  Base-Sepolia path THROUGH the real handler: commit VERIFIED
//             (Hermes evidence) + ATTESTED, GET split-ledger stats, resolve
//             both, permissionless stop-breach challenge, TTL expiry, and the
//             Hermes-key matrix (absent key → VERIFIED fails clean, ATTESTED
//             unaffected).
//   --run=v1  X Layer path: GET stats and commit against v1 — proves the
//             legacy flow still works byte-identically after the V2 wiring.
//
// The Hermes stub serves updateData in the MockPyth ABI encoding
// (bytes32 id, int64 price, uint64 conf, int32 expo, uint64 pt, uint64 prev)
// with publishTime = the requested instant, exactly like real benchmarks. It
// enforces Authorization when told to, which is how the absent-key matrix runs.
//
// Run: npm run test:e2e:trackrecord-v2   (needs anvil + forge build artifacts)
// ============================================================

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { AbiCoder, Contract, ContractFactory, JsonRpcProvider, NonceManager, Wallet } from 'ethers';

const ACC0_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ACC1_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const RECORD_SECRET = 'e2e-record-secret';
const HERMES_KEY = 'e2e-hermes-key';
const V2_PORT = 8757;
const V1_PORT = 8758;
const STUB_PORT = 8759;

const FEED_BTC = '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43';
const FEED_ETH = '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace';
const FEED_SOL = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.error(`  x   ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

function artifact(rel: string): { abi: unknown[]; bytecode: string } {
  const j = JSON.parse(readFileSync(`contracts/out/${rel}`, 'utf8'));
  return { abi: j.abi, bytecode: j.bytecode.object };
}

// ─────────────────────────────────────────────────────────────
// Scenario driver helpers (child mode)
// ─────────────────────────────────────────────────────────────

interface FakeRes {
  statusCode: number;
  body: unknown;
  status(code: number): FakeRes;
  json(payload: unknown): FakeRes;
}
function makeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 0,
    body: undefined,
    status(code: number) { res.statusCode = code; return res; },
    json(payload: unknown) { res.body = payload; return res; },
  };
  return res;
}

async function callHandler(
  handler: (req: unknown, res: unknown) => Promise<unknown>,
  method: string,
  body?: unknown,
): Promise<FakeRes> {
  const res = makeRes();
  await handler({ method, headers: { 'x-record-secret': RECORD_SECRET }, body }, res);
  return res;
}

async function stubControl(path: string, payload: unknown): Promise<void> {
  await fetch(`http://127.0.0.1:${STUB_PORT}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ─────────────────────────────────────────────────────────────
// --run=v2 — Base-Sepolia path through the real handler
// ─────────────────────────────────────────────────────────────
async function runV2() {
  const { default: handler } = await import('../api/xlayer-record.ts');
  const { TRACKRECORD_V2_ABI, buildHermesBenchmarkUrl, fetchSignedUpdate, MIN_ENTRY_DELAY_SEC } =
    await import('../api/_lib/trackrecord-v2.ts');

  const provider = new JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
  const v2 = new Contract(
    process.env.BASE_SEPOLIA_TRACK_RECORD_ADDRESS!,
    [
      ...TRACKRECORD_V2_ABI,
      'function MIN_ENTRY_DELAY_SEC() view returns (uint64)',
      'function pendingCount() view returns (uint256)',
      'function winsVerified() view returns (uint256)',
      'function lossesVerified() view returns (uint256)',
      'function winsAttested() view returns (uint256)',
    ],
    new NonceManager(new Wallet(ACC1_KEY, provider)), // challenger/expirer ≠ bobby: permissionless surfaces
  );
  const warp = async (sec: number) => {
    await provider.send('evm_increaseTime', [sec]);
    await provider.send('evm_mine', []);
  };
  const now = async () => Number((await provider.getBlock('latest'))!.timestamp);

  // ── A4-1 drift guard: backend delay constant MUST equal the contract's ──
  check('MIN_ENTRY_DELAY_SEC parity (contract == backend)',
    Number(await v2.MIN_ENTRY_DELAY_SEC()) === MIN_ENTRY_DELAY_SEC);

  // ── commit VERIFIED (BTC) through the handler ──
  await stubControl('/__price', { priceE8: (65000n * 10n ** 8n).toString() });
  const c1 = await callHandler(handler, 'POST', {
    action: 'commit', threadId: 'e2e-btc-1', symbol: 'BTC', agent: 'cio', conviction: 7,
    entryPrice: 65000, targetPrice: 70000, stopPrice: 60000, direction: 'long',
  });
  check('VERIFIED commit → 200', c1.statusCode === 200, c1.body);
  check('VERIFIED commit mode', (c1.body as { mode?: string })?.mode === 'VERIFIED');
  check('VERIFIED commit carries oracle evidence', !!(c1.body as { data?: { oraclePriceE8?: string } })?.data?.oraclePriceE8);

  // ── commit ATTESTED (OKB) through the handler — no oracle involvement ──
  const c2 = await callHandler(handler, 'POST', {
    action: 'commit', threadId: 'e2e-okb-1', symbol: 'OKB', agent: 'alpha', conviction: 5,
    entryPrice: 50, targetPrice: 60, stopPrice: 45, direction: 'long',
  });
  check('ATTESTED commit → 200', c2.statusCode === 200, c2.body);
  check('ATTESTED commit mode', (c2.body as { mode?: string })?.mode === 'ATTESTED');

  // ── two more VERIFIED commits directly via the recorder (challenge + expiry fodder) ──
  const { commitV2 } = await import('../api/_lib/trackrecord-v2-recorder.ts');
  const { DEFAULT_CHAIN } = await import('../api/_lib/chains.ts');
  const { keccak256, toUtf8Bytes } = await import('ethers');
  const h3 = keccak256(toUtf8Bytes('e2e-btc-challenge'));
  const h4 = keccak256(toUtf8Bytes('e2e-btc-expiry'));
  await commitV2(DEFAULT_CHAIN, ACC0_KEY, {
    debateHash: h3, symbol: 'BTC', agent: 0, conviction: 6,
    entryPrice: 65000, targetPrice: 70000, stopPrice: 60000,
  });
  await commitV2(DEFAULT_CHAIN, ACC0_KEY, {
    debateHash: h4, symbol: 'BTC', agent: 2, conviction: 4,
    entryPrice: 65000, targetPrice: 70000, stopPrice: 60000,
  });
  check('4 commitments pending', Number(await v2.pendingCount()) === 4);

  // ── GET stats through the handler: split ledgers, D-1 shape ──
  const g1 = await callHandler(handler, 'GET');
  const gBody = g1.body as { stats?: { verified?: { pending?: number }; attestedWinRate?: number } };
  check('GET stats → 200', g1.statusCode === 200, g1.body);
  check('GET stats has split ledgers', gBody?.stats?.verified !== undefined && gBody?.stats?.attestedWinRate !== undefined);
  check('GET stats pending = 3 verified', gBody?.stats?.verified?.pending === 3, gBody?.stats);

  // ── resolve both after minCommitAge (1h) ──
  await warp(3700);
  const exitAtV = (await now()) - 10;
  await stubControl('/__price', { priceE8: (66000n * 10n ** 8n).toString() });
  const r1 = await callHandler(handler, 'POST', {
    action: 'resolve', threadId: 'e2e-btc-1', symbol: 'BTC',
    pnlBps: 1.53, result: 'win', exitPrice: 66000, exitAt: exitAtV,
  });
  check('VERIFIED resolve → 200', r1.statusCode === 200, r1.body);
  check('VERIFIED resolve mode', (r1.body as { mode?: string })?.mode === 'VERIFIED');
  check('verified win recorded', Number(await v2.winsVerified()) === 1);

  const r2 = await callHandler(handler, 'POST', {
    action: 'resolve', threadId: 'e2e-okb-1', symbol: 'OKB',
    pnlBps: 10, result: 'win', exitPrice: 55, exitAt: (await now()) - 5,
  });
  check('ATTESTED resolve → 200', r2.statusCode === 200, r2.body);
  check('attested win recorded (separate ledger)', Number(await v2.winsAttested()) === 1);
  check('verified ledger untouched by attested resolve', Number(await v2.winsVerified()) === 1);

  // ── VERIFIED resolve without exitAt must be rejected before any tx ──
  const rBad = await callHandler(handler, 'POST', {
    action: 'resolve', threadId: 'e2e-btc-x', symbol: 'BTC',
    pnlBps: 1, result: 'win', exitPrice: 66000,
  });
  check('VERIFIED resolve without exitAt → 400', rBad.statusCode === 400, rBad.body);

  // ── permissionless stop-breach challenge on the pending h3 ──
  await stubControl('/__price', { priceE8: (59000n * 10n ** 8n).toString() }); // below the 60000 stop
  const anchorTs = (await now()) - 30;
  const breach = await fetchSignedUpdate(buildHermesBenchmarkUrl(FEED_BTC, anchorTs));
  const lossesBefore = Number(await v2.lossesVerified());
  const chTx = await v2.challengeStopBreach(h3, anchorTs, [breach.updateData], { value: 1000n });
  await chTx.wait();
  check('challenge lands a verified LOSS', Number(await v2.lossesVerified()) === lossesBefore + 1);
  check('challenge resolved the pending commitment', Number(await v2.pendingCount()) === 1);

  // ── TTL expiry on h4 (permissionless) ──
  await warp(31 * 24 * 3600);
  const expTx = await v2.expireCommitment(h4);
  await expTx.wait();
  const cov = await v2.getCoverage(1); // VERIFIED
  check('expiry recorded in verified coverage', Number(cov.expired) === 1, cov);
  check('nothing pending after expiry', Number(await v2.pendingCount()) === 0);

  // ── Hermes key matrix: absent key → VERIFIED fails clean, ATTESTED unaffected ──
  await stubControl('/__auth', { require: true });
  delete process.env.PYTH_HERMES_API_KEY;
  const cNoKey = await callHandler(handler, 'POST', {
    action: 'commit', threadId: 'e2e-btc-nokey', symbol: 'ETH', agent: 'cio', conviction: 5,
    entryPrice: 3000, targetPrice: 3300, stopPrice: 2800, direction: 'long',
  });
  check('VERIFIED commit without Hermes key → 500', cNoKey.statusCode === 500, cNoKey.body);
  check('error names Hermes', String((cNoKey.body as { error?: string })?.error || '').includes('Hermes'));
  const cAttNoKey = await callHandler(handler, 'POST', {
    action: 'commit', threadId: 'e2e-doge-nokey', symbol: 'DOGE', agent: 'alpha', conviction: 3,
    entryPrice: 0.1, targetPrice: 0.12, stopPrice: 0.09, direction: 'long',
  });
  check('ATTESTED commit unaffected by missing key', cAttNoKey.statusCode === 200, cAttNoKey.body);

  // ── A5-1 case 1: chain clock BEHIND the process clock ──
  // evm_setTime rewinds anvil's clock; interval mining keeps it flowing from
  // there. The recorder must wait on the CHAIN clock (a wall-clock wait would
  // send early and revert EntryInFuture).
  process.env.PYTH_HERMES_API_KEY = HERMES_KEY;
  await stubControl('/__auth', { require: false });
  // The stop-breach scenario above intentionally moved the oracle to 59k.
  // Restore the normal entry price so this test exercises clock skew only.
  await stubControl('/__price', { priceE8: (65000n * 10n ** 8n).toString() });
  const chainNow = await now();
  await provider.send('evm_setTime', [chainNow - 15]);
  await provider.send('evm_mine', []);
  const h5 = keccak256(toUtf8Bytes('e2e-btc-skew'));
  const skew = await commitV2(DEFAULT_CHAIN, ACC0_KEY, {
    debateHash: h5, symbol: 'BTC', agent: 0, conviction: 5,
    entryPrice: 65000, targetPrice: 70000, stopPrice: 60000,
  });
  check('clock-skew commit lands (chain-clock wait)', skew.mode === 'VERIFIED' && !!skew.txHash);

  // ── A5-1 case 2: Hermes serves the anchor's first tick LATE ──
  await stubControl('/__late', { count: 3 }); // refuse the first 3 benchmark hits
  const h6 = keccak256(toUtf8Bytes('e2e-btc-late-hermes'));
  const late = await commitV2(DEFAULT_CHAIN, ACC0_KEY, {
    debateHash: h6, symbol: 'BTC', agent: 1, conviction: 5,
    entryPrice: 65000, targetPrice: 70000, stopPrice: 60000,
  });
  check('late-Hermes commit lands after retries', late.mode === 'VERIFIED' && !!late.txHash);
  const stats = await (await fetch(`http://127.0.0.1:${STUB_PORT}/__stats`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' })).json() as { lateRefused: number };
  check('Hermes retry path actually exercised', stats.lateRefused >= 3, stats);

  console.log(`\nV2 path: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

// ─────────────────────────────────────────────────────────────
// --run=v1 — X Layer legacy path stays intact
// ─────────────────────────────────────────────────────────────
async function runV1() {
  const { default: handler } = await import('../api/xlayer-record.ts');
  const provider = new JsonRpcProvider(process.env.XLAYER_RPC_URL);
  const v1 = new Contract(
    process.env.XLAYER_TRACK_RECORD_ADDRESS!,
    ['function totalCommitments() view returns (uint256)'],
    provider,
  );

  const g = await callHandler(handler, 'GET');
  const gBody = g.body as { stats?: { winRate?: number; totalTrades?: number }; version?: string };
  check('v1 GET stats → 200', g.statusCode === 200, g.body);
  check('v1 stats keep the legacy shape', gBody?.stats?.winRate !== undefined && gBody?.stats?.totalTrades === 0);
  check('v1 version string untouched', String(gBody?.version || '').includes('Commit-Reveal'));

  const c = await callHandler(handler, 'POST', {
    action: 'commit', threadId: 'e2e-v1-btc', symbol: 'BTC', agent: 'cio', conviction: 6,
    entryPrice: 65000, targetPrice: 70000, stopPrice: 60000, direction: 'long',
  });
  check('v1 commit → 200 broadcast', c.statusCode === 200 && (c.body as { broadcast?: boolean })?.broadcast === true, c.body);
  check('v1 commitment on-chain', Number(await v1.totalCommitments()) === 1);

  console.log(`\nv1 path: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

// ─────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────
async function orchestrate() {
  const children: ChildProcess[] = [];
  const kill = () => children.forEach((c) => { try { c.kill(); } catch { /* gone */ } });
  process.on('exit', kill);

  const waitRpc = async (url: string) => {
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
        });
        if (r.ok) return;
      } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`anvil at ${url} never came up`);
  };

  // Reproducibility on a clean checkout: the harness needs forge artifacts.
  // Build them if the mock is missing (fresh clone) — and let FORGE_BUILD=1
  // force a rebuild after contract edits.
  const needBuild = process.env.FORGE_BUILD === '1' || !(() => {
    try { readFileSync('contracts/out/BobbyTrackRecordV2.t.sol/MockPyth.json'); return true; }
    catch { return false; }
  })();
  if (needBuild) {
    console.log('forge build (artifacts missing or FORGE_BUILD=1)…');
    const fb = spawnSync('forge', ['build'], { cwd: 'contracts', stdio: 'inherit' });
    if (fb.status !== 0) { console.error('forge build failed'); process.exit(1); }
  }

  console.log('booting anvil x2 + hermes stub…');
  // --block-time 1: the chain clock ticks on its own (like a real chain), so
  // the recorder's chain-clock wait (A5-1) is exercised for real.
  children.push(spawn('anvil', ['--port', String(V2_PORT), '--chain-id', '84532', '--block-time', '1', '--silent'], { stdio: 'ignore' }));
  children.push(spawn('anvil', ['--port', String(V1_PORT), '--chain-id', '196', '--silent'], { stdio: 'ignore' }));
  await waitRpc(`http://127.0.0.1:${V2_PORT}`);
  await waitRpc(`http://127.0.0.1:${V1_PORT}`);

  // Hermes stub: publishTime = requested instant; MockPyth ABI encoding.
  const coder = AbiCoder.defaultAbiCoder();
  let stubPriceE8 = (65000n * 10n ** 8n).toString();
  let requireAuth = false;
  let lateRemaining = 0;   // A5-1: refuse this many benchmark requests (Hermes lag sim)
  let lateRefused = 0;
  const stub = createServer((req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${STUB_PORT}`);
    if (req.method === 'POST') {
      let raw = '';
      req.on('data', (d) => { raw += d; });
      req.on('end', () => {
        const body = JSON.parse(raw || '{}');
        if (url.pathname === '/__price') stubPriceE8 = String(body.priceE8);
        if (url.pathname === '/__auth') requireAuth = Boolean(body.require);
        if (url.pathname === '/__late') { lateRemaining = Number(body.count) || 0; }
        if (url.pathname === '/__stats') { res.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify({ lateRefused })); return; }
        res.writeHead(200).end('{}');
      });
      return;
    }
    if (requireAuth && req.headers.authorization !== `Bearer ${HERMES_KEY}`) {
      res.writeHead(401).end('{"error":"missing key"}');
      return;
    }
    if (lateRemaining > 0) {
      lateRemaining--; lateRefused++;
      res.writeHead(503).end('{"error":"benchmark not yet available"}');
      return;
    }
    const m = url.pathname.match(/\/v2\/updates\/price\/(\d+)$/);
    const feedId = url.searchParams.get('ids[]') || FEED_BTC;
    if (!m) { res.writeHead(404).end(); return; }
    const pt = Number(m[1]);
    const price = BigInt(stubPriceE8);
    const conf = price / 10_000n; // 10 bps — inside the 50 bps confMaxBps gate
    // A1-3: realistic ~1 Hz cadence — prev = pt-1, the shape live BTC/ETH/SOL
    // feeds actually produce. A prev of 0 would mask Unique-rule regressions.
    const updateData = coder.encode(
      ['bytes32', 'int64', 'uint64', 'int32', 'uint64', 'uint64'],
      [feedId, price, conf, -8, pt, Math.max(0, pt - 1)],
    );
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      binary: { data: [updateData.slice(2)] },
      parsed: [{ price: { price: price.toString(), conf: conf.toString(), expo: -8, publish_time: pt } }],
    }));
  });
  await new Promise<void>((r) => stub.listen(STUB_PORT, r));
  process.on('exit', () => stub.close());

  // ── deploy: MockPyth + V2 on 84532, v1 on 196 ──
  console.log('deploying contracts…');
  const p2 = new JsonRpcProvider(`http://127.0.0.1:${V2_PORT}`);
  const w2 = new NonceManager(new Wallet(ACC0_KEY, p2)); // local nonce tracking — anvil's 'pending' count lags right after a mine
  const bobbyAddr = new Wallet(ACC0_KEY).address;
  const mockPythArt = artifact('BobbyTrackRecordV2.t.sol/MockPyth.json');
  const v2Art = artifact('BobbyTrackRecordV2.sol/BobbyTrackRecordV2.json');
  const mockPyth = await (async () => {
    const f = new ContractFactory(mockPythArt.abi, mockPythArt.bytecode, w2);
    const c = await f.deploy(); await c.waitForDeployment(); return c;
  })();
  const v2Params = {
    entryWindowSec: 60, exitWindowSec: 120, maxExitLagSec: 600,
    challengeWindowSec: 7 * 24 * 3600, entryTolBps: 100, exitTolBps: 100, confMaxBps: 50,
  };
  const v2 = await (async () => {
    const f = new ContractFactory(v2Art.abi, v2Art.bytecode, w2);
    const c = await f.deploy(
      bobbyAddr, v2Params, [await mockPyth.getAddress()],
      ['BTC', 'ETH', 'SOL'], [FEED_BTC, FEED_ETH, FEED_SOL],
    );
    await c.waitForDeployment(); return c;
  })();
  const v2Addr = await v2.getAddress();

  const p1 = new JsonRpcProvider(`http://127.0.0.1:${V1_PORT}`);
  const w1 = new NonceManager(new Wallet(ACC0_KEY, p1));
  const v1Art = artifact('BobbyTrackRecord.sol/BobbyTrackRecord.json');
  const v1 = await (async () => {
    const f = new ContractFactory(v1Art.abi, v1Art.bytecode, w1);
    const c = await f.deploy(bobbyAddr); await c.waitForDeployment(); return c;
  })();
  const v1Addr = await v1.getAddress();
  console.log(`  V2 @ ${v2Addr} (mock pyth ${await mockPyth.getAddress()})\n  v1 @ ${v1Addr}`);

  // ── run scenarios as children (env frozen at import time) ──
  const run = (label: string, flag: string, env: Record<string, string>) => new Promise<number>((resolve) => {
    console.log(`\n== scenario: ${label} ==`);
    const child = spawn('npx', ['tsx', 'scripts/e2e-trackrecord-v2.mts', flag], {
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });
    children.push(child);
    child.on('exit', (code) => resolve(code ?? 1));
  });

  const v2Code = await run('Base-Sepolia / V2', '--run=v2', {
    PROTOCOL_CHAIN: 'base-sepolia',
    BASE_SEPOLIA_RPC_URL: `http://127.0.0.1:${V2_PORT}`,
    BASE_SEPOLIA_TRACK_RECORD_ADDRESS: v2Addr,
    BASE_SEPOLIA_RECORDER_KEY: ACC0_KEY,
    PROTOCOL_WRITES_ENABLED: 'true',
    PROTOCOL_WRITE_CHAIN_ID: '84532',
    XLAYER_RECORD_SECRET: RECORD_SECRET,
    PYTH_HERMES_BASE: `http://127.0.0.1:${STUB_PORT}`,
    PYTH_HERMES_API_KEY: HERMES_KEY,
    PYTH_FEE_BUFFER_WEI: '1000',
  });

  const v1Code = await run('X Layer / v1 (legacy intact)', '--run=v1', {
    XLAYER_RPC_URL: `http://127.0.0.1:${V1_PORT}`,
    XLAYER_TRACK_RECORD_ADDRESS: v1Addr,
    BOBBY_RECORDER_KEY: ACC0_KEY,
    XLAYER_RECORD_SECRET: RECORD_SECRET,
    ALLOW_NON_PROD_XLAYER_WRITES: 'true',
  });

  console.log(`\n=== E2E summary: v2=${v2Code === 0 ? 'PASS' : 'FAIL'} v1=${v1Code === 0 ? 'PASS' : 'FAIL'} ===`);
  process.exit(v2Code === 0 && v1Code === 0 ? 0 : 1);
}

const flag = process.argv.find((a) => a.startsWith('--run='));
if (flag === '--run=v2') runV2();
else if (flag === '--run=v1') runV1();
else orchestrate();
