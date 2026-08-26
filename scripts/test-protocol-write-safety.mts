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

assert.equal(resolveProtocolChain(undefined).name, 'xlayer');
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

const xlayerRecordSource = readFileSync('api/xlayer-record.ts', 'utf8');
assert.match(xlayerRecordSource, /requireProtocolWriteSafety\(res, \['trackRecord'\]\)/);
assert.match(xlayerRecordSource, /recorderKeyEnvForChain\(DEFAULT_CHAIN\.id\)/);
// The interim 503 guard (requireCompatibleTrackRecordAdapter) was removed when
// the V2 adapter landed — its own removal condition. Its successor invariants:
// the endpoint must wire the V2 recorder, and the V2 recorder module must
// carry the same wrong-chain RPC guard the v1 paths use.
assert.match(xlayerRecordSource, /commitV2|resolveV2/);
assert.match(xlayerRecordSource, /readStatsV2/);
assert.doesNotMatch(xlayerRecordSource, /requireCompatibleTrackRecordAdapter/);
assert.match(
  readFileSync('api/_lib/trackrecord-v2-recorder.ts', 'utf8'),
  /assertProviderChain\(provider, chain\.id\)/,
);

for (const legacyWriter of ['api/generate-activity.ts', 'api/auto-bounty.ts']) {
  assert.match(readFileSync(legacyWriter, 'utf8'), /requireLegacyXLayerMode/);
}

const retiredDeploySource = readFileSync('api/deploy-hardness.ts', 'utf8');
assert.match(retiredDeploySource, /status\(410\)/);
assert.doesNotMatch(retiredDeploySource, /BOBBY_RECORDER_KEY|ContractFactory|sendTransaction/);

const cycleSource = readFileSync('api/bobby-cycle.ts', 'utf8');
// The legacy inline X Layer writer was removed entirely (stronger invariant
// than gating it): bobby-cycle must never sign or send transactions itself.
// All on-chain writes go through the authenticated, latch-guarded recorder
// endpoint (/api/xlayer-record) via a single awaited call site.
assert.doesNotMatch(cycleSource, /sendTransaction|new ethers\.Wallet|JsonRpcProvider/);
assert.doesNotMatch(cycleSource, /rpc\.xlayer\.tech/);
assert.equal((cycleSource.match(/action: 'commit'/g) || []).length, 1);
assert.match(cycleSource, /await fetchLocalApi\('\/api\/xlayer-record'/);
assert.match(cycleSource, /evaluateCommitPolicy\(/);
assert.match(cycleSource, /assessCommitReceipt\(/);
assert.match(cycleSource, /commitState === 'blocked'/);
assert.match(cycleSource, /PROTOCOL_CUTOVER_FREEZE/);
assert.match(cycleSource, /tradingAuthHeaders\(\)/);
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
assert.match(perpsSource, /isProtocolCutoverFrozen\(\)/);
assert.match(perpsSource, /serverLiveMutations/);

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
