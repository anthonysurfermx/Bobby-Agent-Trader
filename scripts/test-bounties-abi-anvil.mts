// BP-07 (2026-09-04 review): the MCP bounty tools decoded a hand-written
// 4-status enum and handed out an unsigned submitChallenge tx with value 0x0 —
// the contract requires msg.value == bountyBond(id), so every challenge built
// by the tool reverted. This test deploys the compiled BobbyAdversarialBounties
// on a throwaway anvil and drives the backend's OWN readers/builders against it:
// the built tx must succeed as-is, a later global bond change must not alter
// it, and all six statuses (with their deadlines) must round-trip.
//
//   npm run test:bounties-abi-anvil     (needs `forge build` artifacts + anvil)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { ethers } from 'ethers';

const ARTIFACT = 'contracts/out/BobbyAdversarialBounties.sol/BobbyAdversarialBounties.json';
if (!existsSync(ARTIFACT)) { console.error('test-bounties-abi-anvil: run `forge build` first (artifact missing)'); process.exit(2); }
const artifact = JSON.parse(readFileSync(ARTIFACT, 'utf8')) as { abi: unknown[]; bytecode: { object: string } };

const PORT = 8545 + Math.floor(Math.random() * 1000);
const RPC = `http://127.0.0.1:${PORT}`;
const anvil = spawn('anvil', ['--port', String(PORT), '--quiet'], { stdio: ['ignore', 'ignore', 'pipe'] });
let anvilErr = '';
anvil.stderr?.on('data', (d) => { anvilErr += String(d); });
const killer = setTimeout(() => { console.error('test-bounties-abi-anvil: timed out after 120s', anvilErr.slice(-400)); anvil.kill('SIGTERM'); process.exit(1); }, 120_000);

// anvil's deterministic accounts
const KEYS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
];

try {
  const provider = new ethers.JsonRpcProvider(RPC, 31337, { staticNetwork: true, polling: true });
  provider.pollingInterval = 200;
  let up = false;
  for (let i = 0; i < 100; i++) { try { await provider.getBlockNumber(); up = true; break; } catch { await sleep(100); } }
  if (!up) { console.error('anvil did not come up on port', PORT, anvilErr.slice(-400)); process.exit(1); }

  const [owner, resolver, poster, challenger, challenger2] = KEYS.map((k) => new ethers.NonceManager(new ethers.Wallet(k, provider)));
  const addr = async (s: ethers.NonceManager) => (await s.getAddress()).toLowerCase();

  const ABS_MIN = ethers.parseEther('0.0001');
  const MIN_BOUNTY = ethers.parseEther('0.001'); // constructor sets challengeBond = minBounty
  const factory = new ethers.ContractFactory(artifact.abi as ethers.InterfaceAbi, artifact.bytecode.object, owner);
  const deployed = await factory.deploy(await resolver.getAddress(), ABS_MIN, MIN_BOUNTY);
  await deployed.waitForDeployment();
  const address = await deployed.getAddress();
  const truth = (signer: ethers.NonceManager) => new ethers.Contract(address, artifact.abi as ethers.InterfaceAbi, signer);

  // Point the backend at THIS deployment before its modules evaluate their constants.
  process.env.PROTOCOL_CHAIN = 'base';
  process.env.BASE_RPC_URL = RPC;
  process.env.BASE_RPC_FALLBACK_URL = RPC;
  process.env.BASE_BOUNTIES_ADDRESS = address;
  const payments = await import('../api/_lib/protocol-payments.js');
  const { ADVERSARIAL_BOUNTIES_ABI } = await import('../api/_lib/adversarial-bounties.abi.js');

  // 0. The generated module must BE the artifact's ABI.
  assert.equal(JSON.stringify(ADVERSARIAL_BOUNTIES_ABI), JSON.stringify(artifact.abi), 'api/_lib/adversarial-bounties.abi.ts is stale: run `npm run gen:hardness-abi` after `forge build`');
  console.log(`ok  generated bounties ABI (${(ADVERSARIAL_BOUNTIES_ABI as unknown[]).length} entries) equals the compiled artifact`);

  // 1. Post a bounty; the backend reads it as OPEN with the bond snapshotted at post time.
  await (await truth(poster).postBounty('thread-1', 0, 0, { value: ethers.parseEther('0.01') })).wait();
  let b = await payments.readBounty(1);
  assert.equal(b.status, 'OPEN');
  assert.equal(b.bondWei, MIN_BOUNTY.toString(), 'bond == the challengeBond at post time');
  assert.equal(b.nextDeadline?.action, 'submitChallenge');
  assert.equal(b.nextDeadline?.at, b.createdAt + b.claimWindowSecs);
  assert.equal(b.poster, await addr(poster));
  console.log('ok  readBounty: OPEN, bondWei from bountyBond(id), claim-window deadline');

  // 2. The reproduction: the old tool handed out value 0x0 → the contract reverts.
  const evidence = ethers.keccak256(ethers.toUtf8Bytes('evidence-1'));
  const encoded = payments.encodeSubmitChallenge({ bountyId: 1, evidenceHash: evidence });
  // Simulated (eth_call) so the revert leaves no nonce side effects on the signer.
  await assert.rejects(
    provider.call({ from: await challenger.getAddress(), to: encoded.to, data: encoded.data, value: 0n }),
    (e: unknown) => /Challenge bond required/.test(String((e as Error).message)),
    'reproduction: a challenge tx without the bond reverts',
  );
  console.log('ok  reproduction: submitChallenge with value 0x0 reverts (Challenge bond required)');

  // 3. The fixed builder carries the bond; the tx succeeds AS BUILT.
  const built = await payments.buildSubmitChallengeCalldata({ bountyId: 1, evidenceHash: evidence });
  assert.equal(built.to.toLowerCase(), address.toLowerCase());
  assert.equal(BigInt(built.value), MIN_BOUNTY);
  assert.equal(built.valueWei, MIN_BOUNTY.toString());
  const rc = await (await challenger.sendTransaction({ to: built.to, data: built.data, value: BigInt(built.value) })).wait();
  assert.equal(rc?.status, 1);
  b = await payments.readBounty(1);
  assert.equal(b.status, 'CHALLENGED');
  assert.equal(b.challengeCount, 1);
  assert.equal(b.nextDeadline?.action, 'resolveBounty');
  assert.equal(b.nextDeadline?.source, 'claimWindow+grace');
  assert.equal(b.effectiveExpiry, b.nextDeadline?.at);
  console.log('ok  built challenge tx (value = bountyBond) mines; status CHALLENGED with resolve deadline');

  // 4. A later global bond change does NOT change bounty 1's price; a new bounty takes the new bond.
  await (await truth(owner).setChallengeBond(MIN_BOUNTY * 2n)).wait();
  const builtAfter = await payments.buildSubmitChallengeCalldata({ bountyId: 1, evidenceHash: ethers.keccak256(ethers.toUtf8Bytes('evidence-2')) });
  assert.equal(BigInt(builtAfter.value), MIN_BOUNTY, 'bond for an existing bounty is the post-time snapshot');
  const rc2 = await (await challenger2.sendTransaction({ to: builtAfter.to, data: builtAfter.data, value: BigInt(builtAfter.value) })).wait();
  assert.equal(rc2?.status, 1);
  await (await truth(poster).postBounty('thread-2', 1, 3600, { value: ethers.parseEther('0.01') })).wait();
  const b2 = await payments.readBounty(2);
  assert.equal(b2.bondWei, (MIN_BOUNTY * 2n).toString(), 'a bounty posted after the change carries the new bond');
  assert.equal(b2.dimension, 'ADVERSARIAL_QUALITY');
  console.log('ok  global setChallengeBond does not reprice bounty 1; bounty 2 carries the new bond');

  // 5. Optimistic resolution states round-trip with their deadlines.
  await (await truth(resolver).resolveBounty(1, await challenger.getAddress())).wait();
  b = await payments.readBounty(1);
  assert.equal(b.status, 'PENDING_RESOLUTION');
  assert.ok(b.resolutionFinalizeAfter && b.resolutionFinalizeAfter > b.createdAt);
  assert.deepEqual(b.nextDeadline, { action: 'finalizeResolution', at: b.resolutionFinalizeAfter, source: 'resolutionFinalizeAfter' });
  assert.equal(b.winner, await addr(challenger));
  console.log('ok  PENDING_RESOLUTION with resolutionFinalizeAfter');

  await (await truth(poster).disputeResolution(1, { value: MIN_BOUNTY })).wait();
  b = await payments.readBounty(1);
  assert.equal(b.status, 'DISPUTED');
  assert.ok(b.settlementAfter && b.settlementAfter > b.createdAt);
  assert.equal(b.disputedBy, await addr(poster));
  assert.deepEqual(b.nextDeadline, { action: 'resolveStalledDispute', at: b.settlementAfter, source: 'settlementAfter' });
  console.log('ok  DISPUTED with settlementAfter and disputedBy');

  await (await truth(owner).settleDispute(1, await challenger2.getAddress())).wait();
  b = await payments.readBounty(1);
  assert.equal(b.status, 'RESOLVED');
  assert.equal(b.winner, await addr(challenger2));
  assert.equal(b.nextDeadline, null, 'terminal state has no deadline');
  console.log('ok  RESOLVED (terminal, no deadline)');

  // 6. WITHDRAWN: bounty 2 (1h window) after the window elapses.
  await provider.send('evm_increaseTime', [3600 + 1]);
  await provider.send('evm_mine', []);
  await (await truth(poster).withdrawBounty(2)).wait();
  const b2w = await payments.readBounty(2);
  assert.equal(b2w.status, 'WITHDRAWN');
  assert.equal(b2w.nextDeadline, null);
  console.log('ok  WITHDRAWN (terminal, no deadline)');

  // 7. listRecentBounties carries the new fields for every row.
  const list = await payments.listRecentBounties(5);
  assert.equal(list.length, 2);
  for (const row of list) { assert.ok(/^[1-9][0-9]*$/.test(row.bondWei)); assert.ok(payments.BOUNTY_STATUS_NAMES.includes(row.status as never)); }
  console.log('ok  listRecentBounties: every row carries bondWei and a named status');

  // 8. Not-found stays an error, and a zero evidence hash is refused before any chain read.
  await assert.rejects(payments.readBounty(99), /not found/);
  assert.throws(() => payments.encodeSubmitChallenge({ bountyId: 1, evidenceHash: '0x' + '0'.repeat(64) }), /must not be zero/);
  console.log('bounties ABI (anvil) tests passed');
} finally {
  clearTimeout(killer);
  anvil.kill('SIGTERM');
}
