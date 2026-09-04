import { existsSync, readFileSync } from 'node:fs';
import { Contract, Interface, JsonRpcProvider, Wallet, getAddress, id, keccak256 } from 'ethers';

type Phase = 'predeploy' | 'postdeploy' | 'cutover';

const phaseArg = process.argv.find((arg) => arg.startsWith('--phase='));
const phase = (phaseArg?.split('=')[1] || 'cutover') as Phase;
if (!['predeploy', 'postdeploy', 'cutover'].includes(phase)) {
  throw new Error(`Unknown phase ${phase}; use predeploy, postdeploy, or cutover`);
}

const failures: string[] = [];
const warnings: string[] = [];
const passed: string[] = [];
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

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
// G5: Hermes went key-required on 2026-08-18. Without it the V2 recorder
// cannot fetch signed updates, so every VERIFIED commit/resolve fails — the
// deploy would land a contract the backend cannot feed. Hard NO-GO.
requireEnv('PYTH_HERMES_API_KEY');
if (env('PROTOCOL_CUTOVER_FREEZE') !== 'true') {
  fail('PROTOCOL_CUTOVER_FREEZE must equal true until the launch canary passes');
} else {
  pass('live trading is frozen for the deployment window');
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

for (const name of [
  'FEE_MCP_CALL_WEI',
  'FEE_DEBATE_PER_AGENT_WEI',
  'MIN_BOUNTY_WEI',
  'ABSOLUTE_MIN_BOUNTY_WEI',
  'REGISTRATION_STAKE_WEI',
  'CHALLENGE_BOND_WEI',
] as const) {
  requireEnv(name, positiveUint96);
}

const configuredBountyTreasury = env('BOUNTY_TREASURY_ADDRESS');
if (!validAddress(configuredBountyTreasury)) {
  fail('BOUNTY_TREASURY_ADDRESS is missing or invalid');
} else if (configuredBountyTreasury.toLowerCase() === env('DEPLOYER_ADDRESS').toLowerCase()) {
  fail('BOUNTY_TREASURY_ADDRESS must not equal DEPLOYER_ADDRESS');
} else {
  pass('bounty treasury is explicit and not the deployer');
}

requireEnv('ESCROW_MAX_SIZE_USD', (value) => {
  if (!/^[1-9][0-9]*$/.test(value)) return false;
  try {
    // Codex mainnet review P0-1: the contract compares intent.sizeUsd against
    // this value RAW in 18-dp USD. A human-scale value like "10000" means
    // ~1e-14 USD and bricks every legitimate intent with BadSize. Enforce the
    // scale: minimum $1 (1e18), maximum $100M, both in 18-dp encoding.
    const v = BigInt(value);
    return v >= 10n ** 18n && v <= 100_000_000n * 10n ** 18n;
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

if (positiveUint96(env('CHALLENGE_BOND_WEI')) && positiveUint96(env('ABSOLUTE_MIN_BOUNTY_WEI'))) {
  const challengeBond = BigInt(env('CHALLENGE_BOND_WEI'));
  const bountyFloor = BigInt(env('ABSOLUTE_MIN_BOUNTY_WEI'));
  if (challengeBond < bountyFloor || challengeBond > bountyFloor * 1000n) {
    fail('CHALLENGE_BOND_WEI must be within [ABSOLUTE_MIN_BOUNTY_WEI, 1000 x floor]');
  } else {
    pass('challenge bond is within the on-chain bounds');
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
  challengeBondWei: 'CHALLENGE_BOND_WEI', // Codex r5: one parameter drives both bonds
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
  if (String(manifest.deployer || '').toLowerCase() !== env('DEPLOYER_ADDRESS').toLowerCase()) {
    fail('manifest deployer does not match DEPLOYER_ADDRESS');
  } else pass('manifest deployer matches the reviewed deployer');

  // Codex r5 [P1]: forfeited bonds go to the treasury — it must be the Safe (or an
  // explicitly configured BOUNTY_TREASURY_ADDRESS) and never the deployer EOA.
  const expectedTreasury = (env('BOUNTY_TREASURY_ADDRESS') || env('OWNER_SAFE_ADDRESS')).toLowerCase();
  const manifestTreasury = String(manifest.treasury || '').toLowerCase();
  if (!validAddress(manifestTreasury)) fail('manifest treasury is missing — redeploy with the r5 DeployBase (treasury + challengeBond configured before handoff)');
  else if (manifestTreasury === env('DEPLOYER_ADDRESS').toLowerCase()) fail('manifest treasury is the deployer EOA');
  else if (manifestTreasury !== expectedTreasury) fail('manifest treasury does not match BOUNTY_TREASURY_ADDRESS / OWNER_SAFE_ADDRESS');
  else pass('manifest treasury is the Safe (or the configured BOUNTY_TREASURY_ADDRESS) and not the deployer');

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

  const receiptEvidence = Array.isArray(manifest.transactions) ? manifest.transactions : [];
  if (receiptEvidence.length < 8) {
    fail('manifest must contain live receipt evidence for the full broadcast');
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
  }

  if (env('BASE_PROTOCOL_DEPLOYMENT_BLOCK') !== String(manifest.deployBlock)) {
    fail('BASE_PROTOCOL_DEPLOYMENT_BLOCK does not match manifest deployBlock');
  } else pass('BASE_PROTOCOL_DEPLOYMENT_BLOCK matches manifest');
}

if (phase === 'cutover') {
  if (env('VERCEL_ENV') !== 'production') fail('VERCEL_ENV must equal production');
  else pass('cutover is scoped to Vercel production');
  if (env('PROTOCOL_CHAIN') !== 'base') fail('PROTOCOL_CHAIN must equal base');
  else pass('PROTOCOL_CHAIN targets Base');
  if (env('PROTOCOL_WRITES_ENABLED') !== 'true') fail('PROTOCOL_WRITES_ENABLED must equal true');
  else pass('protocol writes explicitly enabled');
  if (env('PROTOCOL_WRITE_CHAIN_ID') !== '8453') fail('PROTOCOL_WRITE_CHAIN_ID must equal 8453');
  else pass('write chain confirmation equals 8453');
  requireEnv('BASE_RECORDER_KEY');
  requireEnv('BASE_RPC_URL', (value) => /^https:\/\//i.test(value));
  requireEnv('XLAYER_RECORD_SECRET');
  requireEnv('TRADING_API_SECRET');
  requireEnv('PROTOCOL_AUTOMATION_SECRET');
  requireEnv('PYTH_HERMES_API_KEY');
  if (env('BASE_RECORDER_KEY') && env('BASE_RECORDER_ADDRESS')) {
    try {
      if (new Wallet(env('BASE_RECORDER_KEY')).address.toLowerCase() !== env('BASE_RECORDER_ADDRESS').toLowerCase()) {
        fail('BASE_RECORDER_KEY does not derive BASE_RECORDER_ADDRESS');
      } else pass('Base recorder key matches its reviewed public address');
    } catch {
      fail('BASE_RECORDER_KEY is not a valid private key');
    }
  }

  if (
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
        const contract = new Contract(String(manifest.addresses?.[manifestKey] || ''), ownershipAbi, provider);
        const [owner, pendingOwner, code] = await Promise.all([
          contract.owner() as Promise<string>,
          contract.pendingOwner() as Promise<string>,
          provider.getCode(String(manifest.addresses?.[manifestKey] || '')),
        ]);
        if (code === '0x') fail(`${manifestKey} has no live runtime code`);
        else if (owner.toLowerCase() !== safe.toLowerCase()) fail(`${manifestKey}.owner is not the reviewed Safe`);
        else if (pendingOwner.toLowerCase() !== ZERO_ADDRESS) fail(`${manifestKey}.pendingOwner is not cleared`);
        else pass(`${manifestKey} is live, Safe-owned and has no pending owner`);
      }

      const hardness = new Contract(String(manifest.addresses?.hardnessRegistry || ''), [
        'function hardnessScorer() view returns (address)',
      ], provider);
      const liveScorer = await hardness.hardnessScorer() as string;
      if (liveScorer.toLowerCase() !== env('HARDNESS_SCORER_ADDRESS').toLowerCase()) {
        fail('live Hardness scorer does not match HARDNESS_SCORER_ADDRESS');
      } else pass('live Hardness scorer matches the reviewed role');
    } catch (error) {
      fail(`live Base cutover verification failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      provider.destroy();
    }
  }
} else if (env('PROTOCOL_WRITES_ENABLED') === 'true') {
  warnings.push('PROTOCOL_WRITES_ENABLED is already true before the cutover phase');
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
  console.log('GO: configuration gates passed');
}
