import { existsSync, readFileSync } from 'node:fs';
import { Contract, Interface, JsonRpcProvider, Wallet, getAddress, id, keccak256 } from 'ethers';
import { fetchHermesPriceUpdate } from '../api/_lib/track-record-v2.js';

type Phase = 'predeploy' | 'postdeploy' | 'canary' | 'cutover';

const phaseArg = process.argv.find((arg) => arg.startsWith('--phase='));
const phase = (phaseArg?.split('=')[1] || 'cutover') as Phase;
if (!['predeploy', 'postdeploy', 'canary', 'cutover'].includes(phase)) {
  throw new Error(`Unknown phase ${phase}; use predeploy, postdeploy, canary, or cutover`);
}

const failures: string[] = [];
const warnings: string[] = [];
const passed: string[] = [];
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const OFFICIAL_BASE_PYTHS = [
  '0xbc16aee60f64864882bc6c4e428e148fc0e272f5',
  '0x8250f4af4b972684f7b336503e2d6dfedeb1487a',
] as const;
const OFFICIAL_BASE_FEEDS: Record<string, string> = {
  BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
};

function pass(label: string) {
  passed.push(label);
}

function fail(label: string) {
  failures.push(label);
}

function env(name: string): string {
  return (process.env[name] || '').trim();
}

function requireEnv(name: string, validator?: (value: string) => boolean) {
  const value = env(name);
  if (!value) return fail(`${name} is missing`);
  if (validator && !validator(value)) return fail(`${name} has an invalid format`);
  pass(`${name} configured`);
}

function validAddress(value: string): boolean {
  return ADDRESS_RE.test(value) && value.toLowerCase() !== ZERO_ADDRESS;
}

function uniqueAddresses(label: string, values: string[]) {
  const normalized = values.map((value) => value.toLowerCase());
  if (new Set(normalized).size !== normalized.length) fail(`${label} contains duplicate addresses`);
  else pass(`${label} addresses are unique`);
}

const roleNames = [
  'BOBBY_ADDRESS',
  'ALPHA_ADDRESS',
  'RED_ADDRESS',
  'CIO_ADDRESS',
  'RESOLVER_ADDRESS',
  'ARBITER_ADDRESS',
  'KEEPER_ADDRESS',
] as const;

requireEnv('OWNER_SAFE_ADDRESS', validAddress);
requireEnv('OWNER_SAFE_CODEHASH', (value) => BYTES32_RE.test(value) && !/^0x0+$/.test(value));
requireEnv('OWNER_SAFE_SINGLETON', validAddress);
const safeOwners = env('OWNER_SAFE_OWNERS')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
if (safeOwners.length !== 3) fail('OWNER_SAFE_OWNERS must contain exactly 3 addresses');
else if (safeOwners.some((value) => !validAddress(value))) fail('OWNER_SAFE_OWNERS contains an invalid address');
else {
  pass('Safe owner set contains exactly 3 valid addresses');
  uniqueAddresses('Safe owner set', safeOwners);
}
requireEnv('DEPLOYER_ADDRESS', validAddress);
requireEnv('TREASURY_ADDRESS_BASE', validAddress);
requireEnv('BASE_RECORDER_ADDRESS', validAddress);
for (const name of roleNames) requireEnv(name, validAddress);
requireEnv('HARDNESS_SCORER_ADDRESS', validAddress);
requireEnv('XLAYER_RECORD_SECRET');
requireEnv('TRADING_API_SECRET');
requireEnv('PROTOCOL_AUTOMATION_SECRET');
const mustRemainFrozen = phase !== 'cutover';
if (mustRemainFrozen && env('PROTOCOL_CUTOVER_FREEZE') !== 'true') {
  fail(`PROTOCOL_CUTOVER_FREEZE must equal true during ${phase}`);
} else if (!mustRemainFrozen && env('PROTOCOL_CUTOVER_FREEZE') !== 'false') {
  fail('PROTOCOL_CUTOVER_FREEZE must equal false in the reviewed target cutover configuration');
} else {
  pass(mustRemainFrozen
    ? 'backend protocol writers remain frozen'
    : 'target cutover configuration explicitly removes the freeze');
}

if (env('BASE_RECORDER_ADDRESS') && env('BOBBY_ADDRESS')) {
  if (env('BASE_RECORDER_ADDRESS').toLowerCase() !== env('BOBBY_ADDRESS').toLowerCase()) {
    fail('BASE_RECORDER_ADDRESS must equal BOBBY_ADDRESS authorized by the contracts');
  } else pass('Base recorder equals the on-chain bobby authorization role');
}

const economicRoles = ['ALPHA_ADDRESS', 'RED_ADDRESS', 'CIO_ADDRESS', 'RESOLVER_ADDRESS'].map(env).filter(Boolean);
if (economicRoles.length === 4) uniqueAddresses('economic roles', economicRoles);

const escrowRoles = ['CIO_ADDRESS', 'ARBITER_ADDRESS', 'KEEPER_ADDRESS', 'RESOLVER_ADDRESS'].map(env).filter(Boolean);
if (escrowRoles.length === 4) uniqueAddresses('escrow roles', escrowRoles);

if (env('OWNER_SAFE_ADDRESS') && env('KEEPER_ADDRESS')) {
  if (env('OWNER_SAFE_ADDRESS').toLowerCase() === env('KEEPER_ADDRESS').toLowerCase()) {
    fail('OWNER_SAFE_ADDRESS must not equal KEEPER_ADDRESS');
  } else {
    pass('Safe owner is separated from keeper');
  }
}

if (env('OWNER_SAFE_ADDRESS') && env('DEPLOYER_ADDRESS')) {
  if (env('OWNER_SAFE_ADDRESS').toLowerCase() === env('DEPLOYER_ADDRESS').toLowerCase()) {
    fail('OWNER_SAFE_ADDRESS must not equal DEPLOYER_ADDRESS');
  } else {
    pass('Safe owner is separated from deployer');
  }
}

if (env('DEPLOYER_ADDRESS') && env('KEEPER_ADDRESS')) {
  if (env('DEPLOYER_ADDRESS').toLowerCase() === env('KEEPER_ADDRESS').toLowerCase()) {
    fail('DEPLOYER_ADDRESS must not equal KEEPER_ADDRESS');
  } else {
    pass('deployer is separated from keeper');
  }
}

for (const [label, address] of [
  ['deployer', env('DEPLOYER_ADDRESS')],
  ['keeper', env('KEEPER_ADDRESS')],
  ['Base recorder', env('BASE_RECORDER_ADDRESS')],
] as const) {
  if (address && safeOwners.some((owner) => owner.toLowerCase() === address.toLowerCase())) {
    fail(`Safe owners must not include the ${label}`);
  } else if (address && safeOwners.length === 3) {
    pass(`Safe owners are separated from the ${label}`);
  }
}

const resolvers = env('RESOLVER_ADDRESSES')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
if (resolvers.length < 3) fail('RESOLVER_ADDRESSES must contain at least 3 addresses');
else if (resolvers.some((value) => !validAddress(value))) fail('RESOLVER_ADDRESSES contains an invalid address');
else {
  pass('resolver set has at least 3 valid addresses');
  uniqueAddresses('resolver set', resolvers);
}

for (const [label, address] of [
  ['Base treasury', env('TREASURY_ADDRESS_BASE')],
  ['Base recorder', env('BASE_RECORDER_ADDRESS')],
  ['deployer', env('DEPLOYER_ADDRESS')],
] as const) {
  if (address && resolvers.some((resolver) => resolver.toLowerCase() === address.toLowerCase())) {
    fail(`resolver set must not include the ${label}`);
  } else if (address && resolvers.length >= 3) {
    pass(`resolver set is separated from the ${label}`);
  }
}

const resolverThreshold = Number(env('RESOLVER_THRESHOLD'));
if (!Number.isInteger(resolverThreshold) || resolverThreshold < 2 || resolverThreshold > resolvers.length) {
  fail('RESOLVER_THRESHOLD must be an integer >=2 and <= resolver count');
} else {
  pass('resolver threshold is valid');
}

requireEnv('BASE_HARDNESS_SERVICE_PRICE_WEI', (value) => {
  if (!/^[1-9][0-9]*$/.test(value)) return false;
  try {
    return BigInt(value) <= ((1n << 128n) - 1n);
  } catch {
    return false;
  }
});

const uint96Max = (1n << 96n) - 1n;
const positiveUint96 = (value: string) => {
  if (!/^[1-9][0-9]*$/.test(value)) return false;
  try {
    return BigInt(value) <= uint96Max;
  } catch {
    return false;
  }
};

const positiveIntegerWithin = (max: bigint) => (value: string) => {
  if (!/^[1-9][0-9]*$/.test(value)) return false;
  try {
    return BigInt(value) <= max;
  } catch {
    return false;
  }
};

const verificationParamEnvByManifestKey: Record<string, string> = {
  entryWindowSec: 'V2_ENTRY_WINDOW_SEC',
  exitWindowSec: 'V2_EXIT_WINDOW_SEC',
  maxExitLagSec: 'V2_MAX_EXIT_LAG_SEC',
  challengeWindowSec: 'V2_CHALLENGE_WINDOW_SEC',
  entryTolBps: 'V2_ENTRY_TOL_BPS',
  exitTolBps: 'V2_EXIT_TOL_BPS',
  confMaxBps: 'V2_CONF_MAX_BPS',
};
for (const [key, name] of Object.entries(verificationParamEnvByManifestKey)) {
  const max = key === 'maxExitLagSec' || key === 'challengeWindowSec'
    ? (1n << 24n) - 1n
    : (1n << 16n) - 1n;
  requireEnv(name, positiveIntegerWithin(max));
}

for (const name of [
  'FEE_MCP_CALL_WEI',
  'FEE_DEBATE_PER_AGENT_WEI',
  'MIN_BOUNTY_WEI',
  'ABSOLUTE_MIN_BOUNTY_WEI',
  'REGISTRATION_STAKE_WEI',
] as const) {
  requireEnv(name, positiveUint96);
}

requireEnv('ESCROW_MAX_SIZE_USD', (value) => {
  if (!/^[1-9][0-9]*$/.test(value)) return false;
  try {
    return BigInt(value) <= 100_000_000n * 10n ** 18n;
  } catch {
    return false;
  }
});

if (positiveUint96(env('MIN_BOUNTY_WEI')) && positiveUint96(env('ABSOLUTE_MIN_BOUNTY_WEI'))) {
  if (BigInt(env('MIN_BOUNTY_WEI')) < BigInt(env('ABSOLUTE_MIN_BOUNTY_WEI'))) {
    fail('MIN_BOUNTY_WEI must be >= ABSOLUTE_MIN_BOUNTY_WEI');
  } else {
    pass('bounty floor ordering is valid');
  }
}

const manifestPath = 'contracts/deployments/8453.json';
let manifest: Record<string, any> | null = null;
if (phase !== 'predeploy') {
  if (!existsSync(manifestPath)) {
    fail(`${manifestPath} is missing`);
  } else {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, any>;
      pass('mainnet manifest parses');
    } catch {
      fail('mainnet manifest is not valid JSON');
    }
  }
}

const addressEnvByManifestKey: Record<string, string> = {
  trackRecord: 'BASE_TRACK_RECORD_ADDRESS',
  convictionOracle: 'BASE_ORACLE_ADDRESS',
  agentEconomyV2: 'BASE_AGENT_ECONOMY_ADDRESS',
  adversarialBounties: 'BASE_BOUNTIES_ADDRESS',
  hardnessRegistry: 'BASE_HARDNESS_REGISTRY_ADDRESS',
  agentRegistry: 'BASE_AGENT_REGISTRY_ADDRESS',
  intentEscrow: 'BASE_INTENT_ESCROW_ADDRESS',
};

const roleEnvByManifestKey: Record<string, string> = {
  bobby: 'BOBBY_ADDRESS',
  recorder: 'BASE_RECORDER_ADDRESS',
  alpha: 'ALPHA_ADDRESS',
  red: 'RED_ADDRESS',
  cio: 'CIO_ADDRESS',
  resolver: 'RESOLVER_ADDRESS',
  arbiter: 'ARBITER_ADDRESS',
  keeper: 'KEEPER_ADDRESS',
  hardnessScorer: 'HARDNESS_SCORER_ADDRESS',
};

const feeEnvByManifestKey: Record<string, string> = {
  mcpCallFeeWei: 'FEE_MCP_CALL_WEI',
  debateFeePerAgentWei: 'FEE_DEBATE_PER_AGENT_WEI',
  minBountyWei: 'MIN_BOUNTY_WEI',
  absoluteMinBountyWei: 'ABSOLUTE_MIN_BOUNTY_WEI',
  registrationStakeWei: 'REGISTRATION_STAKE_WEI',
  escrowMaxSizeUsd18dp: 'ESCROW_MAX_SIZE_USD',
};

if (manifest) {
  if (Number(manifest.chainId) !== 8453) fail('manifest chainId must equal 8453');
  else pass('manifest chainId is Base mainnet');
  if (!Number.isInteger(Number(manifest.deployBlock)) || Number(manifest.deployBlock) <= 0) {
    fail('manifest deployBlock must be greater than zero');
  } else {
    pass('manifest has a deployment block');
  }
  if (!validAddress(String(manifest.expectedOwner || ''))) fail('manifest expectedOwner is invalid');
  else if (String(manifest.expectedOwner).toLowerCase() !== env('OWNER_SAFE_ADDRESS').toLowerCase()) {
    fail('manifest expectedOwner does not match OWNER_SAFE_ADDRESS');
  } else pass('manifest expectedOwner matches the Safe');

  if (String(manifest.expectedOwnerCodehash || '').toLowerCase() !== env('OWNER_SAFE_CODEHASH').toLowerCase()) {
    fail('manifest expectedOwnerCodehash does not match OWNER_SAFE_CODEHASH');
  } else pass('manifest Safe codehash matches the pinned value');
  if (String(manifest.expectedOwnerSingleton || '').toLowerCase() !== env('OWNER_SAFE_SINGLETON').toLowerCase()) {
    fail('manifest expectedOwnerSingleton does not match OWNER_SAFE_SINGLETON');
  } else pass('manifest Safe singleton matches the pinned value');
  const normalizedManifestSafeOwners = Array.isArray(manifest.expectedOwnerOwners)
    ? manifest.expectedOwnerOwners.map((value: unknown) => String(value).toLowerCase()).sort()
    : [];
  const normalizedConfiguredSafeOwners = safeOwners.map((value) => value.toLowerCase()).sort();
  if (JSON.stringify(normalizedManifestSafeOwners) !== JSON.stringify(normalizedConfiguredSafeOwners)) {
    fail('manifest expectedOwnerOwners does not match OWNER_SAFE_OWNERS');
  } else pass('manifest pins the exact reviewed Safe owner set');
  if (String(manifest.deployer || '').toLowerCase() !== env('DEPLOYER_ADDRESS').toLowerCase()) {
    fail('manifest deployer does not match DEPLOYER_ADDRESS');
  } else pass('manifest deployer matches the reviewed deployer');

  const manifestAddresses = Object.entries(addressEnvByManifestKey).map(([key, envName]) => {
    const address = String(manifest?.addresses?.[key] || '');
    if (!validAddress(address)) fail(`manifest address ${key} is invalid`);
    const configured = env(envName);
    if (!configured) fail(`${envName} is missing`);
    else if (configured.toLowerCase() !== address.toLowerCase()) {
      fail(`${envName} does not match manifest addresses.${key}`);
    } else pass(`${envName} matches manifest`);
    return address;
  });
  if (manifestAddresses.every(validAddress)) uniqueAddresses('deployed contracts', manifestAddresses);

  for (const [key, envName] of Object.entries(roleEnvByManifestKey)) {
    if (String(manifest.roles?.[key] || '').toLowerCase() !== env(envName).toLowerCase()) {
      fail(`manifest roles.${key} does not match ${envName}`);
    } else pass(`${envName} matches manifest`);
  }

  for (const [key, envName] of Object.entries(feeEnvByManifestKey)) {
    if (String(manifest.fees?.[key] ?? '') !== env(envName)) {
      fail(`manifest fees.${key} does not match ${envName}`);
    } else pass(`${envName} matches manifest`);
  }

  for (const [key, envName] of Object.entries(verificationParamEnvByManifestKey)) {
    if (String(manifest.verificationParams?.[key] ?? '') !== env(envName)) {
      fail(`manifest verificationParams.${key} does not match ${envName}`);
    } else pass(`${envName} matches manifest`);
  }

  const manifestResolvers = Array.isArray(manifest.quorum?.resolvers)
    ? manifest.quorum.resolvers.map(String)
    : [];
  const normalizedManifestResolvers = manifestResolvers.map((value: string) => value.toLowerCase()).sort();
  const normalizedConfiguredResolvers = resolvers.map((value) => value.toLowerCase()).sort();
  if (JSON.stringify(normalizedManifestResolvers) !== JSON.stringify(normalizedConfiguredResolvers)) {
    fail('manifest quorum.resolvers does not match RESOLVER_ADDRESSES');
  } else pass('resolver set matches manifest');
  if (String(manifest.quorum?.threshold ?? '') !== env('RESOLVER_THRESHOLD')) {
    fail('manifest quorum.threshold does not match RESOLVER_THRESHOLD');
  } else pass('resolver threshold matches manifest');

  const manifestPyths = Array.isArray(manifest.oracle?.pyths)
    ? manifest.oracle.pyths.map((value: unknown) => String(value).toLowerCase())
    : [];
  if (JSON.stringify(manifestPyths) !== JSON.stringify(OFFICIAL_BASE_PYTHS)) {
    fail('manifest oracle.pyths does not equal the pinned official Base set in canonical order');
  } else pass('manifest pins the official upgraded Base Pyth and current fallback');
  if (String(manifest.oracle?.activePyth || '').toLowerCase() !== OFFICIAL_BASE_PYTHS[0]) {
    fail('manifest active Pyth is not the pinned official upgraded Base contract');
  } else pass('manifest active Pyth is the official upgraded Base contract');

  const receiptEvidence = Array.isArray(manifest.transactions) ? manifest.transactions : [];
  if (receiptEvidence.length !== 15) {
    fail('manifest must contain exactly 15 receipts (7 creates, scorer call, 7 ownership handoffs)');
  } else {
    const invalidReceipt = receiptEvidence.some((receipt: Record<string, unknown>) =>
      receipt.status !== '0x1' ||
      !/^0x[0-9a-fA-F]{64}$/.test(String(receipt.hash || '')) ||
      !/^0x[0-9a-fA-F]{64}$/.test(String(receipt.blockHash || '')) ||
      /^0x0+$/.test(String(receipt.blockHash || '')) ||
      !Number.isInteger(Number(receipt.block)) || Number(receipt.block) <= 0
    );
    if (invalidReceipt) fail('manifest contains invalid or non-canonical receipt evidence');
    else pass('all recorded broadcast receipts succeeded in canonical blocks');

    const firstReceiptBlock = Math.min(...receiptEvidence.map((receipt: Record<string, unknown>) => Number(receipt.block)));
    if (firstReceiptBlock !== Number(manifest.deployBlock)) {
      fail('manifest deployBlock does not equal the first mined broadcast receipt');
    } else pass('manifest deployBlock is derived from receipt evidence');

    const deployedEvidence = receiptEvidence.filter(
      (receipt: Record<string, unknown>) => receipt.transactionType === 'CREATE',
    );
    for (const [manifestKey] of Object.entries(addressEnvByManifestKey)) {
      const expected = String(manifest.addresses?.[manifestKey] || '').toLowerCase();
      const matches = deployedEvidence.filter(
        (receipt: Record<string, unknown>) => String(receipt.contractAddress || '').toLowerCase() === expected,
      );
      if (matches.length !== 1) fail(`receipt evidence must contain exactly one deployment for ${manifestKey}`);
      else pass(`receipt evidence covers ${manifestKey}`);
    }

    const callEvidence = receiptEvidence.filter(
      (receipt: Record<string, unknown>) => receipt.transactionType === 'CALL',
    );
    const ownershipInterface = new Interface(['function transferOwnership(address)']);
    const scorerInterface = new Interface(['function setHardnessScorer(address)']);
    const expectedCalls = [
      {
        to: String(manifest.addresses?.hardnessRegistry || ''),
        fn: 'setHardnessScorer(address)',
        argument: String(manifest.roles?.hardnessScorer || ''),
        inputHash: keccak256(scorerInterface.encodeFunctionData('setHardnessScorer', [manifest.roles?.hardnessScorer])),
      },
      ...Object.values(manifest.addresses || {}).map((to) => ({
        to: String(to),
        fn: 'transferOwnership(address)',
        argument: String(manifest.expectedOwner || ''),
        inputHash: keccak256(ownershipInterface.encodeFunctionData('transferOwnership', [manifest.expectedOwner])),
      })),
    ];
    for (const expected of expectedCalls) {
      const matches = callEvidence.filter((receipt: Record<string, unknown>) =>
        String(receipt.to || '').toLowerCase() === expected.to.toLowerCase() &&
        receipt.function === expected.fn &&
        String((receipt.arguments as unknown[] | undefined)?.[0] || '').toLowerCase() === expected.argument.toLowerCase() &&
        String(receipt.inputHash || '').toLowerCase() === expected.inputHash.toLowerCase()
      );
      if (matches.length !== 1) fail(`receipt evidence must contain exactly one ${expected.fn} call to ${expected.to}`);
      else pass(`receipt evidence covers ${expected.fn} on ${expected.to}`);
    }
    if (callEvidence.length !== expectedCalls.length) {
      fail('receipt evidence contains an unexpected or duplicate non-CREATE call');
    } else pass('receipt evidence contains only the reviewed scorer and ownership calls');

    if (manifest.receiptEvidence?.schema !== 'bobby-base-receipts-v2') {
      fail('manifest receiptEvidence schema is not finalized v2 evidence');
    } else if (Number(manifest.receiptEvidence?.chainId) !== 8453) {
      fail('manifest receiptEvidence chainId does not equal 8453');
    } else if (Number(manifest.receiptEvidence?.receiptCount) !== receiptEvidence.length) {
      fail('manifest receiptEvidence count does not match transactions');
    } else if (!BYTES32_RE.test(String(manifest.receiptEvidence?.evidenceHash || ''))) {
      fail('manifest receiptEvidence is missing its canonical evidenceHash');
    } else pass('manifest carries finalized canonical receipt evidence');
  }

  if (env('BASE_PROTOCOL_DEPLOYMENT_BLOCK') !== String(manifest.deployBlock)) {
    fail('BASE_PROTOCOL_DEPLOYMENT_BLOCK does not match manifest deployBlock');
  } else pass('BASE_PROTOCOL_DEPLOYMENT_BLOCK matches manifest');
}

if (phase === 'predeploy' || phase === 'postdeploy' || phase === 'canary') {
  if (env('PROTOCOL_WRITES_ENABLED') === 'true') {
    fail(`PROTOCOL_WRITES_ENABLED must not be true during ${phase}`);
  } else pass(`automatic protocol writes remain disabled during ${phase}`);
}

if (phase === 'canary' || phase === 'cutover') {
  if (env('VERCEL_ENV') !== 'production') fail('VERCEL_ENV must equal production');
  else pass(`${phase} is scoped to Vercel production`);
  if (env('PROTOCOL_CHAIN') !== 'base') fail('PROTOCOL_CHAIN must equal base');
  else pass('PROTOCOL_CHAIN targets Base');
  if (env('PROTOCOL_WRITE_CHAIN_ID') !== '8453') fail('PROTOCOL_WRITE_CHAIN_ID must equal 8453');
  else pass('write chain confirmation equals 8453');
  requireEnv('BASE_RECORDER_KEY');
  if (env('BASE_RECORDER_KEY') && env('BASE_RECORDER_ADDRESS')) {
    try {
      if (new Wallet(env('BASE_RECORDER_KEY')).address.toLowerCase() !== env('BASE_RECORDER_ADDRESS').toLowerCase()) {
        fail('BASE_RECORDER_KEY does not derive BASE_RECORDER_ADDRESS');
      } else pass('Base recorder key matches its reviewed public address');
    } catch {
      fail('BASE_RECORDER_KEY is not a valid private key');
    }
  }

  requireEnv('PYTH_HERMES_API_KEY');
  const supabaseUrl = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const supabaseServiceKey = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_KEY');
  if (!supabaseUrl) fail('SUPABASE_URL or VITE_SUPABASE_URL is required for the execution-claim preflight');
  if (!supabaseServiceKey) fail('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY is required for the execution-claim preflight');

  if (env('PYTH_HERMES_API_KEY')) {
    try {
      const update = await fetchHermesPriceUpdate({
        feedId: OFFICIAL_BASE_FEEDS.BTC,
        kind: 'latest',
        requireApiKey: true,
        hermesUrl: process.env.PYTH_HERMES_URL || 'https://pyth.dourolabs.app/hermes',
      });
      if (update.feedId.toLowerCase() !== OFFICIAL_BASE_FEEDS.BTC || !update.updateData) {
        fail('Hermes preflight returned unexpected BTC evidence');
      } else pass('authenticated Hermes preflight returned canonical BTC evidence');
    } catch (error) {
      fail(`authenticated Hermes preflight failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (supabaseUrl && supabaseServiceKey) {
    try {
      const url = new URL('/rest/v1/rpc/verify_trade_execution_claims_gate', supabaseUrl);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: '{}',
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) fail(`trade_execution_claims preflight failed (${response.status})`);
      else {
        const rows = await response.json() as Array<Record<string, unknown>>;
        const result = rows[0];
        if (!result || result.rls_enabled !== true || result.anon_denied !== true
          || result.authenticated_denied !== true || result.service_privileges !== true
          || result.round_trip !== true) {
          fail('trade_execution_claims grants, RLS or transactional round trip failed');
        } else pass('trade_execution_claims grants, RLS and insert/update/delete round trip passed');
      }
    } catch (error) {
      fail(`trade_execution_claims preflight failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

if (phase === 'cutover') {
  if (env('PROTOCOL_WRITES_ENABLED') !== 'true') fail('PROTOCOL_WRITES_ENABLED must equal true in the target cutover configuration');
  else pass('target cutover configuration explicitly enables writes');
  requireEnv('BASE_CANARY_COMMIT_TX_HASH', (value) => BYTES32_RE.test(value));
  requireEnv('BASE_CANARY_RESOLVE_TX_HASH', (value) => BYTES32_RE.test(value));
}

if (phase !== 'predeploy') requireEnv('BASE_RPC_URL', (value) => /^https:\/\//i.test(value));

if (
  phase !== 'predeploy' &&
  manifest &&
  validAddress(env('OWNER_SAFE_ADDRESS')) &&
  validAddress(env('OWNER_SAFE_SINGLETON')) &&
  safeOwners.length === 3 &&
  env('BASE_RPC_URL')
) {
  const provider = new JsonRpcProvider(env('BASE_RPC_URL'), 8453, { staticNetwork: true });
  try {
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== 8453) throw new Error(`RPC answered for chain ${network.chainId}`);
    pass('live RPC confirms Base mainnet chain id');

    const safe = env('OWNER_SAFE_ADDRESS');
    const safeCode = await provider.getCode(safe);
    if (safeCode === '0x') fail('OWNER_SAFE_ADDRESS has no live code');
    else if (keccak256(safeCode).toLowerCase() !== env('OWNER_SAFE_CODEHASH').toLowerCase()) {
      fail('live Safe proxy codehash does not match OWNER_SAFE_CODEHASH');
    } else pass('live Safe proxy codehash matches the pin');

    const singletonWord = await provider.getStorage(safe, 0n);
    const liveSingleton = getAddress(`0x${singletonWord.slice(-40)}`);
    if (liveSingleton.toLowerCase() !== env('OWNER_SAFE_SINGLETON').toLowerCase()) {
      fail('live Safe singleton does not match OWNER_SAFE_SINGLETON');
    } else if (await provider.getCode(liveSingleton) === '0x') {
      fail('pinned Safe singleton has no live code');
    } else pass('live Safe singleton matches the pin and has code');

    const safeContract = new Contract(safe, [
      'function getThreshold() view returns (uint256)',
      'function getOwners() view returns (address[])',
      'function getModulesPaginated(address,uint256) view returns (address[],address)',
    ], provider);
    const [liveThreshold, liveOwners, modulePage] = await Promise.all([
      safeContract.getThreshold() as Promise<bigint>,
      safeContract.getOwners() as Promise<string[]>,
      safeContract.getModulesPaginated('0x0000000000000000000000000000000000000001', 10) as Promise<[string[], string]>,
    ]);
    if (liveThreshold !== 2n) fail('live Safe threshold must equal 2');
    else pass('live Safe threshold equals 2');
    const normalizedLiveOwners = liveOwners.map((value) => value.toLowerCase()).sort();
    const normalizedExpectedOwners = safeOwners.map((value) => value.toLowerCase()).sort();
    if (JSON.stringify(normalizedLiveOwners) !== JSON.stringify(normalizedExpectedOwners)) {
      fail('live Safe owners do not match OWNER_SAFE_OWNERS');
    } else pass('live Safe owners match the reviewed 2-of-3 set');
    if (modulePage[0].length !== 0) fail('live Safe has enabled modules');
    else pass('live Safe has no enabled modules');
    const guardWord = await provider.getStorage(safe, id('guard_manager.guard.address'));
    if (BigInt(guardWord) !== 0n) fail('live Safe has a guard configured');
    else pass('live Safe has no guard configured');

    const ownershipAbi = [
      'function owner() view returns (address)',
      'function pendingOwner() view returns (address)',
    ];
    for (const [manifestKey] of Object.entries(addressEnvByManifestKey)) {
      const contractAddress = String(manifest.addresses?.[manifestKey] || '');
      const contract = new Contract(contractAddress, ownershipAbi, provider);
      const [owner, pendingOwner, code] = await Promise.all([
        contract.owner() as Promise<string>,
        contract.pendingOwner() as Promise<string>,
        provider.getCode(contractAddress),
      ]);
      if (code === '0x') fail(`${manifestKey} has no live runtime code`);
      else if (owner.toLowerCase() !== safe.toLowerCase()) fail(`${manifestKey}.owner is not the reviewed Safe`);
      else if (pendingOwner.toLowerCase() !== ZERO_ADDRESS) fail(`${manifestKey}.pendingOwner is not cleared`);
      else pass(`${manifestKey} is live, Safe-owned and has no pending owner`);
    }

    if (phase === 'canary' || phase === 'cutover') {
      const pausableKeys = [
        'trackRecord',
        'convictionOracle',
        'agentEconomyV2',
        'adversarialBounties',
        'hardnessRegistry',
        'intentEscrow',
      ];
      for (const manifestKey of pausableKeys) {
        const contractAddress = String(manifest.addresses?.[manifestKey] || '');
        const pausable = new Contract(contractAddress, ['function paused() view returns (bool)'], provider);
        if (await pausable.paused() as boolean) fail(`${manifestKey} is paused`);
        else pass(`${manifestKey} is unpaused`);
      }
    }

    const hardness = new Contract(String(manifest.addresses?.hardnessRegistry || ''), [
      'function hardnessScorer() view returns (address)',
    ], provider);
    const liveScorer = await hardness.hardnessScorer() as string;
    if (liveScorer.toLowerCase() !== env('HARDNESS_SCORER_ADDRESS').toLowerCase()) {
      fail('live Hardness scorer does not match HARDNESS_SCORER_ADDRESS');
    } else pass('live Hardness scorer matches the reviewed role');

    const trackRecord = new Contract(String(manifest.addresses?.trackRecord || ''), [
      'function bobby() view returns (address)',
      'function params() view returns (uint16,uint16,uint24,uint24,uint16,uint16,uint16)',
      'function activePyth() view returns (address)',
      'function approvedPyth(address) view returns (bool)',
      'function pythActivatableAt(address) view returns (uint64)',
      'function feedOf(bytes32) view returns (bytes32)',
      'function commitIndex(bytes32) view returns (uint256)',
      'function tradeIndex(bytes32) view returns (uint256)',
      'function getCommitment(uint256) view returns (tuple(bytes32 debateHash,uint96 entryPrice,uint96 targetPrice,uint64 committedAt,uint96 stopPrice,address recorder,uint64 minResolveAt,uint8 agent,uint8 conviction,bool resolved,uint8 mode,uint16 entryWindowSec,uint16 exitWindowSec,uint24 maxExitLagSec,uint24 challengeWindowSec,uint16 entryTolBps,uint16 exitTolBps,uint16 confMaxBps,tuple(bytes32 feedId,int64 price,uint64 conf,int32 expo,uint64 publishTime) entryEvidence,string symbol))',
      'function getTrade(uint256) view returns (tuple(bytes32 debateHash,uint96 entryPrice,uint96 exitPrice,uint64 committedAt,uint64 resolvedAt,address recorder,uint8 agent,uint8 conviction,uint8 result,uint8 mode,int256 pnlBps,uint64 exitAt,uint64 challengeDeadline,bool stopChallenged,tuple(bytes32 feedId,int64 price,uint64 conf,int32 expo,uint64 publishTime) entryEvidence,tuple(bytes32 feedId,int64 price,uint64 conf,int32 expo,uint64 publishTime) exitEvidence,string symbol))',
    ], provider);
    const [liveBobby, liveParams, liveActivePyth, latestBlockState] = await Promise.all([
      trackRecord.bobby() as Promise<string>,
      trackRecord.params() as Promise<readonly bigint[]>,
      trackRecord.activePyth() as Promise<string>,
      provider.getBlock('latest'),
    ]);
    if (!latestBlockState) throw new Error('could not read latest Base block');
    const latestBlock = latestBlockState.number;
    const latestBlockTimestamp = BigInt(latestBlockState.timestamp);
    if (liveBobby.toLowerCase() !== env('BASE_RECORDER_ADDRESS').toLowerCase()) {
      fail('live TrackRecord bobby does not equal BASE_RECORDER_ADDRESS');
    } else pass('live TrackRecord authorizes the reviewed recorder');
    const paramKeys = Object.keys(verificationParamEnvByManifestKey);
    for (let index = 0; index < paramKeys.length; index += 1) {
      const key = paramKeys[index];
      if (String(liveParams[index]) !== String(manifest.verificationParams?.[key] ?? '')) {
        fail(`live TrackRecord params.${key} does not match manifest`);
      } else pass(`live TrackRecord params.${key} matches manifest`);
    }
    if (liveActivePyth.toLowerCase() !== OFFICIAL_BASE_PYTHS[0]) {
      fail('live active Pyth is not the pinned official upgraded Base contract');
    } else pass('live active Pyth is the official upgraded Base contract');
    for (const pyth of OFFICIAL_BASE_PYTHS) {
      const [approved, activatableAt, code] = await Promise.all([
        trackRecord.approvedPyth(pyth) as Promise<boolean>,
        trackRecord.pythActivatableAt(pyth) as Promise<bigint>,
        provider.getCode(pyth),
      ]);
      if (code === '0x') fail(`canonical Pyth ${pyth} has no live code`);
      else if (!approved) fail(`canonical Pyth ${pyth} is not approved`);
      else if (activatableAt > latestBlockTimestamp) fail(`canonical Pyth ${pyth} is still timelocked`);
      else pass(`canonical Pyth ${pyth} is code-bearing, approved and immediately activatable`);
    }
    for (const [symbol, officialFeed] of Object.entries(OFFICIAL_BASE_FEEDS)) {
      const liveFeed = String(await trackRecord.feedOf(id(symbol))).toLowerCase();
      if (liveFeed !== officialFeed) fail(`live ${symbol} feed is not the pinned official Pyth feed id`);
      else pass(`live ${symbol} feed matches the pinned official Pyth feed id`);
    }

    for (const receipt of manifest.transactions as Array<Record<string, unknown>>) {
      const liveReceipt = await provider.getTransactionReceipt(String(receipt.hash));
      if (!liveReceipt || liveReceipt.status !== 1 || liveReceipt.blockHash.toLowerCase() !== String(receipt.blockHash).toLowerCase()) {
        fail(`finalized receipt ${String(receipt.hash)} is missing, failed or non-canonical`);
      }
    }
    if (!failures.some((item) => item.startsWith('finalized receipt '))) {
      pass('all finalized deployment receipts remain canonical');
    }

    if (phase === 'cutover' && BYTES32_RE.test(env('BASE_CANARY_COMMIT_TX_HASH')) && BYTES32_RE.test(env('BASE_CANARY_RESOLVE_TX_HASH'))) {
      const canaryInterface = new Interface([
        'function commitTrade(bytes32,string,uint8,uint8,uint96,uint96,uint96,uint8,bytes[])',
        'function resolveTrade(bytes32,int256,uint8,uint96,uint64,bytes[])',
      ]);
      const canaryConfigInterface = new Interface([
        'event FeedSet(bytes32 indexed symbolHash,string symbol,bytes32 feedId)',
        'event PythApproved(address indexed pyth,uint64 activatableAt)',
        'event PythRevoked(address indexed pyth)',
        'event PythActivated(address indexed pyth)',
      ]);
      const configTopics = [
        'FeedSet',
        'PythApproved',
        'PythRevoked',
        'PythActivated',
      ].map((name) => canaryConfigInterface.getEvent(name)!.topicHash);
      const canaryRows = [
        { label: 'commit', hash: env('BASE_CANARY_COMMIT_TX_HASH'), selector: canaryInterface.getFunction('commitTrade')!.selector },
        { label: 'resolve', hash: env('BASE_CANARY_RESOLVE_TX_HASH'), selector: canaryInterface.getFunction('resolveTrade')!.selector },
      ];
      let debateHash = '';
      let canarySymbol = '';
      let previousBlock = 0;
      for (const row of canaryRows) {
        const [receipt, transaction] = await Promise.all([
          provider.getTransactionReceipt(row.hash),
          provider.getTransaction(row.hash),
        ]);
        if (!receipt || !transaction || receipt.status !== 1) {
          fail(`Base canary ${row.label} transaction is missing or failed`);
          continue;
        }
        const parsed = canaryInterface.parseTransaction({ data: transaction.data });
        const rowDebateHash = String(parsed?.args?.[0] || '').toLowerCase();
        const evidenceIndex = row.label === 'commit' ? 8 : 5;
        const evidence = parsed?.args?.[evidenceIndex] as readonly string[] | undefined;
        const isVerifiedCommit = row.label !== 'commit' || Number(parsed?.args?.[7]) === 1;
        const parsedSymbol = row.label === 'commit' ? String(parsed?.args?.[1] || '').toUpperCase() : '';
        const isCanonicalSymbol = row.label !== 'commit' || ['BTC', 'ETH', 'SOL'].includes(parsedSymbol);
        const effectiveSymbol = parsedSymbol || canarySymbol;
        const [historicalPyth, historicalFeed, sameBlockConfigLogs] = effectiveSymbol
          ? await Promise.all([
            trackRecord.activePyth({ blockTag: receipt.blockNumber }) as Promise<string>,
            trackRecord.feedOf(id(effectiveSymbol), { blockTag: receipt.blockNumber }) as Promise<string>,
            provider.getLogs({
              address: String(manifest.addresses?.trackRecord),
              fromBlock: receipt.blockNumber,
              toBlock: receipt.blockNumber,
              topics: [configTopics],
            }),
          ])
          : ['', '', []];
        if (
          transaction.to?.toLowerCase() !== String(manifest.addresses?.trackRecord).toLowerCase() ||
          transaction.from.toLowerCase() !== env('BASE_RECORDER_ADDRESS').toLowerCase() ||
          transaction.data.slice(0, 10).toLowerCase() !== row.selector.toLowerCase()
        ) {
          fail(`Base canary ${row.label} is not the reviewed recorder call to TrackRecordV2`);
        } else if (!isVerifiedCommit) {
          fail('Base canary commit is not VERIFIED mode');
        } else if (!isCanonicalSymbol) {
          fail('Base canary commit symbol is not a canonical BTC/ETH/SOL feed');
        } else if (!evidence || evidence.length === 0) {
          fail(`Base canary ${row.label} does not carry Pyth update evidence`);
        } else if (sameBlockConfigLogs.length !== 0) {
          fail(`Base canary ${row.label} shares a block with Pyth/feed configuration changes`);
        } else if (historicalPyth.toLowerCase() !== OFFICIAL_BASE_PYTHS[0]) {
          fail(`Base canary ${row.label} did not execute against the official upgraded Pyth contract`);
        } else if (historicalFeed.toLowerCase() !== OFFICIAL_BASE_FEEDS[effectiveSymbol]) {
          fail(`Base canary ${row.label} did not use the official ${effectiveSymbol} feed id`);
        } else if (latestBlock - receipt.blockNumber < 12) {
          fail(`Base canary ${row.label} has fewer than 12 confirmations`);
        } else if (previousBlock && receipt.blockNumber < previousBlock) {
          fail('Base canary resolve was mined before its commit');
        } else if (debateHash && rowDebateHash !== debateHash) {
          fail('Base canary commit and resolve use different debate hashes');
        } else {
          debateHash = rowDebateHash;
          if (parsedSymbol) canarySymbol = parsedSymbol;
          previousBlock = receipt.blockNumber;
          pass(`Base canary ${row.label} receipt is canonical and confirmed`);
        }
      }

      if (BYTES32_RE.test(debateHash) && canarySymbol) {
        const [commitPosition, tradePosition, configuredFeed] = await Promise.all([
          trackRecord.commitIndex(debateHash) as Promise<bigint>,
          trackRecord.tradeIndex(debateHash) as Promise<bigint>,
          trackRecord.feedOf(id(canarySymbol)) as Promise<string>,
        ]);
        if (commitPosition === 0n || tradePosition === 0n) {
          fail('Base canary is missing its stored commitment or trade');
        } else {
          const [storedCommitment, storedTrade] = await Promise.all([
            trackRecord.getCommitment(commitPosition - 1n),
            trackRecord.getTrade(tradePosition - 1n),
          ]);
          const commitmentFeed = String(storedCommitment.entryEvidence.feedId).toLowerCase();
          const tradeEntryFeed = String(storedTrade.entryEvidence.feedId).toLowerCase();
          const tradeExitFeed = String(storedTrade.exitEvidence.feedId).toLowerCase();
          const expectedFeed = OFFICIAL_BASE_FEEDS[canarySymbol];
          if (Number(storedCommitment.mode) !== 1 || Number(storedTrade.mode) !== 1) {
            fail('Base canary stored lifecycle is not VERIFIED mode');
          } else if (!storedCommitment.resolved) {
            fail('Base canary stored commitment is not resolved');
          } else if (String(storedCommitment.symbol) !== canarySymbol || String(storedTrade.symbol) !== canarySymbol) {
            fail('Base canary stored symbol does not match transaction calldata');
          } else if (!expectedFeed
            || String(configuredFeed).toLowerCase() !== expectedFeed
            || commitmentFeed !== expectedFeed
            || tradeEntryFeed !== expectedFeed
            || tradeExitFeed !== expectedFeed
            || BigInt(storedCommitment.entryEvidence.publishTime) === 0n
            || BigInt(storedTrade.entryEvidence.publishTime) === 0n
            || BigInt(storedTrade.exitEvidence.publishTime) === 0n) {
            fail('Base canary stored oracle evidence does not match the configured Pyth feed');
          } else {
            pass('Base canary stored VERIFIED lifecycle carries canonical Pyth evidence');
          }
        }
      }
    }
  } catch (error) {
    fail(`live Base ${phase} verification failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    provider.destroy();
  }
}

console.log(`\nBobby Base mainnet readiness — ${phase.toUpperCase()}`);
console.log(`PASS: ${passed.length}`);
for (const item of passed) console.log(`  ok  ${item}`);
if (warnings.length) {
  console.log(`WARN: ${warnings.length}`);
  for (const item of warnings) console.log(`  !   ${item}`);
}
if (failures.length) {
  console.log(`NO-GO: ${failures.length}`);
  for (const item of failures) console.log(`  x   ${item}`);
  process.exitCode = 1;
} else {
  const verdict = phase === 'predeploy'
    ? 'READY: pre-broadcast configuration gates passed'
    : phase === 'postdeploy'
      ? 'READY: live deployment verified; backend remains frozen'
      : phase === 'canary'
        ? 'READY: send the bounded direct on-chain canary while backend writers remain frozen'
        : 'GO: launch configuration and confirmed Base canary passed; promote this exact target environment';
  console.log(verdict);
}
