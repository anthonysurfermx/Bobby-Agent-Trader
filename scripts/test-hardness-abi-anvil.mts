// Codex round-3 P1: the backend's hand-written ABI for HardnessRegistry drifted
// from the compiled contract and ethers reverted when decoding the real getters
// ("INVALID_ARGUMENT overflow"). This test deploys the Foundry artifact's
// bytecode on a throwaway anvil and decodes every getter the backend uses with
// the backend's OWN fragment list — so drift fails here, not in production.
//
//   npm run test:hardness-abi-anvil     (needs `forge build` artifacts + anvil)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { ethers } from 'ethers';

const ARTIFACT = 'contracts/out/HardnessRegistry.sol/HardnessRegistry.json';
if (!existsSync(ARTIFACT)) { console.error('test-hardness-abi-anvil: run `forge build` first (artifact missing)'); process.exit(2); }
const artifact = JSON.parse(readFileSync(ARTIFACT, 'utf8')) as { abi: unknown[]; bytecode: { object: string } };

const { HARDNESS_REGISTRY_ABI } = await import('../api/_lib/hardness-registry.js').catch(async (e) => {
  console.error('could not import the backend module:', (e as Error).message); process.exit(2);
});

const PORT = 8545 + Math.floor(Math.random() * 1000);
const anvil = spawn('anvil', ['--port', String(PORT)], { stdio: ['ignore', 'ignore', 'pipe'] });
let anvilErr = '';
anvil.stderr?.on('data', (d) => { anvilErr += String(d); });
// Never hang: a broken anvil or a stuck RPC must fail the test, not stall it.
const killer = setTimeout(() => { console.error('test-hardness-abi-anvil: timed out after 90s', anvilErr.slice(-400)); anvil.kill('SIGTERM'); process.exit(1); }, 90_000);
try {
  const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${PORT}`, 31337, { staticNetwork: true, polling: true });
  provider.pollingInterval = 200;
  let up = false;
  for (let i = 0; i < 100; i++) { try { await provider.getBlockNumber(); up = true; break; } catch { await sleep(100); } }
  if (!up) { console.error('anvil did not come up on port', PORT, anvilErr.slice(-400)); process.exit(1); }
  // anvil's first default account
  // NonceManager: anvil mines instantly and a plain Wallet re-used a nonce after the deploy.
  const deployer = new ethers.NonceManager(new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider));
  const deployerAddress = await deployer.getAddress();
  const resolver = ethers.Wallet.createRandom().address;

  const factory = new ethers.ContractFactory(artifact.abi as ethers.InterfaceAbi, artifact.bytecode.object, deployer);
  const deployed = await factory.deploy([resolver], 1, ethers.parseEther('0.0001'), ethers.parseEther('0.01'), ethers.parseEther('0.001'));
  await deployed.waitForDeployment();
  const address = await deployed.getAddress();

  // Drive state with the TRUE abi, then read it back with the backend's fragments.
  const truth = new ethers.Contract(address, artifact.abi as ethers.InterfaceAbi, deployer);
  await (await truth.registerAgent('ipfs://bobby', { value: ethers.parseEther('0.01') })).wait();
  const h = ethers.keccak256(ethers.toUtf8Bytes('bobby:thread-1'));
  await (await truth.commitPrediction(h, 'BTC-USD', 77, 100_000n * 10n ** 8n, 110_000n * 10n ** 8n, 95_000n * 10n ** 8n)).wait();

  const backend = new ethers.Contract(address, HARDNESS_REGISTRY_ABI as unknown as ethers.InterfaceAbi, provider);

  // 1. agentProfiles — the Codex reproduction: this threw INVALID_ARGUMENT overflow before the fix.
  const profile = await backend.agentProfiles(deployerAddress);
  assert.equal(profile.registered, true);
  assert.equal(profile.stake, ethers.parseEther('0.01'));
  assert.equal(profile.metadataURI, 'ipfs://bobby');
  console.log('ok  agentProfiles decodes with the backend ABI (registered, registeredAt, stake, metadataURI)');

  // 2. getPrediction — hardnessScore sits between entryPrice and targetPrice; a shifted tuple mis-assigns every later field.
  const p = await backend.getPrediction(h);
  assert.equal(p.agent, deployerAddress);
  assert.equal(p.entryPrice, 100_000n * 10n ** 8n);
  assert.equal(p.targetPrice, 110_000n * 10n ** 8n);
  assert.equal(p.stopPrice, 95_000n * 10n ** 8n);
  assert.equal(p.hardnessScore, 0n);
  assert.equal(p.symbol, 'BTC-USD');
  console.log('ok  getPrediction decodes with the backend ABI (hardnessScore in place, later fields aligned)');

  // 3. The generated module must BE the artifact's ABI — byte-for-byte after normalisation.
  assert.equal(JSON.stringify(HARDNESS_REGISTRY_ABI), JSON.stringify(artifact.abi), 'api/_lib/hardness-registry.abi.ts is stale: run `npm run gen:hardness-abi` after `forge build`');
  console.log(`ok  generated ABI (${(HARDNESS_REGISTRY_ABI as unknown[]).length} entries) equals the compiled artifact`);
  console.log('hardness ABI (anvil) tests passed');
} finally {
  clearTimeout(killer);
  anvil.kill('SIGTERM');
}
