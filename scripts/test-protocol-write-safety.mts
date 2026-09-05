import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BASE,
  BASE_SEPOLIA,
  XLAYER,
  resolveProtocolChain,
  type ChainConfig,
} from '../api/_lib/chains.js';
import {
  assertProviderChain,
  evaluateProtocolWriteSafety,
  legacyXLayerWritesAllowed,
} from '../api/_lib/protocol-write-safety.js';

await assertProviderChain({ getNetwork: async () => ({ chainId: 8453n }) }, 8453);
await assert.rejects(
  assertProviderChain({ getNetwork: async () => ({ chainId: 196n }) }, 8453),
  /does not match expected 8453/,
);

function withContracts(chain: ChainConfig): ChainConfig {
  return {
    ...chain,
    protocolDeploymentBlock: 123,
    contracts: Object.fromEntries(
      Object.keys(chain.contracts).map((key, index) => [
        key,
        `0x${(index + 1).toString(16).padStart(40, '0')}`,
      ]),
    ) as unknown as ChainConfig['contracts'],
  };
}

assert.equal(resolveProtocolChain(undefined).name, 'base');
assert.throws(() => resolveProtocolChain('xlayer'), /retired/, 'X Layer can no longer be the protocol chain');
assert.equal(resolveProtocolChain('base').config.id, 8453);
assert.equal(resolveProtocolChain(' base-sepolia ').config.id, 84532);
assert.throws(() => resolveProtocolChain('base-mainnet'), /Invalid PROTOCOL_CHAIN/);

const required = ['trackRecord', 'convictionOracle', 'agentEconomy'] as const;

const legacy = evaluateProtocolWriteSafety(
  withContracts(XLAYER),
  { BOBBY_RECORDER_KEY: 'configured', VERCEL_ENV: 'production' },
  [...required],
);
assert.equal(legacy.ok, true, legacy.blockers.join(', '));

const previewLegacy = evaluateProtocolWriteSafety(
  withContracts(XLAYER),
  { BOBBY_RECORDER_KEY: 'configured', VERCEL_ENV: 'preview' },
  [...required],
);
assert.equal(previewLegacy.ok, false);
assert.ok(previewLegacy.blockers.some((item) => item.includes('X Layer writes require VERCEL_ENV=production')));
assert.equal(legacyXLayerWritesAllowed({ VERCEL_ENV: 'preview' }), false);
assert.equal(legacyXLayerWritesAllowed({ VERCEL_ENV: 'preview', ALLOW_NON_PROD_XLAYER_WRITES: 'true' }), true);

const legacyWrongKey = evaluateProtocolWriteSafety(
  withContracts(XLAYER),
  { BASE_RECORDER_KEY: 'configured', VERCEL_ENV: 'production' },
  [...required],
);
assert.equal(legacyWrongKey.ok, false);
assert.ok(legacyWrongKey.blockers.some((item) => item.includes('BOBBY_RECORDER_KEY')));

const unarmedBase = evaluateProtocolWriteSafety(
  withContracts(BASE),
  { BASE_RECORDER_KEY: 'configured' },
  [...required],
);
assert.equal(unarmedBase.ok, false);
assert.ok(unarmedBase.blockers.some((item) => item.includes('PROTOCOL_WRITES_ENABLED')));
assert.ok(unarmedBase.blockers.some((item) => item.includes('PROTOCOL_WRITE_CHAIN_ID')));

const wrongChain = evaluateProtocolWriteSafety(
  withContracts(BASE),
  {
    PROTOCOL_WRITES_ENABLED: 'true',
    PROTOCOL_WRITE_CHAIN_ID: '84532',
    BASE_RECORDER_KEY: 'configured',
  },
  [...required],
);
assert.equal(wrongChain.ok, false);

const armedBase = evaluateProtocolWriteSafety(
  withContracts(BASE),
  {
    PROTOCOL_WRITES_ENABLED: 'true',
    PROTOCOL_WRITE_CHAIN_ID: '8453',
    VERCEL_ENV: 'production',
    BASE_RECORDER_KEY: 'configured',
  },
  [...required],
);
assert.equal(armedBase.ok, true, armedBase.blockers.join(', '));
assert.equal(armedBase.recorderKeyEnv, 'BASE_RECORDER_KEY');

const armedSepolia = evaluateProtocolWriteSafety(
  withContracts(BASE_SEPOLIA),
  {
    PROTOCOL_WRITES_ENABLED: 'true',
    PROTOCOL_WRITE_CHAIN_ID: '84532',
    VERCEL_ENV: 'preview',
    BASE_SEPOLIA_RECORDER_KEY: 'configured',
  },
  [...required],
);
assert.equal(armedSepolia.ok, true, armedSepolia.blockers.join(', '));

const missingAddressChain = withContracts(BASE);
missingAddressChain.contracts.trackRecord = '';
const missingAddress = evaluateProtocolWriteSafety(
  missingAddressChain,
  {
    PROTOCOL_WRITES_ENABLED: 'true',
    PROTOCOL_WRITE_CHAIN_ID: '8453',
    VERCEL_ENV: 'production',
    BASE_RECORDER_KEY: 'configured',
  },
  ['trackRecord'],
);
assert.equal(missingAddress.ok, false);
assert.ok(missingAddress.blockers.some((item) => item.includes('trackRecord contract address')));

const previewBase = evaluateProtocolWriteSafety(
  withContracts(BASE),
  {
    PROTOCOL_WRITES_ENABLED: 'true',
    PROTOCOL_WRITE_CHAIN_ID: '8453',
    VERCEL_ENV: 'preview',
    BASE_RECORDER_KEY: 'configured',
  },
  [...required],
);
assert.equal(previewBase.ok, false);
assert.ok(previewBase.blockers.some((item) => item.includes('VERCEL_ENV=production')));

const protocolRecordSource = readFileSync('api/protocol-record.ts', 'utf8');
assert.match(protocolRecordSource, /requireProtocolWriteSafety\(res, \['trackRecord'\]\)/);
assert.match(protocolRecordSource, /recorderKeyEnvForChain\(DEFAULT_CHAIN\.id\)/);
// The interim 503 guard (requireCompatibleTrackRecordAdapter) was removed when
// the V2 adapter landed — its own removal condition. Its successor invariants:
// the endpoint must wire the V2 recorder, and the V2 recorder module must
// carry the same wrong-chain RPC guard the v1 paths use.
assert.match(protocolRecordSource, /commitV2|resolveV2/);
assert.match(protocolRecordSource, /readStatsV2/);
assert.doesNotMatch(protocolRecordSource, /requireCompatibleTrackRecordAdapter/);
assert.match(
  readFileSync('api/_lib/trackrecord-v2-recorder.ts', 'utf8'),
  /assertProviderChain\(provider, chain\.id\)/,
);

// 2026-09-03: the X Layer activity generators are retired outright (410),
// same shape as deploy-hardness — no signer, no provider, no contract call.
for (const legacyWriter of ['api/generate-activity.ts', 'api/auto-bounty.ts']) {
  const src = readFileSync(legacyWriter, 'utf8');
  assert.match(src, /status\(410\)/);
  assert.doesNotMatch(src, /BOBBY_RECORDER_KEY|new ethers\.Wallet|sendTransaction|assertProviderChain|requireLegacyXLayerMode/);
}

const retiredDeploySource = readFileSync('api/deploy-hardness.ts', 'utf8');
assert.match(retiredDeploySource, /status\(410\)/);
assert.doesNotMatch(retiredDeploySource, /BOBBY_RECORDER_KEY|ContractFactory|sendTransaction/);

const cycleSource = readFileSync('api/bobby-cycle.ts', 'utf8');
// The legacy inline X Layer writer was removed entirely (stronger invariant
// than gating it): bobby-cycle must never sign or send transactions itself.
// All on-chain writes go through the authenticated, latch-guarded recorder
// endpoint (/api/protocol-record) via a single awaited call site.
assert.doesNotMatch(cycleSource, /sendTransaction|new ethers\.Wallet|JsonRpcProvider/);
assert.doesNotMatch(cycleSource, /rpc\.xlayer\.tech/);
assert.equal((cycleSource.match(/action: 'commit'/g) || []).length, 1);
assert.match(cycleSource, /await fetchLocalApi\('\/api\/protocol-record'/);
assert.match(cycleSource, /evaluateCommitPolicy\(/);
assert.match(cycleSource, /assessCommitReceipt\(/);
assert.match(cycleSource, /commitState === 'blocked'/);
assert.match(cycleSource, /PROTOCOL_CUTOVER_FREEZE/);
assert.doesNotMatch(cycleSource, /tradingAuthHeaders\(\)|\/api\/okx-perps/); // no OKX auth path left in the cycle
assert.match(cycleSource, /recordAuthHeaders\(\)/);

const hardnessSource = readFileSync('api/_lib/hardness-registry.ts', 'utf8');
assert.match(hardnessSource, /REGISTRATION_STAKE\(\)/);
assert.doesNotMatch(hardnessSource, /parseEther\('0\.01'\)/);
assert.match(hardnessSource, /BASE_HARDNESS_SERVICE_PRICE_WEI/);
assert.match(hardnessSource, /if \(!isHardnessRegistryConfigured\(\)\) return null/);

const walletConfigSource = readFileSync('src/config/reown.ts', 'utf8');
assert.match(walletConfigSource, /networks: \[AppKitNetwork, \.\.\.AppKitNetwork\[\]\] = \[base,/);
assert.match(walletConfigSource, /defaultNetwork: base/);

const backendChainsSource = readFileSync('api/_lib/chains.ts', 'utf8');
assert.doesNotMatch(
  backendChainsSource,
  /TREASURY_ADDRESS_BASE \|\| '0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea'/,
);

const frontendChainsSource = readFileSync('src/config/chains.ts', 'utf8');
assert.match(frontendChainsSource, /VITE_TREASURY_ADDRESS_BASE/);
assert.doesNotMatch(frontendChainsSource, /treasury: '0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea'/);

const perpsSource = readFileSync('api/okx-perps.ts', 'utf8');
// 2026-09-03: every OKX account action (server or user credentials) is
// retired with 410 before any credential is selected.
assert.match(perpsSource, /if \(accountActions\.has\(action\)\) \{\s*return res\.status\(410\)/);

const gitignoreSource = readFileSync('.gitignore', 'utf8');
assert.match(gitignoreSource, /^\.env\*$/m);
assert.match(gitignoreSource, /^!\.env\.example$/m);

const safeBatchSource = readFileSync('scripts/build-safe-launch-batch.mts', 'utf8');
assert.match(safeBatchSource, /acceptOwnership/);
assert.match(safeBatchSource, /setPaused/);
assert.match(safeBatchSource, /key === 'agentRegistry'/);
assert.match(safeBatchSource, /txBuilderVersion/);
assert.match(safeBatchSource, /contractInputsValues/);
assert.match(safeBatchSource, /data: null/);
assert.doesNotMatch(safeBatchSource, /bobby-safe-batch-v1/);

const readinessSource = readFileSync('scripts/check-mainnet-readiness.mts', 'utf8');
assert.match(readinessSource, /OWNER_SAFE_OWNERS/);
assert.match(readinessSource, /hardnessScorer\(\)/);
assert.match(readinessSource, /receipt\.inputHash/);

// Third round (2026-09-05, deploy review P2) — EXECUTION test of the receipt hop: the
// manifest finalize:base-manifest writes (7 CREATE + 12 CALL, incl. the four treasury/bond
// calls) must pass --phase=postdeploy, and a manifest whose treasury/bond receipts were
// removed by hand must NOT. Built from the tracked manifest + the env example, in a temp root.
{
  const { spawnSync } = await import('node:child_process');
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync: rf } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { Interface, keccak256 } = await import('ethers');
  const envText = rf('deploy/base-mainnet.env.example', 'utf8');
  const env: Record<string, string> = {};
  for (const line of envText.split('\n')) { const m = line.match(/^([A-Z0-9_]+)=([^#]*)/); if (m) env[m[1]] = m[2].trim(); }
  const base = JSON.parse(rf('contracts/deployments/8453.json', 'utf8')) as Record<string, any>;
  const manifest = { ...base, treasury: env.BOUNTY_TREASURY_ADDRESS, fees: { ...base.fees, challengeBondWei: Number(env.CHALLENGE_BOND_WEI) }, v2Params: { entryWindowSec: 60, exitWindowSec: 120, maxExitLagSec: 600, challengeWindowSec: 604800, entryTolBps: 100, exitTolBps: 100, confMaxBps: 50 } };
  const a = manifest.addresses as Record<string, string>;
  let seq = 0;
  const receipt = (extra: Record<string, unknown>) => ({ hash: `0x${(++seq).toString(16).padStart(64, '1')}`, block: Number(manifest.deployBlock) + seq, blockHash: `0x${seq.toString(16).padStart(64, '2')}`, status: '0x1', ...extra });
  const enc = (abi: string, fn: string, args: unknown[]) => keccak256(new Interface([abi]).encodeFunctionData(fn, args));
  const creates = Object.entries(a).map(([name, addr]) => receipt({ transactionType: 'CREATE', contractName: name, contractAddress: addr, to: null, function: null, arguments: [], inputHash: '0x' }));
  creates[0].block = Number(manifest.deployBlock); // deployBlock = first mined receipt
  const call = (to: string, fn: string, arg: string, abi: string, name: string) => receipt({ transactionType: 'CALL', contractAddress: null, to, function: fn, arguments: [arg], inputHash: enc(abi, name, [arg]) });
  const treasuryCalls = [
    call(a.hardnessRegistry, 'setHardnessScorer(address)', manifest.roles.hardnessScorer, 'function setHardnessScorer(address)', 'setHardnessScorer'),
    call(a.adversarialBounties, 'setTreasury(address)', manifest.treasury, 'function setTreasury(address)', 'setTreasury'),
    call(a.hardnessRegistry, 'setTreasury(address)', manifest.treasury, 'function setTreasury(address)', 'setTreasury'),
    call(a.adversarialBounties, 'setChallengeBond(uint96)', String(manifest.fees.challengeBondWei), 'function setChallengeBond(uint96)', 'setChallengeBond'),
    call(a.hardnessRegistry, 'setBountyChallengeBond(uint96)', String(manifest.fees.challengeBondWei), 'function setBountyChallengeBond(uint96)', 'setBountyChallengeBond'),
  ];
  const handoffs = Object.values(a).map((to) => call(to, 'transferOwnership(address)', manifest.expectedOwner, 'function transferOwnership(address)', 'transferOwnership'));
  const run = (transactions: unknown[], label: string) => {
    const root = mkdtempSync(path.join(tmpdir(), `readiness-${label}-`));
    mkdirSync(path.join(root, 'contracts/deployments'), { recursive: true });
    writeFileSync(path.join(root, 'contracts/deployments/8453.json'), JSON.stringify({ ...manifest, transactions }));
    return spawnSync('npx', ['tsx', path.resolve('scripts/check-mainnet-readiness.mts'), '--phase=postdeploy'], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, ...env, BASE_PROTOCOL_DEPLOYMENT_BLOCK: String(manifest.deployBlock), XLAYER_RECORD_SECRET: 'x', TRADING_API_SECRET: 'x', PROTOCOL_AUTOMATION_SECRET: 'x', PYTH_HERMES_API_KEY: 'x' },
    });
  };
  const honest = run([...creates, ...treasuryCalls, ...handoffs], 'finalize-shape');
  assert.equal(honest.status, 0, `finalize-shaped manifest (19 receipts) must pass postdeploy:\n${honest.stdout}`);
  assert.doesNotMatch(honest.stdout, /unexpected or duplicate non-CREATE call/);
  const stripped = run([...creates, treasuryCalls[0], ...handoffs], 'readiness-shape');
  assert.notEqual(stripped.status, 0, 'a manifest whose treasury/bond receipts were removed must be NO-GO');
  assert.match(stripped.stdout, /exactly one setTreasury\(address\) call/);
  console.log('readiness postdeploy: finalize-shaped receipt evidence passes; stripped treasury receipts fail');
}

// G5 gate — EXECUTION test, not a source grep: run the predeploy checker with
// PYTH_HERMES_API_KEY absent and assert it is a hard NO-GO, then with it set
// and assert that specific blocker clears. Without the key the V2 recorder
// cannot fetch signed Hermes updates, so a deploy would be unfeedable.
{
  const { spawnSync } = await import('node:child_process');
  const runChecker = (extraEnv: Record<string, string | undefined>) =>
    spawnSync('npx', ['tsx', 'scripts/check-mainnet-readiness.mts', '--phase=predeploy'], {
      encoding: 'utf8',
      env: { ...process.env, PYTH_HERMES_API_KEY: undefined, ...extraEnv },
    });

  const withoutKey = runChecker({});
  assert.notEqual(withoutKey.status, 0, 'predeploy must exit non-zero without the Hermes key');
  assert.match(withoutKey.stdout, /PYTH_HERMES_API_KEY is missing/);
  assert.match(withoutKey.stdout, /NO-GO/);

  const withKey = runChecker({ PYTH_HERMES_API_KEY: 'test-key-not-real' });
  assert.doesNotMatch(withKey.stdout, /PYTH_HERMES_API_KEY is missing/);
  assert.match(withKey.stdout, /PYTH_HERMES_API_KEY configured/);
}

const finalizerSource = readFileSync('scripts/finalize-base-manifest.mts', 'utf8');
assert.match(finalizerSource, /eth_getTransactionByHash/);
assert.match(finalizerSource, /live calldata does not match/);

console.log('protocol write safety tests passed');
