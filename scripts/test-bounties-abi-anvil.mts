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
  // Third round (BP-07 lenses): the audit's cited site is the MCP HANDLER, so drive it too.
  process.env.BOBBY_SUPABASE_URL = 'https://dummy.supabase.co';
  process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'dummy-service-key';
  process.env.BOBBY_SUPABASE_ANON_KEY = 'dummy-anon-key';
  process.env.INTERNAL_API_SECRET = 'test-internal-secret';
  process.env.BOBBY_PROTOCOL_BASE_URL = 'https://dummy.bobby';
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith(RPC)) return realFetch(input, init);
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const mcpHttp = (await import('../api/mcp-http.js')).default;
  const challengeTool = async (bountyId: string) => {
    const state: { body?: any } = {};
    const res = { status() { return res; }, json(b: unknown) { state.body = b; return res; }, setHeader() { return res; }, getHeader() { return undefined; }, end() { return res; }, send(b: unknown) { state.body = b; return res; } };
    await mcpHttp({ method: 'POST', query: {}, headers: { 'x-forwarded-for': '203.0.113.10', 'content-type': 'application/json' }, url: '/', body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'bobby_bounty_challenge', arguments: { bounty_id: bountyId, evidence_hash: ethers.keccak256(ethers.toUtf8Bytes(`evidence-${bountyId}`)) } } } } as any, res as any);
    return state.body;
  };
  const clocks = { claimWindow: Number(await truth(owner).defaultClaimWindow()), grace: Number(await truth(owner).challengeGracePeriod()), disputeWindow: Number(await truth(owner).disputeWindow()), settlement: Number(await truth(owner).disputeSettlementTimeout()) };

  // 0. The generated module must BE the artifact's ABI.
  assert.equal(JSON.stringify(ADVERSARIAL_BOUNTIES_ABI), JSON.stringify(artifact.abi), 'api/_lib/adversarial-bounties.abi.ts is stale: run `npm run gen:hardness-abi` after `forge build`');
  console.log(`ok  generated bounties ABI (${(ADVERSARIAL_BOUNTIES_ABI as unknown[]).length} entries) equals the compiled artifact`);

  // 1. Post a bounty; the backend reads it as OPEN with the bond snapshotted at post time.
  await (await truth(poster).postBounty('thread-1', 0, 0, { value: ethers.parseEther('0.01') })).wait();
  let b = await payments.readBounty(1);
  assert.equal(b.status, 'OPEN');
  assert.equal(b.bondWei, MIN_BOUNTY.toString(), 'bond == the challengeBond at post time');
  assert.equal(b.nextDeadline?.action, 'submitChallenge');
  // deadlines are checked against the CONTRACT's clocks, not against the same response
  const onchain1 = await truth(owner).bounties(1);
  const createdAt1 = Number(onchain1[4]);
  assert.equal(b.createdAt, createdAt1);
  assert.equal(b.nextDeadline?.at, createdAt1 + clocks.claimWindow, 'claim deadline = on-chain createdAt + defaultClaimWindow');
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

  // 2b. The MCP HANDLER (the audit's cited site) forwards the bond, and refuses a bounty that does not exist yet.
  const toolOk = await challengeTool('1');
  const unsigned = JSON.parse(toolOk.result.content[0].text);
  assert.equal(unsigned.kind, 'unsigned_tx'); assert.equal(BigInt(unsigned.value), MIN_BOUNTY, 'handler value == bountyBond(1)');
  assert.equal(unsigned.valueWei, MIN_BOUNTY.toString());
  const nextId = String(await payments.readNextBountyId());
  const toolMissing = await challengeTool(nextId);
  assert.ok(toolMissing.error, 'an unposted bounty id is an error, not a 0x0 transaction');
  assert.match(String(toolMissing.error.message), /not found/);
  console.log('ok  MCP bobby_bounty_challenge forwards bountyBond(id); an unposted id is refused (no 0x0 tx)');

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
  assert.equal(b.nextDeadline?.at, createdAt1 + clocks.claimWindow + clocks.grace, 'resolve deadline = createdAt + claimWindow + grace (contract clocks)');
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
  const finalizeAfterOnchain = Number(await truth(owner).resolutionFinalizeAfter(1));
  assert.equal(b.resolutionFinalizeAfter, finalizeAfterOnchain, 'finalize-after equals the contract mapping');
  assert.equal(finalizeAfterOnchain - Number((await truth(owner).resolutionProposedAt(1))), clocks.disputeWindow);
  assert.deepEqual(b.nextDeadline, { action: 'finalizeResolution', at: finalizeAfterOnchain, source: 'resolutionFinalizeAfter' });
  assert.equal(b.winner, await addr(challenger));
  console.log('ok  PENDING_RESOLUTION with resolutionFinalizeAfter');

  await (await truth(poster).disputeResolution(1, { value: MIN_BOUNTY })).wait();
  b = await payments.readBounty(1);
  assert.equal(b.status, 'DISPUTED');
  const settlementOnchain = Number(await truth(owner).settlementAfter(1));
  assert.equal(b.settlementAfter, settlementOnchain, 'settlement-after equals the contract mapping');
  assert.equal(settlementOnchain - Number(await truth(owner).disputedAt(1)), clocks.settlement);
  assert.equal(b.disputedBy, await addr(poster));
  assert.deepEqual(b.nextDeadline, { action: 'resolveStalledDispute', at: settlementOnchain, source: 'settlementAfter' });
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
  await assert.rejects(payments.buildSubmitChallengeCalldata({ bountyId: 99, evidenceHash: evidence }), /not found/, 'the builder fails closed like readBounty');
  await assert.rejects(payments.buildSubmitChallengeCalldata({ bountyId: 1, evidenceHash: evidence }), /RESOLVED; it does not accept challenges/, 'a terminal bounty cannot be challenged through the builder');
  assert.throws(() => payments.encodeSubmitChallenge({ bountyId: 1, evidenceHash: '0x' + '0'.repeat(64) }), /must not be zero/);
  console.log('bounties ABI (anvil) tests passed');
} finally {
  clearTimeout(killer);
  anvil.kill('SIGTERM');
}
