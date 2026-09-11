import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Interface } from 'ethers';
import { buildPlan, DEPLOYER, SAFE } from './lib/mobile-deploy-plan.mjs';
import { executeStep } from './lib/mobile-deploy-execution.mjs';

const packet = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const plan = buildPlan(packet.raw, packet.manifest, packet.artifacts, packet.config);
let id = 0;
// Intentionally not configurable: this test may send only to local Anvil.
async function rpc(method, params = []) {
  // Anvil suggests a 1-gwei priority fee even on a Base fork. Model a
  // 0.01-gwei Base quote; the EVM still validates the actual requested fees.
  if (method === 'eth_gasPrice') return '0x989680';
  const response = await fetch('http://127.0.0.1:18545', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: AbortSignal.timeout(20000) });
  const body = await response.json();
  if (body.error) throw new Error(JSON.stringify(body.error));
  return body.result;
}
await rpc('anvil_nodeInfo');
const session = { namespaces: { eip155: { accounts: ['eip155:8453:' + DEPLOYER], methods: ['eth_sendTransaction'] } } };
const journal = { transactions: [], receipts: [], attempts: [] };
let sends = 0;
const base = { plan, raw: packet.raw, index: 0, journal, rpc, save: () => {}, getSession: () => session, isHalted: () => false, report: () => {}, send: async request => { sends++; return rpc('eth_sendTransaction', [request]); } };
const guardedRpc = override => async (method, params) => method in override ? override[method] : rpc(method, params);
for (const overrides of [
  { rpc: guardedRpc({ eth_chainId: '0x1' }) },
  { rpc: guardedRpc({ eth_getTransactionCount: '0xff' }) },
  { rpc: guardedRpc({ eth_getCode: '0x01' }) },
  { rpc: guardedRpc({ eth_gasPrice: '0xffffffffff' }) },
  { rpc: guardedRpc({ eth_getBalance: '0x0' }) },
  { isHalted: () => true },
  { save: () => { throw new Error('disk unavailable'); } },
]) {
  const isolatedJournal = { transactions: [], receipts: [], attempts: [] };
  const expected = overrides.save ? /disk unavailable/ : overrides.isHalted ? /Session changed/ : /chain|8453|nonce|occupied|ceiling|Insufficient/i;
  await assert.rejects(() => executeStep({ ...base, journal: isolatedJournal, ...overrides }), expected);
  assert.equal(sends, 0, 'A precondition failure must not reach the wallet');
}
const ambiguous = { transactions: [], receipts: [], attempts: [] };
await assert.rejects(() => executeStep({ ...base, journal: ambiguous, send: async () => { throw new Error('lost wallet response'); } }), /lost wallet response/);
assert.equal(ambiguous.attempts.length, 1, 'Uncertain attempt must remain recorded');
await assert.rejects(() => executeStep({ ...base, journal: ambiguous }));
assert.equal(sends, 0, 'An uncertain request must never be automatically retried');
for (let index = 0; index < 19; index++) {
  await executeStep({ ...base, index });
  console.log(`LOCAL FORK ONLY: ${index + 1}/19 receipt verified`);
}
assert.equal(sends, 19);
assert.equal(journal.receipts.length, 19);
const iface = new Interface(['function owner() view returns(address)', 'function pendingOwner() view returns(address)', 'function acceptOwnership()', 'function activePyth() view returns(address)']);
const readAddress = async (to, name) => iface.decodeFunctionResult(name, await rpc('eth_call', [{ to, data: iface.encodeFunctionData(name) }, 'latest']))[0].toLowerCase();
// Impersonation tests the contract's handoff semantics, not Safe signature
// collection. Fund that synthetic sender only inside this loopback fork.
await rpc('anvil_setBalance', [SAFE, '0x2386f26fc10000']);
for (const tx of plan.transactions.slice(0, 7)) {
  assert.equal(await readAddress(tx.contractAddress, 'owner'), DEPLOYER.toLowerCase());
  assert.equal(await readAddress(tx.contractAddress, 'pendingOwner'), SAFE.toLowerCase());
  await rpc('eth_sendTransaction', [{ from: SAFE, to: tx.contractAddress, data: iface.encodeFunctionData('acceptOwnership'), gas: '0x30000' }]);
  assert.equal(await readAddress(tx.contractAddress, 'owner'), SAFE.toLowerCase());
}
assert.equal(await readAddress(plan.transactions[0].contractAddress, 'activePyth'), '0xbc16aee60f64864882bc6c4e428e148fc0e272f5');
console.log('LOCAL FORK PASS: 19 exact transactions, 7 Safe ownership acceptances, canonical active Pyth; pre-send failures and ambiguous-response retry blocked. No mainnet broadcast.');
