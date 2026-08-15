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
assert.equal(legacyXLayerWritesAllowed({ VERCEL_ENV: 'production', PROTOCOL_CUTOVER_FREEZE: 'true' }), false);

const frozenLegacy = evaluateProtocolWriteSafety(
  withContracts(XLAYER),
  {
    BOBBY_RECORDER_KEY: 'configured',
    VERCEL_ENV: 'production',
    PROTOCOL_CUTOVER_FREEZE: 'true',
  },
  [...required],
);
assert.equal(frozenLegacy.ok, false);
assert.ok(frozenLegacy.blockers.some((item) => item.includes('PROTOCOL_CUTOVER_FREEZE')));

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

const frozenBase = evaluateProtocolWriteSafety(
  withContracts(BASE),
  {
    PROTOCOL_WRITES_ENABLED: 'true',
    PROTOCOL_WRITE_CHAIN_ID: '8453',
    PROTOCOL_CUTOVER_FREEZE: 'true',
    VERCEL_ENV: 'production',
    BASE_RECORDER_KEY: 'configured',
  },
  [...required],
);
assert.equal(frozenBase.ok, false);
assert.ok(frozenBase.blockers.some((item) => item.includes('PROTOCOL_CUTOVER_FREEZE')));

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
assert.match(xlayerRecordSource, /recorderKeyEnvForChain\(DEFAULT_CHAIN\.id\)/);
assert.match(xlayerRecordSource, /TRACK_RECORD_V2_ABI/);
assert.match(xlayerRecordSource, /isTrackRecordV2\(DEFAULT_CHAIN\.id\)/);
assert.doesNotMatch(xlayerRecordSource, /requireCompatibleTrackRecordAdapter/);
assert.match(xlayerRecordSource, /LEGACY_XLAYER \? process\.env\.BOBBY_ORACLE_ADDRESS/);
assert.match(xlayerRecordSource, /\['trackRecord', 'convictionOracle', 'agentEconomy'\]/);

for (const legacyWriter of ['api/generate-activity.ts', 'api/auto-bounty.ts']) {
  assert.match(readFileSync(legacyWriter, 'utf8'), /requireLegacyXLayerMode/);
}

const retiredDeploySource = readFileSync('api/deploy-hardness.ts', 'utf8');
assert.match(retiredDeploySource, /status\(410\)/);
assert.doesNotMatch(retiredDeploySource, /BOBBY_RECORDER_KEY|ContractFactory|sendTransaction/);

const cycleSource = readFileSync('api/bobby-cycle.ts', 'utf8');
assert.match(cycleSource, /DEFAULT_CHAIN\.id === XLAYER_CHAIN_ID/);
assert.match(cycleSource, /legacyXLayerWritesAllowed\(\)/);
assert.match(cycleSource, /PROTOCOL_CUTOVER_FREEZE/);
assert.match(cycleSource, /tradingAuthHeaders\(\)/);
assert.match(cycleSource, /recordAuthHeaders\(\)/);
assert.match(cycleSource, /requireLiveCycleAuth\(req, res\)/);
assert.match(cycleSource, /chain: PROTOCOL_CHAIN_NAME/);
assert.match(cycleSource, /chain_id: DEFAULT_CHAIN\.id/);

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
assert.match(perpsSource, /body: JSON\.stringify\(precommitPayload\)/);
assert.doesNotMatch(perpsSource, /skipOnchainCommit|precommitConfirmed/);
assert.match(perpsSource, /acquireTradeExecutionClaim/);
assert.match(perpsSource, /clientOrderIdForDebateHash/);
assert.match(perpsSource, /markTradeExecutionSubmitted/);
assert.match(perpsSource, /internalCaller && !hasUserCreds/);
assert.match(perpsSource, /User-supplied OKX credentials cannot consume Bobby TrackRecord commitments/);

const recordSource = readFileSync('api/xlayer-record.ts', 'utf8');
assert.match(recordSource, /Commitment is already resolved and cannot authorize a new order/);
assert.match(recordSource, /Commitment is too old to authorize a new order/);

const provenanceMigration = readFileSync(
  'supabase/migrations/202608150001_chain_provenance_hardening.sql',
  'utf8',
);
const expiryGuardOffset = provenanceMigration.indexOf("clock_timestamp() >= timestamptz '2026-08-17 00:00:00+00'");
const firstWriteOffset = provenanceMigration.indexOf('create table if not exists');
assert.ok(expiryGuardOffset >= 0, 'provenance repair must carry a fixed pre-cutover expiry');
assert.ok(firstWriteOffset > expiryGuardOffset, 'provenance expiry must run before the first migration write');
assert.match(provenanceMigration, /Do not bypass this guard/);

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
assert.match(readinessSource, /Number\(parsed\?\.args\?\.\[7\]\) === 1/);
assert.match(readinessSource, /Base canary stored VERIFIED lifecycle carries canonical Pyth evidence/);
assert.match(readinessSource, /latestBlockTimestamp/);
assert.match(readinessSource, /const pausableKeys/);
assert.match(readinessSource, /OFFICIAL_BASE_PYTHS/);
assert.match(readinessSource, /OFFICIAL_BASE_FEEDS/);
assert.match(readinessSource, /activePyth\(\{ blockTag: receipt\.blockNumber \}\)/);
assert.match(readinessSource, /authenticated Hermes preflight returned canonical BTC evidence/);
assert.match(readinessSource, /trade_execution_claims grants, RLS and insert\/update\/delete round trip passed/);
assert.match(readinessSource, /shares a block with Pyth\/feed configuration changes/);

const finalizerSource = readFileSync('scripts/finalize-base-manifest.mts', 'utf8');
assert.match(finalizerSource, /eth_getTransactionByHash/);
assert.match(finalizerSource, /live calldata does not match/);

console.log('protocol write safety tests passed');
