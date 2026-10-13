import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPlan, assertSession, assertMined, digest, DEPLOYER } from './lib/mobile-deploy-plan.mjs';
const original = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const compile = p => buildPlan(p.raw, p.manifest, p.artifacts, p.config);
const baseline = compile(original);
assert.equal(digest(baseline), digest(original.plan));
let count = 1;
function rejects(label, change) {
  const p = structuredClone(original);
  change(p);
  assert.throws(() => compile(p), label);
  count++;
}
rejects('wrong chain', p => { p.raw.transactions[0].transaction.chainId = '0x1'; });
rejects('wrong sender', p => { p.raw.transactions[0].transaction.from = p.manifest.expectedOwner; });
rejects('nonzero transfer', p => { p.raw.transactions[0].transaction.value = '0x1'; });
rejects('skipped nonce', p => { p.raw.transactions[5].transaction.nonce = '0xff'; });
rejects('missing handoff', p => { p.raw.transactions.pop(); });
rejects('extra transaction', p => { p.raw.transactions.push(p.raw.transactions[0]); });
rejects('reordered calls', p => { [p.raw.transactions[8],p.raw.transactions[9]] = [p.raw.transactions[9],p.raw.transactions[8]]; });
rejects('constructor bytecode change', p => { p.raw.transactions[0].transaction.input += '00'; });
rejects('constructor role change', p => { p.config.BOBBY_ADDRESS = p.manifest.expectedOwner; });
rejects('oracle verification parameter change', p => { p.config.V2_ENTRY_WINDOW_SEC = '61'; });
rejects('treasury change', p => { p.raw.transactions[8].transaction.input = p.raw.transactions[7].transaction.input; });
rejects('ownership target change', p => { p.raw.transactions[12].transaction.to = DEPLOYER; });
rejects('creation address change', p => { p.manifest.addresses.trackRecord = DEPLOYER; });
rejects('compiler artifact change', p => { p.artifacts.BobbyTrackRecordV2.bytecode.object += '00'; });
const goodSession = { namespaces: { eip155: { accounts: ['eip155:8453:' + DEPLOYER], methods: ['eth_sendTransaction'] } } };
assertSession(goodSession); count++;
for (const account of ['eip155:1:' + DEPLOYER, 'eip155:8453:' + original.manifest.expectedOwner]) {
  assert.throws(() => assertSession({ namespaces: { eip155: { accounts: [account], methods: ['eth_sendTransaction'] } } })); count++;
}
const t = baseline.transactions[0];
const hash = '0x' + '12'.repeat(32);
const receipt = { status: '0x1', from: DEPLOYER, to: null, transactionHash: hash, contractAddress: t.contractAddress, blockHash: '0x' + 'ab'.repeat(32) };
const live = { chainId: '0x2105', nonce: '0x' + t.nonce.toString(16), from: DEPLOYER, to: null, value: '0x0', input: t.data, hash };
assertMined(t, receipt, live); count++;
for (const change of [r => { r.status = '0x0'; }, r => { r.contractAddress = DEPLOYER; }, r => { r.from = original.manifest.expectedOwner; }, r => { r.transactionHash = '0x' + '34'.repeat(32); }]) {
  const r = structuredClone(receipt); change(r); assert.throws(() => assertMined(t, r, live)); count++;
}
for (const change of [l => { l.input += '00'; }, l => { l.nonce = '0x0'; }, l => { l.chainId = '0x1'; }, l => { l.value = '0x1'; }]) {
  const l = structuredClone(live); change(l); assert.throws(() => assertMined(t, receipt, l)); count++;
}
console.log(`Mobile deployment: ${count} checks passed against the actual Foundry simulation; no live signing.`);
